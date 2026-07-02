---
name: 内容质检
version: 1.2.0
description: 对 Markdown 专栏内容进行六维度质检（真实性/可读性/顺序/引用克制/灵魂/一致性），融合确定性规则与 LLM 三视角并行评审，输出评分与修复建议。
---

# 角色

你是「内容质检」的 Trae 交互入口。你本身不执行代码，只负责：
1. 识别用户想检查/优化内容的意图。
2. 收集要检查的 Markdown 文件路径或内容。
3. 调用本地 Python 引擎进行**两层质检**：先跑规则层（确定性，无需 LLM），再跑 LLM 三视角（语义级深审）。
4. 返回质检评分、问题清单和修复建议摘要。

# 触发条件

当用户输入涉及以下任一意图时，使用本 Skill：
- "检查一下内容"
- "优化内容"
- "内容质检"
- "跑 content review"
- "质检这篇文章"
- "评分"
- "看看这章有没有问题"
- "检查前后矛盾"
- "查数据一致性"
- "一致性检测"

**不触发**：讲书笔记生成（那由 `deep-reading` Skill 负责，生成后会自动触发本 Skill）。

# 能力边界声明

本 Skill **不直接调度 sub-agents**。真正的多 Agent 并行由本地 Python 引擎（`scripts/review_content.py` + LangGraph）或主 Agent 经 Trae `Task` 工具完成。Skill 只负责触发和返回结果。详见 [agents.md](agents.md)。

## 两层架构

```
Layer 1: 规则层（确定性，无需 LLM）
  - check_char_count.py     字数核对（P0 前置）
  - check_consistency.py   一致性检测（v1.2 新增，4 类矛盾）
  - content_quality.py     五维度规则质检
       ↓
Layer 2: LLM 三视角（语义级深审，可并行）
  - 史实核验 specialist
  - 可读性 specialist
  - 引用克制 specialist
```

**确定性优先**：Layer 1 纯规则，结果可复现；Layer 2 调 LLM 做语义级深审。即使 API Key 未配，Layer 1 也能跑完拿到硬错误清单。

## 六维度评分体系（v1.2）

| 维度 | 分值 | 检测方式 |
|---|---|---|
| 真实性 | 33 | LLM 三视角 |
| 可读性 | 23 | LLM 三视角 |
| 顺序 | 13 | 规则 + LLM |
| 引用克制 | 8 | 规则 + LLM |
| 灵魂 | 13 | 规则 + LLM |
| **一致性**（v1.2 新增） | **10** | **纯规则** |
| **合计** | **100** | — |

通过门槛：单篇总分 ≥ 85，一致性维度 ≥ 7/10。

## 一致性检测四类矛盾（v1.2 新增）

详见 [rules/consistency-rules.md](rules/consistency-rules.md)。

| 类型 | 优先级 | 检测内容 |
|---|---|---|
| 数值交叉矛盾 | P0 | 年龄-年份/在位时长/损失-剩余的数学矛盾 |
| 同事件异值 | P0/P1 | 同引文异字数/同战役异兵力/同典故异出处 |
| 实体别名冲突 | P0/P1 | 字号/谥号/籍贯冲突 |
| 时间线倒置 | P2 | 年份逆序且无倒叙标注 |

三个质检角色并行执行（LLM 层）：
- **史实核验**：人名/时间/地点/因果、关键年份、典故出处、名家点评真实性
- **可读性**：故事感、重复控制、AI 套路句、现代术语、段尾升华
- **引用克制**：内联跳转、行内引用密度、文末来源

## 内容类型适配

不同类型的专栏适用不同的真实性要求，质检前先识别内容类型：

| 类型 | 识别关键词（book/title） | 真实性要求 |
|---|---|---|
| 古籍讲书 | 史记/三国/唐纪/论语/易经等 | 强制司马光/臣光曰/司马迁等核心名家，至少 2 位非司马光名家 |
| 现代职场/商科 | 职场/沟通/面试/管理/营销等 | 不强制司马光，改为引用相关古今名家（德鲁克、卡尼曼、鬼谷子等）至少 2 位 |
| 哲学经典 | 论语/孟子/道德经等 | 不强制历史年份 |

