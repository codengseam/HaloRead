# NovelForge：极简 AI 小说创作系统

> 基于 Trae IDE Skills + Obsidian Vault 的 AI 小说创作系统。Markdown / JSON 文件即真相，不做 RAG、不向量化、不依赖向量数据库。
> 双模式：**novel**（长篇纯虚构）+ **shortform**（公众号半历史）。目标是让 AI 写出有「活人感」、去 AI 味、人物弧光扎实的小说。

## 一、项目定位

NovelForge 是一套以 **Trae Skills** 为编排核心、**Obsidian Vault** 为存储与阅读载体的极简 AI 小说创作系统。它不跑 Python LangGraph 编排，不建独立站点，所有产出都是 Markdown 文件直接进 Vault，可链接、可检索、可沉淀。

- **本地优先**：所有产出 Markdown，直接进 Obsidian Vault。
- **文件即真相**：世界观、人物设定、章节正文、意图、Delta 增量全部是 Markdown / JSON 文件，无数据库、无向量库。
- **Skill 编排**：创作流程由 Trae Skills 串联，主 Agent 用 Task 工具调度 subagent 并行，无需外部编排引擎。
- **去 AI 味**：从定调、执笔到审计全链路压制 AI 套路句式与套路剧情。

## 二、双模式

NovelForge 支持两种创作模式，共用工程基础设施，差异化在写作规则与质检维度：

| 维度 | novel（长篇纯虚构） | shortform（公众号半历史） |
|---|---|---|
| 用途 | 长篇小说（多卷多章） | 公众号半历史小说（单篇成文） |
| 真实性约束 | 纯虚构，人物设定即真相 | 半历史，史实骨架不可改，细节可虚构 |
| 篇幅 | 单章 3000-8000 字，多卷连载 | 单篇 5000-12000 字，独立成文 |
| 写作规则底座 | novel 桶规则（开发中） | 继承 HaloRead narrative 桶五段结构骨架，重写为小说笔法（参考 `NovelForge_Vault/03_素材库/writing_techniques/rules-fiction-reference.md`） |
| 质检维度 | 人物一致性 / 情节连贯 / 视角统一 / 去 AI 味 / 灵魂 | 同左，但增加「史实骨架不可改」硬约束 |
| 参考语料 | 待沉淀 | `docs/_haloread_reference/fiction_samples/洛克菲勒/`（fiction 桶实战样本） |

## 三、核心哲学

1. **Markdown / JSON 文件即真相**：不引入 RAG、向量库、数据库。Vault 里的每一个 `.md` / `.json` 都是唯一真相源，Agent 读写文件即读写世界。
2. **Skill 编排而非代码编排**：创作流程由 Trae Skills 串联，主 Agent 调度，不依赖 Python LangGraph / langchain。
3. **Delta 增量而非全量重写**：每次执笔只写新增章节，不动历史正文，避免漂移。
4. **防漂移三铁律**（见下文）：从架构上保证世界观与人物设定不漂移。
5. **去 AI 味是第一公民**：从定调到审计，每个环节都有去 AI 味检查，不只靠终审。

## 四、Vault 目录结构

NovelForge_Vault 是 Obsidian Vault，所有创作产出在此沉淀。目录结构概览（标注当前进度）：

```
NovelForge_Vault/
├── 00_控制面/              ✅ 已建  # 创作意图与全局索引
│   ├── author_intent.md            # 作者意图（必读意图文件）
│   ├── current_focus.md            # 当前写作焦点
│   ├── master_index.md             # 全局索引
│   └── style_guide.md              # 文风指南
├── 01_世界观/              ✅ 已建  # 世界设定
│   ├── core_rules.md               # 核心规则
│   ├── factions.md                 # 势力
│   └── geography.md                # 地理
├── 02_人物/                🚧 规划中  # 人物设定卡（人设、关系、弧光）
├── 03_素材库/              🚧 规划中  # 写作素材与方法论
│   └── writing_techniques/
│       └── rules-fiction-reference.md  ✅ 已建  # shortform 模式写作规则底座
├── 04_章节/                🚧 规划中  # 章节正文（按卷/章组织）
├── 05_Delta/               🚧 规划中  # Delta 增量记录（每次执笔的增量）
└── 06_审计/                🚧 规划中  # 执笔审计报告
```

