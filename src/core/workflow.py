import os
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

from langgraph.graph import END, START, StateGraph

from src.agents import (
    biographer,
    context_analyst,
    critic,
    editor,
    historian,
    orchestrator,
    philosopher,
)
from src.core.state import AgentState
from src.utils.config import load_config
from src.utils.content_quality import run_content_quality_checks
from src.utils.logger import get_logger, make_log_path
from src.utils.markdown import save_markdown
from src.utils.quality import run_quality_checks  # legacy：build_workflow 兜底用

# --- Soul Injection（文风注入 / 终审）可选节点 ---------------------------------
# 配置开关：SOUL_INJECTION_ENABLED=1 开启（默认），=0 关闭走原管线。
SOUL_INJECTION_ENABLED = os.environ.get("SOUL_INJECTION_ENABLED", "1") == "1"

_module_logger = get_logger("deep_reading.workflow")

try:
    from src.agents.tone_setter import ToneSetterAgent
    _TONE_SETTER_AVAILABLE = True
except ImportError as exc:  # 另一个 agent 尚未创建该文件时兜底
    _TONE_SETTER_AVAILABLE = False
    _module_logger.warning("ToneSetterAgent 未就绪（%s），tone_setter 节点将跳过", exc)

try:
    from src.agents.chief_editor import ChiefEditorAgent
    _CHIEF_EDITOR_AVAILABLE = True
except ImportError as exc:  # 另一个 agent 尚未创建该文件时兜底
    _CHIEF_EDITOR_AVAILABLE = False
    _module_logger.warning("ChiefEditorAgent 未就绪（%s），chief_editor 节点将跳过", exc)

# 阶段3：archetype 分桶——结构模板 + soul injection 按桶路由。
# 详见 docs/archetype-design/design.md §10、§10.6
# fiction 桶待落地，阶段3 不接入。
_VALID_ARCHETYPES = {"narrative", "modern", "knowledge"}

# --- 反馈循环第一档：评分落盘辅助函数 -----------------------------------
# 详见 docs/feedback-loop/design.md §4.1
# - _inject_quality_frontmatter：把 quality_score / quality_dimensions 注入单篇 frontmatter
# - _update_meta_score：扫描 book_dir 下所有 .md 重算 avg/min 写回 _meta.yaml
# - _append_score_history：append 一条评分记录到 docs/reviews/score_history_{book}.yaml
_FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)


def _sanitize_filename(name: str) -> str:
    """简单文件名安全化（与 markdown.py 同语义，避免跨模块导入私有函数）。"""
    if not name:
        return "untitled"
    safe = name.strip().replace("/", "_").replace("\\", "_").replace("..", "_")
    return safe.strip("_") or "untitled"


def _inject_quality_frontmatter(
    content: str, score: int, dimensions: Dict[str, int]
) -> str:
    """在 frontmatter 末尾追加 quality_score / quality_dimensions 字段。

    若 content 无 frontmatter（如 stub 占位笔记），原样返回。
    若已存在字段，不重复注入（幂等）。
    """
    match = _FRONTMATTER_RE.match(content)
    if not match:
        return content
    fm_body = match.group(1)
    existing_keys = {
        line.split(":", 1)[0].strip()
        for line in fm_body.splitlines()
        if ":" in line
    }
    additions = []
    if "quality_score" not in existing_keys:
        additions.append(f"quality_score: {score}")
    if "quality_dimensions" not in existing_keys:
        additions.append("quality_dimensions:")
        for k, v in dimensions.items():
            additions.append(f"  {k}: {v}")
    if not additions:
        return content
    new_fm = fm_body.rstrip("\n") + "\n" + "\n".join(additions) + "\n"
    return content[: match.start(1)] + new_fm + content[match.end(1):]


def _collect_book_scores(book_dir: Path) -> list:
    """扫描 book_dir 下所有 *.md 的 quality_score，返回整数列表。"""
    import yaml  # 延迟导入：PyYAML 是项目依赖但仅在落盘时需要

    scores = []
    for md_path in book_dir.glob("*.md"):
        try:
            text = md_path.read_text(encoding="utf-8")
        except OSError:
            continue
        m = _FRONTMATTER_RE.match(text)
        if not m:
            continue
        try:
            fm = yaml.safe_load(m.group(1)) or {}
        except yaml.YAMLError:
            continue
        s = fm.get("quality_score")
        if isinstance(s, (int, float)) and not isinstance(s, bool):
            scores.append(int(s))
    return scores