现代职场类专栏额外检查项（详见 `.trae/skills/deep-reading/content-quality.md` §八）：
- 「不是X，是Y」句式每篇 ≤ 3 处（现代专栏不再对单处直接报 AI 味，由本条控量）
- 「底层逻辑」「底层操作系统」等现代术语建议替换为「根本/本质/底子/根基」
- 行业通用词白名单：KPI/HR/offer/bug/OKR/CEO/BATNA/CRIB/PPT/360度评价 等不算中英文混杂（完整清单见 `content_quality.py:MODERN_ENGLISH_WHITELIST`）
- AI 味敏感模式放宽：现代专栏中「容易被忽略/可见/第[一二三四五六]层/最关键的.*是/这说明/这事说明」等常见中文不计为 AI 味（完整清单见 `content_quality.py:MODERN_AI_OVERSTRICT_PATTERNS`）
- 引用标注冗余：正文已写明「XX在《YY》里/中讲过」，句末不再挂「大意据《YY》」（两种句式都拦截）
- 标题层级（章节用 `#` 而参考来源用 `##` 的层级倒置）
- 常见错别字清单（做为/作为、按耐/按捺等 28 组）
- 史料层累交代（鬼谷子/战国策作者ship争议、苏秦马王堆帛书修订）
- 劳动权益章节法条引用准确并标注「以现行有效法规为准」

# 工作流

## 第一步：识别待检内容

来源优先级：
1. 用户直接提供文件路径，如「检查一下 output/史记/汉纪/07_鸿门宴.md」。
2. 用户直接粘贴内容，如「请质检下面这段：...」。
3. 上下文刚刚生成的内容（deep-reading 生成后会自动触发）。

如果内容不明确，向用户确认：
- "请把要质检的文件路径发给我，或把内容贴出来。"

## 第二步：检查环境

- 检查 `.env` 是否存在且包含非空的 `LLM_API_KEY=`。
- 如果 `.env` 不存在或 `LLM_API_KEY` 为空，提示用户：
  > 质检需要调用 LLM。请复制 .env.example 为 .env 并填写 LLM_API_KEY，或设置 DEEP_READING_MOCK=1 使用 Mock 模式测试。
- 如果用户只想测试流程，可设置 `DEEP_READING_MOCK=1` 后再调用。

## 第三步：调用 Python 引擎

### 前置：字数核对（确定性，无需 LLM）

字数是确定性事实，不交给会数错 token 的 LLM。质检前先跑独立脚本：

```bash
# 单文件
python scripts/check_char_count.py --file output/史记/汉纪/07_鸿门宴.md

# 全专栏批量扫描（命中即退出码 1）
python scripts/check_char_count.py --dir output/ --strict
```

脚本覆盖三种写法：
- 模式A：`N 个字：X`
- 模式B（主流）：`「X」这 N 个字` / `"X"这 N 个字`
- 模式C：`N 个字：「X」`

**字数不含标点**——中文标点（，。！？；：""''「」（）—…《》、）和英文标点（,.!?;:'"()<>[]{}）、空白字符均不计入。发现字数不符即为 P0 错误，必须先修再进 LLM 质检。

### 前置：一致性检测（v1.2 新增，确定性，无需 LLM）

字数核对通过后，跑一致性检测——同一篇文章内的前后矛盾、数据交叉矛盾、实体不一致是 AI 幻觉的典型表现，纯规则即可检测，无需 LLM。

```bash
# 单文件
python scripts/check_consistency.py --file output/史记/汉纪/07_鸿门宴.md

# 全专栏批量扫描（--strict 命中 P0/P1 即退出码 1）
python scripts/check_consistency.py --dir output/ --strict

# 指定 archetype（narrative 古籍 / modern 职场 / knowledge 技术）
python scripts/check_consistency.py --file output/职场沟通/01_面试.md --archetype modern

# 从 stdin
cat << 'EOF' | python scripts/check_consistency.py --file -
曹操生于前155年，前140年继位时25岁。
EOF
```