## 五、Skill 体系概览

NovelForge 共 14 个 Skill（1 主入口 + 5 核心 + 4 shortform + 4 守护），均已实现。配合 `00_控制面/USAGE.md` 作者手册使用。

### 1. 主入口（1 个）

| Skill | 用途 |
|---|---|
| `novelforge` | 主入口，识别意图 + 调度链固化。识别 11 类作者意图，路由到对应 Skill 链路（链路 A 写下一章 / 链路 B 写公众号） |

### 2. 5 核心 Skill（novel + shortform 共用工程基础设施）

| Skill | 用途 |
|---|---|
| `idea-forge` | 灵感熔炉，8 类文本分类入库（灵感/语音/片段/人物/世界观/金手指/爽点/素材） |
| `architect` | 架构师，单章章纲生成。黄金三章 special_mode，章纲十段模板 |
| `hook-auditor` | 伏笔审计员，调用 audit_hooks.py，7 项职责，伏笔 4 态 status |
| `context-composer` | 上下文编排师，调用 build_context.py，三层组装 + Token 预算动态分桶，防漂移三铁律执行者 |
| `writer-polisher` | 执笔与精修，四阶段（写手/审计/精修/状态更新），产出章末摘要供下游消费 |

### 3. 4 shortform Skill（公众号文章链路专用）

| Skill | 用途 |
|---|---|
| `topic-curator` | 选题库管理，三维度评分（情绪浓度/争议度/品牌相关度） |
| `title-engineer` | 标题工程师，三维度打分 + 5 好 4 坏模式 + 7 种标题风格 |
| `brand-voice-guardian` | 品牌调性守护，维护 author_voice.md，五维度一致性检查 |
| `virality-auditor` | 传播性审计，四维度评分（金句密度/转发点/情绪曲线/标题契合） |

### 4. 4 守护 Skill（章级/卷级守护）

| Skill | 用途 |
|---|---|
| `state-consistency-checker` | 章级门禁，每章后跑 check_consistency.py，P0 阻断保存，P1 可豁免留痕 |
| `key-scene-archiver` | 关键场景存档器，每章后识别关键场景归档到 _scenes/，供 build_context.py Grep 召回（替代 RAG） |
| `recap-generator` | 前情提要生成器，每 10 章冻结一份 _recaps/recap_chXXX-YYY.md，作为稳定锚点 |
| `drift-detector` | 漂移检测器，每 10 章跑 5 维度长程漂移体检（意图/弧光/伏笔/套路/AI 味），不阻断 |

### 5. 通用工程 Skill（继承自 HaloRead）

9 个通用 Skill：`dev-selfcheck`、`git-merge-guardian`、`verification-before-completion`、`writing-plans`、`tdd`、`plan-review`、`dispatching-parallel-agents`、`receiving-code-review`、`systematic-debugging`。这些与小说创作无关，是开发协作基础设施。

## 六、防漂移三铁律

NovelForge 从架构上保证世界观与人物设定不漂移，三条铁律不可违反：

1. **不注入历史正文**：执笔时只读 `00_控制面/author_intent.md` + `01_世界观/` + `02_人物/` + 上一章末尾摘要，不把历史章节全文塞进上下文。避免 Agent 改写历史正文导致设定漂移。
2. **Delta 增量**：每次执笔只写新增章节，Delta 记录写到 `05_Delta/`。下一章执笔时只读上一章 Delta，不读全量历史。
3. **必读意图文件**：每次执笔前必读 `00_控制面/author_intent.md` 与 `current_focus.md`，确保当前章节服务于作者意图与全局弧光，不跑偏。

违反三铁律任一条，审计 Skill 直接打回重做。

## 七、去 AI 味双模式

去 AI 味贯穿 novel 与 shortform 两种模式，但侧重点不同：

