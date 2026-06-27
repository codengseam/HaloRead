import os
import tempfile
from pathlib import Path

import pytest

# 依赖 langgraph；无 langgraph 时优雅 skip，避免收集期 ImportError 中断 pytest（BUG-031 同源修复）。
pytest.importorskip("langgraph")

import src.core.workflow as workflow_module  # noqa: E402
from src.core.workflow import build_workflow  # noqa: E402


def test_workflow_compiles():
    app = build_workflow()
    assert app is not None


def test_workflow_quality_gate_blocks_save(monkeypatch):
    """质量检查不通过时，不应保存文件。

    quality_node 已换 run_content_quality_checks（反馈循环第一档），
    mock 需带 score / details 字段匹配 ContentQualityReport 接口。
    """

    class FailingReport:
        passed = False
        score = 60
        issues = ["强制失败：结构不完整"]
        details = {"truth": ["强制失败"], "readability": [], "sequence": [], "citation": [], "soul": []}

    def fake_quality_checks(*args, **kwargs):
        return FailingReport()

    monkeypatch.setattr(workflow_module, "run_content_quality_checks", fake_quality_checks)

    with tempfile.TemporaryDirectory() as tmpdir:
        app = build_workflow(output_base=tmpdir)
        initial_state = {
            "book": "资治通鉴",
            "chapter": "周纪二",
            "event": "商鞅变法",
            "archetype": "narrative",
            "user_input": "",
            "output_path": "",
            "sections": {},
            "sources": {},
            "final_markdown": "占位内容，不应被保存。",
            "errors": [],
        }

        final_state = app.invoke(initial_state)

        # 质量检查应发现问题
        assert final_state["errors"], "预期质量检查应报告问题"
        # save 节点未执行，tmpdir 下不应出现生成的笔记文件
        generated_files = list(Path(tmpdir).rglob("*.md"))
        assert not generated_files, (
            f"质量检查未通过不应保存文件，但生成: {generated_files}"
        )


def test_workflow_quality_score_persists_to_frontmatter(monkeypatch):
    """质检通过时，score 应注入 frontmatter、_meta.yaml 聚合、追加 score_history。

    反馈循环第一档核心断言（feedback-loop/design.md §4.1）。
    """

    class PassingReport:
        passed = True
        score = 92
        issues = []
        details = {"truth": [], "readability": ["小问题"], "sequence": [], "citation": [], "soul": []}

    def fake_quality_checks(*args, **kwargs):
        return PassingReport()

    monkeypatch.setattr(workflow_module, "run_content_quality_checks", fake_quality_checks)
    # 关掉 soul injection 走最短路径 quality → save
    monkeypatch.setattr(workflow_module, "SOUL_INJECTION_ENABLED", False)
    monkeypatch.setattr(workflow_module, "_TONE_SETTER_AVAILABLE", False)
    monkeypatch.setattr(workflow_module, "_CHIEF_EDITOR_AVAILABLE", False)

    with tempfile.TemporaryDirectory() as tmpdir:
        app = build_workflow(output_base=tmpdir)
        initial_state = {
            "book": "测试书",
            "chapter": "测试章",
            "event": "测试事件",
            "archetype": "narrative",
            "user_input": "",
            "output_path": "",
            "sections": {},
            "sources": {},
            "final_markdown": (
                "---\n"
                'title: "测试标题"\n'
                'book: "测试书"\n'
                'chapter: "测试章"\n'
                'event: "测试事件"\n'
                'created_at: "2026-06-27T00:00:00+08:00"\n'
                "source_agents:\n"
                "  - historian\n"
                "---\n\n"
                "## 讲事情\n内容占位\n\n"
                "## 讲人物\n内容占位\n\n"
                "## 讲背景\n内容占位\n\n"
                "## 讲道理\n内容占位\n\n"
                "## 问道悟道\n内容占位\n\n"
                "## 结语\n内容占位\n"
            ),
            "errors": [],
        }

        final_state = app.invoke(initial_state)

        # 1. score 应回灌到 state
        assert final_state.get("quality_score") == 92, "score 应回灌到 state"
        assert "quality_dimensions" in final_state, "dimensions 应回灌到 state"
        assert "soul" in final_state["quality_dimensions"], "dimensions 应含 soul 维度"

        # 2. 单篇 .md 的 frontmatter 应包含 quality_score
        generated = list(Path(tmpdir).rglob("*.md"))
        assert len(generated) == 1, f"应生成 1 篇 .md，实际: {generated}"
        md_text = generated[0].read_text(encoding="utf-8")
        assert "quality_score: 92" in md_text, "frontmatter 应注入 quality_score"
        assert "quality_dimensions:" in md_text, "frontmatter 应注入 quality_dimensions"

        # 3. score_history yaml 应追加一条记录
        history_files = list(Path("docs/reviews").glob("score_history_测试书.yaml"))
        assert history_files, "应生成 docs/reviews/score_history_测试书.yaml"
        history_text = history_files[0].read_text(encoding="utf-8")
        assert "score: 92" in history_text, "score_history 应记录 score"
        assert "archetype: narrative" in history_text, "score_history 应记录 archetype"
        assert "soul_auto_issues:" in history_text, "score_history 应记录 soul_auto_issues"
        assert "纯 AI 闭环" in history_text, "score_history 的 soul_note 应说明已全自动算分"

        # 清理测试产物
        for f in history_files:
            f.unlink()
