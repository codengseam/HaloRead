# 内容质检多 Agent 架构

本文件描述内容质检 Skill 的多 Agent 协作架构。**Skill 文件本身不调度 sub-agents**——真并行由本地 Python 引擎（LangGraph）或主 Agent 经 Trae `Task` 工具完成。Skill 只负责触发和返回结果。

## 一、两层架构

```
                ┌─────────────────────────────────────┐
                │  Skill 入口（SKILL.md）              │
                │  识别意图 → 收集内容 → 触发引擎        │
                └─────────────┬───────────────────────┘
                              │
                ┌─────────────▼───────────────────────┐
                │  规则层（确定性，无需 LLM）           │
                │  Layer 1: check_char_count.py       │
                │  Layer 2: check_consistency.py      │ ← v1.2 新增
                │  Layer 3: content_quality.py 五维度  │
                └─────────────┬───────────────────────┘
                              │
                              │ 硬错误清零后
                              ▼
                ┌─────────────────────────────────────┐
                │  LLM 层（语义级深审，可并行）         │
                │  ┌─────────┬─────────┬─────────┐    │
                │  │ 史实核验 │ 可读性  │ 引用克制 │    │
                │  └─────────┴─────────┴─────────┘    │
                │  通过 LangGraph content_review_     │
                │  workflow 并行执行                   │
                └─────────────────────────────────────┘
```

## 二、规则层 Agent（确定性）

### Layer 1: 字数核对 Agent

- **入口**：`scripts/check_char_count.py`
- **能力**：检测三种字数声明模式（A/B/C），字数不含标点
- **触发**：质检前置，发现 P0 字数错误即阻断后续流程
- **输出**：文件路径 + 错误字数 + 应有字数

### Layer 2: 一致性检测 Agent（v1.2 新增）

- **入口**：`.trae/skills/content-review/scripts/check_consistency.py`
- **底层模块**：`src/utils/consistency.py`
- **能力**：四类矛盾检测
  1. 数值交叉矛盾（年龄-年份/在位时长/损失-剩余）
  2. 同事件异值（同引文异字数/同战役异兵力/同典故异出处）
  3. 实体别名冲突（字号/谥号/籍贯）
  4. 时间线倒置（年份逆序且无倒叙标注）
- **设计依据**：CoV 离线 claim 提取 + Self-Consistency 思想
- **误报防护**：维护 `ENTITY_ALIASES` 别名表，倒叙标注词豁免
- **archetype 路由**：narrative（古籍基线）/ modern（职场商科）/ knowledge（技术）

### Layer 3: 五维度规则质检 Agent

- **入口**：`src/utils/content_quality.py:run_content_quality_checks()`
- **能力**：AI 套路句、数字事实、典故出处、跨章跳转、引用密度、灵魂点睛
- **集成**：一致性维度已合并到此层（详见 `content_quality.py:690-708`）

## 三、LLM 层 Agent（语义级深审）

### 三视角并行 Agent

由 `src/agents/content_reviewer_sub.py` 实现，经 `src/core/content_review_workflow.py` 用 LangGraph 并行调度：

| Agent | 职责 | 满分 | 检查项 |
|---|---|---|---|
| 史实核验 specialist | 内容真实性 | 33 | 人名/时间/地点/因果、关键年份、典故出处、名家点评真实性、跨文化映照、史料层累 |
| 可读性 specialist | 故事感与重复 | 23 | 场景对话戏剧性、重复控制、AI 套路句、现代术语硬套、段尾升华 |
| 引用克制 specialist | 引用规范 | 8 | 内联跳转、行内引用密度、文末来源完整性 |

### 三视角 Prompt 加载

- 模板文件：`prompts/content_reviewer_sub.md`
- archetype 路由：narrative 读原路径；modern/knowledge 读 `prompts/{archetype}/content_reviewer_sub.md`
- fallback：文件不存在时回退 narrative 路径并打印 UserWarning

## 四、并行调度路径

按 dev-workflow.md §零「能力边界声明」，路径有三：

- **路径 C（主路径）**：主 Agent 经 Skill 引导，用 Trae `Task` 工具启动多个 subagent 并行执行。
- **路径 B**：Skill 触发 `python scripts/review_content.py`，由 LangGraph 引擎做真并行。
  - 前置条件：`.env` 中 `LLM_API_KEY` 已配置；可选 `langgraph` 已安装。
  - 环境缺失时降级到路径 C 或路径 A（串行）。
- **路径 A（降级）**：单 Agent 串行切换三视角，伪并行。仅在 Task 工具与 LangGraph 均不可用时使用。

## 五、与 deep-reading Skill 的关系

```
deep-reading（生成）→ content-review（质检）→ 修复 → 再质检
       ↑                                          │
       └────────────── 反馈循环 ─────────────────────┘
```

- `deep-reading` 生成讲书笔记后自动触发 `content-review` 质检。
- 质检发现问题 → 反馈给 deep-reading 重生成或人工修复 → 再质检。
- 一致性维度新增后，deep-reading 的 prompt 应避免生成前后矛盾内容（防优于治）。

## 六、专家团评审机制（用户要求 ≥ 99 分）

完成质检后启用三视角评审：

1. **架构师视角**：评估规则与 LLM 分层是否合理、误报率、可扩展性
2. **测试视角**：评估回归测试覆盖率、边界用例、archetype 路由正确性
3. **规则视角**：评估规则完整度、与权威资料对齐度、能力边界声明

主 Agent 汇总三视角意见，输出评分报告，目标 ≥ 99 分。

## 七、相关文件清单

| 类别 | 文件路径 |
|---|---|
| Skill 入口 | `.trae/skills/content-review/SKILL.md` |
| 一致性规则 | `.trae/skills/content-review/rules/consistency-rules.md` |
| 一致性 CLI | `.trae/skills/content-review/scripts/check_consistency.py` |
| 一致性根入口 | `scripts/check_consistency.py`（便捷封装） |
| 一致性核心模块 | `src/utils/consistency.py` |
| 五维度质检模块 | `src/utils/content_quality.py` |
| 字数核对 CLI | `scripts/check_char_count.py` |
| 书籍结构校验 CLI | `scripts/check_book_structure.py` |
| 质检 CLI（全维度） | `scripts/review_content.py` |
| 三视角 specialist | `src/agents/content_reviewer_sub.py` |
| 主 reviewer | `src/agents/content_reviewer.py` |
| LangGraph workflow | `src/core/content_review_workflow.py` |
| 六维度清单 | `.trae/skills/content-review/checklist.md` |