| 维度 | novel 模式 | shortform 模式 |
|---|---|---|
| 套路句式 | 「我们可以看到」「这告诉我们」「不禁让人」等转折升华句 | 同左 |
| 套路剧情 | 金手指无代价、配角工具人、反派脸谱化 | 同左，但允许史实骨架决定的部分剧情 |
| 对白 | 解释性对白、信息倾倒对白 | 同左 |
| 节奏 | 每章必有高潮、每段必有转折 | 同左 |
| 升华段 | 章末强行升华、主题外露 | 同左 |

去 AI 味检测在审计 Skill（Layer1 规则）与总编 Skill（Layer2 LLM）双层执行，详见后续 Phase 实现。

## 八、分支策略

- **当前分支**：`aiwork`（基于 HaloRead master，NovelForge 在此分支演进）。
- **剥离已完成**：HaloRead 讲书专属资产已剥离到 `docs/_haloread_reference/`，详见 [MIGRATION_NOTES.md](docs/_haloread_reference/MIGRATION_NOTES.md)。
- **未来迁出**：NovelForge 成熟后将从 HaloRead 仓库迁出为独立项目，届时 `docs/_haloread_reference/` 可保留为历史参考或删除。
- **合并守护**：合并/推送前执行 `python scripts/validate_commit_messages.py origin/master..HEAD` + `python scripts/check_loop_log.py`，详见 `.trae/skills/git-merge-guardian/SKILL.md`。

## 九、致谢 HaloRead

NovelForge 从 HaloRead（讲书笔记生成引擎）演进，继承以下通用工程资产：

- **9 个通用 Trae Skills**：dev-selfcheck、git-merge-guardian、tdd、plan-review、dispatching-parallel-agents、verification-before-completion、receiving-code-review、writing-plans、systematic-debugging。
- **dev-workflow 协作流程**：`.trae/rules/dev-workflow.md`（五步协作流程：重述需求 → 计划 → 执行 → 自检 → 沉淀）。
- **bug-reporting 规范**：`.trae/rules/bug-reporting.md`。
- **沉淀机制**：`docs/loop_log/` + `docs/loop_log.md` 索引 + `scripts/regen_loop_log_index.py` + `scripts/check_loop_log.py`。
- **fiction 桶规则**：`.trae/skills/deep-reading/rules-fiction.md`（已备份到 `docs/_haloread_reference/rules-fiction.md.bak` 与 `NovelForge_Vault/03_素材库/writing_techniques/rules-fiction-reference.md`），作为 shortform 模式写作规则底座。
- **方法论借鉴**：content-review 双层架构（Layer1 规则 + Layer2 LLM 三视角）、五维度质检评分、章回体灵魂标题三维度评分、archetype 边链裁剪。详见 [MIGRATION_NOTES.md](docs/_haloread_reference/MIGRATION_NOTES.md) 第二章「核心方法论复用」。

## 十、项目状态

- **当前 Phase**：Phase 0-7 全部完成（系统从 0 到 1 搭建就绪）。
- **已完成**：
  - Phase 0：aiwork 分支 + Vault 骨架 + HaloRead 资产剥离
  - Phase 1：5 核心脚本（save_state / audit_hooks / build_context / check_consistency / check_ai_novel + schema）
  - Phase 2：5 核心 Skill（idea-forge / architect / hook-auditor / context-composer / writer-polisher）
  - Phase 3：4 shortform Skill（topic-curator / title-engineer / brand-voice-guardian / virality-auditor）
  - Phase 4：4 守护 Skill + 主入口（drift-detector / recap-generator / state-consistency-checker / key-scene-archiver / novelforge）
  - Phase 5：去 AI 味规则 + style_guide 双模式 + 角色语言指纹
  - Phase 6：联调修复 10 项断链 + USAGE.md 作者手册
  - Phase 7：全量自检 + loop_log 沉淀
- **下一步**：试写验证（用第 1 章做端到端 E2E，验证调度链全流程跑通）。
- **开发沉淀**：见 [docs/loop_log/2026-07.md](docs/loop_log/2026-07.md)。