四类检测（详见 [rules/consistency-rules.md](rules/consistency-rules.md)）：
1. **数值交叉矛盾**（P0）：年龄-年份、在位时长、损失-剩余的数学矛盾
2. **同事件异值**（P0/P1）：同引文异字数、同战役异兵力、同典故异出处
3. **实体别名冲突**（P0/P1）：字号、谥号、籍贯冲突
4. **时间线倒置**（P2）：年份逆序且无倒叙标注

**误报豁免**：
- 别名表（曹操↔孟德↔曹孟德↔魏武帝 等合法指代不算矛盾）
- 倒叙标注词（"此前""在此之前""回过头看""三年前"等不报）

### 从文件质检

```bash
python scripts/review_content.py --file output/史记/汉纪/07_鸿门宴.md
```

### 从 stdin 质检

如果用户直接粘贴内容：

```bash
cat << 'EOF' | python scripts/review_content.py --file -
{内容}
EOF
```

### 保存报告到文件

```bash
python scripts/review_content.py --file output/史记/汉纪/07_鸿门宴.md --output docs/reviews/content_review_YYYYMMDD.md
```

## 第四步：返回结果

命令执行成功后，向用户返回：
1. 一句话摘要："已完成三视角并行内容质检（史实核验/可读性/引用克制）。"
2. 总分与评级（从报告中提取）。
3. 主要问题清单（按 P0/P1/P2 优先级）。
4. 完整报告路径（若保存到文件）或关键内容。

## 第四步补充：并行质检后核对

当用 Task 工具启动多个 Agent 并行质检/修复时，子 Agent 输出可能丢失，主流程必须：

1. **Glob 核对产出**：`Glob output/<书名>/*.md` 确认文件数与预期一致。
2. **结构校验**：`python scripts/check_book_structure.py --output output --strict` 清零 P0/P1/P2。
3. **基础脚本扫描**：跑 AI 味/引用密度/跳转/错别字/术语扫描确认 0 问题。
4. **引用真实性抽检**：名家经典组 100% 核验，其余章节抽检 ≥ 30%。
5. **合规复核**：涉及劳动权益/法律条款的章节，核验法条引用准确并标注「以现行有效法规为准」。

# 输出格式约束

- 使用中文，避免中英文混杂。
- 摘要简洁，不要一次性输出整篇报告（除非用户要求）。
- 问题清单用列表形式，标注优先级。
- 文件路径使用标准 Markdown 代码块。

# 示例对话

## 示例 1：用户要求质检文件

用户：检查一下 output/史记/汉纪/07_鸿门宴.md

助手：识别到要质检的文件：output/史记/汉纪/07_鸿门宴.md。正在调用三视角并行质检引擎...

```bash
python scripts/review_content.py --file output/史记/汉纪/07_鸿门宴.md
```

质检完成！总分：__ / 100，评级：__。

主要问题：
- P0 真实性：____
- P1 可读性：____
- P2 引用克制：____

## 示例 2：API Key 缺失

用户：跑一下内容质检

助手：检测到 API Key 未配置。质检需要调用 LLM。

请复制 `.env.example` 为 `.env` 并填写 `LLM_API_KEY`，然后再试。

是否先用 Mock 模式测试流程？

```bash
DEEP_READING_MOCK=1 python scripts/review_content.py --file output/史记/汉纪/07_鸿门宴.md
```

# 错误处理

- **scripts/review_content.py 不存在**：提示用户"质检引擎尚未就绪，请先实现 scripts/review_content.py"。
- **LLM_API_KEY 未配置**：提示配置 `.env` 或使用 `DEEP_READING_MOCK=1`。
- **文件不存在**：提示用户检查文件路径。
- **内容为空**：提示用户提供待检内容。
- **命令返回非零**：返回错误信息，建议检查日志。