def _update_meta_score(book_dir: Path) -> None:
    """更新书级 _meta.yaml 的 avg_score / min_score 聚合字段。

    仅当 _meta.yaml 已存在时更新（不主动新建）。
    build_site.py 的 _load_book_meta 只读 6 个 key，新增字段不影响站点构建。
    """
    import yaml  # 延迟导入：PyYAML 是项目依赖但仅在落盘时需要

    meta_path = book_dir / "_meta.yaml"
    if not meta_path.exists():
        return
    try:
        meta = yaml.safe_load(meta_path.read_text(encoding="utf-8")) or {}
        if not isinstance(meta, dict):
            meta = {}
    except yaml.YAMLError:
        meta = {}

    scores = _collect_book_scores(book_dir)
    if scores:
        meta["avg_score"] = round(sum(scores) / len(scores), 1)
        meta["min_score"] = min(scores)
    else:
        meta.pop("avg_score", None)
        meta.pop("min_score", None)

    tmp = meta_path.with_suffix(".tmp")
    tmp.write_text(
        yaml.safe_dump(meta, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    tmp.replace(meta_path)


def _append_score_history(
    book: str,
    chapter: str,
    event: str,
    archetype: str,
    score: int,
    dimensions: Dict[str, int],
    reviews_dir: Path,
) -> None:
    """append 一条评分记录到 docs/reviews/score_history_{book}.yaml。

    使用 yaml 多文档格式（--- 分隔），每条一个 document，
    后续可用 yaml.safe_load_all 读取做趋势分析。
    灵魂维度已补齐 §9.2/9.3/9.4 自动算分（content_quality.py _check_soul_dimension），
    §9.1 三问仍需人工，记录 soul_issues 数量供人工补分参考。
    """
    import yaml  # 延迟导入：PyYAML 是项目依赖但仅在落盘时需要

    reviews_dir.mkdir(parents=True, exist_ok=True)
    safe_book = _sanitize_filename(book)
    history_path = reviews_dir / f"score_history_{safe_book}.yaml"
    soul_issues = dimensions.get("soul", 0)
    record = {
        "date": datetime.now().astimezone().replace(microsecond=0).isoformat(),
        "book": book,
        "chapter": chapter,
        "event": event,
        "archetype": archetype,
        "score": score,
        "dimensions": dimensions,
        "soul_auto_issues": soul_issues,
        "soul_note": (
            "灵魂维度已自动算分（§9.2 套话/§9.3 数字/§9.4 标题）；"
            "§9.1 三问（活人测试/洞察独家性/底色敬畏感）仍需人工评分"
        ),
    }
    with history_path.open("a", encoding="utf-8") as f:
        f.write("---\n")
        yaml.safe_dump(
            record, f, allow_unicode=True, sort_keys=False, default_flow_style=False
        )

# 阶段1/2 已落地 AgentState.archetype；阶段3 在此消费它。
_LEGACY_REQUIRED_SECTIONS = [
    "讲事情", "讲人物", "讲背景", "讲道理", "问道悟道", "结语",
]


def get_required_sections(archetype: str) -> list:
    """按 archetype 返回 required_sections（design.md §10）。

    纯函数：读 config.section_templates；缺失则 fallback 到
    quality_check.required_sections；非法 archetype 兜底 narrative。
    """
    if archetype not in _VALID_ARCHETYPES:
        archetype = "narrative"
    cfg = load_config()
    templates = cfg.get("section_templates", {}) if isinstance(cfg, dict) else {}
    if isinstance(templates, dict) and archetype in templates:
        return list(templates[archetype])
    # fallback：narrative 桶用 quality_check.required_sections（古籍零回归护栏）
    qc = cfg.get("quality_check", {}) if isinstance(cfg, dict) else {}
    return list(qc.get("required_sections", _LEGACY_REQUIRED_SECTIONS))


def _soul_injection_for_archetype(archetype: str) -> bool:
    """三桶均启用 tone_setter/chief_editor（design.md §10.6，阶段4 边链裁剪后）。

    阶段3 仅 narrative 启用，因 modern/knowledge prompt 未建 + 边链未裁剪；
    阶段4 落地 modern/knowledge 版 prompt + 按桶裁剪 specialist 后三桶均启用。
    非法 archetype 兜底 False（不启用）。
    """
    return (
        archetype in _VALID_ARCHETYPES
        and SOUL_INJECTION_ENABLED
        and _TONE_SETTER_AVAILABLE
        and _CHIEF_EDITOR_AVAILABLE
    )


def build_workflow(
    output_base: Optional[str] = None, archetype: str = "narrative"
) -> StateGraph:
    if archetype not in _VALID_ARCHETYPES:
        raise ValueError(
            f"非法 archetype: {archetype!r}，合法值: {sorted(_VALID_ARCHETYPES)}"
        )
    if output_base is None:
        cfg = load_config()
        output_base = cfg.get("output_dir") or cfg.get("output", {}).get("base_dir", "output")

    logger = get_logger("deep_reading.workflow")

    # 阶段3：按 archetype 决定 soul injection 启用与否 + 结构模板段名（闭包捕获）
    use_soul_injection = _soul_injection_for_archetype(archetype)
    required_sections = get_required_sections(archetype)

    graph = StateGraph(AgentState)

    def orchestrator_node(state: AgentState) -> dict:
        logger.info("Orchestrator 解析输入...")
        return orchestrator.run(state)

    def tone_setter_node(state: AgentState) -> dict:
        """文风设定节点：在 Specialist 并行前注入统一文风设定。"""
        logger.info("ToneSetter 注入文风设定中...")
        try:
            agent = ToneSetterAgent()
            return agent.run(state)
        except Exception as exc:
            logger.warning("ToneSetter 执行失败，跳过：%s", exc)
            return {}

    def historian_node(state: AgentState) -> dict:
        logger.info("史料专家生成中...")
        return historian.run(state)

    def biographer_node(state: AgentState) -> dict:
        logger.info("人物专家生成中...")
        return biographer.run(state)

    def context_analyst_node(state: AgentState) -> dict:
        logger.info("背景专家生成中...")
        return context_analyst.run(state)

    def critic_node(state: AgentState) -> dict:
        logger.info("名家专家生成中...")
        return critic.run(state)

    def philosopher_node(state: AgentState) -> dict:
        logger.info("悟道专家生成中...")
        return philosopher.run(state)

    def editor_node(state: AgentState) -> dict:
        logger.info("编辑专家汇总润色中...")
        return editor.run(state)

    def quality_node(state: AgentState) -> dict:
        """质量检查节点：跑带 score 的 content_quality 引擎，回灌 score 到 state。

        换接口前调 legacy run_quality_checks（无 score），现换 run_content_quality_checks
        反馈循环第一档接线点（feedback-loop/design.md §4.1）。
        """
        content = state.get("final_markdown", "")
        archetype = state.get("archetype", "narrative")
        report = run_content_quality_checks(content, archetype=archetype)
        if report.passed:
            logger.info("质量检查通过（score=%d）", report.score)
        else:
            logger.warning(
                "质量检查发现问题（score=%d）：%s",
                report.score,
                "; ".join(report.issues),
            )
        return {
            "errors": report.issues,
            "quality_score": report.score,
            "quality_dimensions": {
                k: len(v) for k, v in report.details.items()
            },
        }

    def chief_editor_node(state: AgentState) -> dict:
        """终审节点：试点期仅打标记，不阻断保存。"""
        logger.info("ChiefEditor 终审中...")
        try:
            agent = ChiefEditorAgent()
            result = agent.run(state) or {}
            verdict = (
                result.get("chief_editor_verdict")
                or result.get("verdict")
                or ""
            )
            verdict_upper = str(verdict).upper()
            if verdict_upper in ("REWORK", "REJECT"):
                logger.warning(
                    "ChiefEditor 判定 %s（试点期仅打标记，不阻断，继续保存）",
                    verdict_upper,
                )
            return result
        except Exception as exc:
            logger.warning("ChiefEditor 执行失败，跳过：%s", exc)
            return {}

    def quality_router(state: AgentState) -> str:
        """根据质量检查结果决定下一步：通过则进入终审/保存，失败则结束。"""
        if state.get("errors"):
            logger.warning("质量检查未通过，跳过保存")
            return END
        return "chief_editor" if use_soul_injection else "save"

    def save_node(state: AgentState) -> dict:
        # 记录日志
        event = state.get("event", "unknown")
        cfg = load_config()
        logs_dir = cfg.get("logs", {}).get("base_dir", "logs")
        log_path = make_log_path(logs_dir, event)
        quality_score = state.get("quality_score", 0)
        try:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            log_path.write_text(
                f"书名: {state.get('book', '')}\n"
                f"章节: {state.get('chapter', '')}\n"
                f"事件: {state.get('event', '')}\n"
                f"输出: {state.get('output_path', '')}\n"
                f"质量评分: {quality_score}\n"
                f"质量问题: {state.get('errors', [])}\n",
                encoding="utf-8",
            )
        except Exception as exc:
            logger.warning("无法写入日志文件 %s: %s", log_path, exc)

        # 反馈循环第一档：注入 quality_score / quality_dimensions 到 frontmatter
        quality_dimensions = state.get("quality_dimensions", {})
        content_with_score = _inject_quality_frontmatter(
            state["final_markdown"], quality_score, quality_dimensions
        )

        path = save_markdown(
            book=state["book"],
            chapter=state["chapter"],
            event=state["event"],
            content=content_with_score,
            base_dir=output_base,
        )
        logger.info("笔记已保存至 %s（score=%d）", path, quality_score)

        # 更新书级 _meta.yaml 的 avg/min 聚合
        try:
            book_dir = Path(output_base) / _sanitize_filename(state["book"])
            _update_meta_score(book_dir)
        except Exception as exc:
            logger.warning("更新 _meta.yaml 聚合分数失败：%s", exc)

        # append 评分历史到 docs/reviews/score_history_{book}.yaml
        try:
            reviews_dir = Path("docs/reviews")
            _append_score_history(
                book=state["book"],
                chapter=state["chapter"],
                event=state["event"],
                archetype=state.get("archetype", "narrative"),
                score=quality_score,
                dimensions=quality_dimensions,
                reviews_dir=reviews_dir,
            )
        except Exception as exc:
            logger.warning("追加评分历史失败：%s", exc)

        return {"output_path": str(path)}

    # 阶段4 边链裁剪：按 archetype 从 SECTION_TEMPLATES 反查需要的 specialist
    # 名单（去重，去掉 editor 汇总节点）。narrative=5, modern=3, knowledge=3。
    section_map = editor.SECTION_TEMPLATES.get(
        archetype, editor.SECTION_TEMPLATES["narrative"]
    )
    needed_specialists = sorted({
        agent for agent in section_map.values() if agent != "editor"
    })

    # specialist 节点函数映射（按需注册；未在 archetype 段映射中的不注册）
    specialist_fns = {
        "historian": historian_node,
        "biographer": biographer_node,
        "context_analyst": context_analyst_node,
        "critic": critic_node,
        "philosopher": philosopher_node,
    }

    graph.add_node("orchestrator", orchestrator_node)
    if use_soul_injection:
        graph.add_node("tone_setter", tone_setter_node)
    for spec_name in needed_specialists:
        graph.add_node(spec_name, specialist_fns[spec_name])
    graph.add_node("editor", editor_node)
    graph.add_node("quality", quality_node)
    if use_soul_injection:
        graph.add_node("chief_editor", chief_editor_node)
    graph.add_node("save", save_node)

    graph.add_edge(START, "orchestrator")
    if use_soul_injection:
        # orchestrator → tone_setter(串行注入) → Specialist(并行扇出)
        graph.add_edge("orchestrator", "tone_setter")
        fan_out_src = "tone_setter"
    else:
        # 原管线：orchestrator 直连 Specialist
        fan_out_src = "orchestrator"
    for spec_name in needed_specialists:
        graph.add_edge(fan_out_src, spec_name)
        graph.add_edge(spec_name, "editor")
    graph.add_edge("editor", "quality")
    graph.add_conditional_edges("quality", quality_router)
    if use_soul_injection:
        # quality(通过) → chief_editor → save
        graph.add_edge("chief_editor", "save")
    graph.add_edge("save", END)

    return graph.compile()
