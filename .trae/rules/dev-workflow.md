# Project Development Collaboration Workflow

This rule guides the Agent's default behavior during **project development collaboration** in Trae IDE.
See [README.md](../../README.md) for detailed project background.

## 0. Scope & Boundary

### 1. Applicable Scenarios

This rule **applies only to project development collaboration conversations** — i.e. when the user discusses code changes, feature implementation, bug fixes, workflow optimization, plan review, and other development tasks in Trae.

**Not applicable to**: generating classical-book reading notes. Note generation is handled by `.trae/rules/rules.md` and `.trae/skills/deep-reading/SKILL.md`; this rule does not intervene.

### 2. Trae Skill Capability Boundary (must be followed honestly)

| Capability | Skill supports? |
|---|---|
| Recognize user intent, load specs, guide Agent behavior | Yes |
| Let Agent call built-in tools (RunCommand / Read / Edit, etc.) | Yes (via prompt guidance) |
| **Create / schedule sub-agents** | **No** |
| **Directly call MCP tools** | **No** |
| Execute code, save files, maintain state | **No** |

**Important**: When the user mentions "启用多个 agent" / "专家团并行" / "多 Agent 评审", do NOT pretend the Skill can schedule sub-agents. Only two viable paths exist:
- **Path A**: A single Agent serially switches perspectives (architect → tester → rules), pseudo-parallel.
- **Path B**: The Skill triggers a local Python script (e.g. `python scripts/review_plan.py`), and the Python engine (LangGraph) does true parallelism.

This project already provides infrastructure for Path B: `src/agents/` + `src/core/workflow.py` + `scripts/review_plan.py`.

## 1. Default Collaboration Workflow (auto-effective for every development conversation)

After receiving a development request, **execute in the following order**, no skipping:

### Step 1: Restate the requirement

Restate the user's intent in one sentence to confirm shared understanding. Format:

> 我理解你要做的是：____（一句话）。核心目标是：____（用户原话或提炼）。

If the user has explicitly stated the core goal, quote it directly; if not, distill it proactively and mark it "（我提炼的，请确认）".

### Step 2: Generate a plan and wait for confirmation

List plan points around the core goal, **wait for user confirmation before executing**. Plan format:

```
## 计划
- 核心目标：____
- 步骤：
  1. ____
  2. ____
  3. ____
- 涉及文件：____
- 风险点：____
```

**Do not start changing code before the user confirms.** Only proceed to Step 3 when the user says "直接做" / "开始吧" / "嗯" or other clear consent.

### Step 3: Execute

Follow these norms during execution:

- **Reuse existing capabilities first**: Check `.trae/skills/`, `.trae/rules/`, `.trae/checklists/`, `prompts/`, `src/agents/`, `src/core/` for reusable Skills / rules / prompts / Agents before reinventing.
- **Parallel speedup**: Parallelize independent sub-tasks where possible (launch multiple subagents with the Task tool, or call Python scripts for true parallelism).
- **Follow existing directory structure & naming conventions**: see README §七、§八; when adding/renaming Markdown chapters, do NOT use the 「模块N」 prefix in the `chapter` field or filename (historical issue BUG-019).
- **No over-engineering**: Only do what is directly requested or necessary; do not proactively add abstractions, configs, or compatibility layers.
- **All validation issues must be cleared before merge**: Run `python scripts/check_book_structure.py --output output --strict`; P0/P1/P2 must all pass before merge/push. If issues not introduced by this change are found, they still must be fixed; after fixing, judge whether it is a recurring code/data bug, and add regression tests or update `tests/bug_regression_list.md`.

### Step 4: Self-check

After completion, **proactively trigger self-check**, inspecting item-by-item against `.trae/checklists/dev-checklist.md` and fixing failures. Can also be triggered by the user via `.trae/skills/dev-selfcheck/SKILL.md`.

Self-check must include:
- `python scripts/check_book_structure.py --output output --strict` passes.
- `pytest` all pass.
- If a historical or recurring bug was fixed, regression tests have been added or `tests/bug_regression_list.md` updated.

### Step 5: Sediment (LoopAgent mindset)

After each development completion, do a sediment retrospective:

- Did this change expose a new common problem?
- Do `.trae/rules/` or `src/utils/quality.py` need updating?
- Does `.trae/checklists/dev-checklist.md` need updating?
- Should a development-sediment record be appended to `docs/loop_log.md`?

**Goal**: Make development collaboration itself an iterable Loop, sedimenting experience to avoid recurring problems.

## 2. Prompt Solidification (no need for user to paste each time)

Previously the user had to paste this prompt every conversation:

> 启用多个 agent 组成专家团理解下面的需求，并使用 skills 和 checklist 规范执行，用多个 agent 并行提速，完成后启用专家团检查并修复完成，采用 loop agent 的思维来开发优化这个项目；主要是得添加核心目标，然后围绕目标去实现

This rule has decomposed that prompt into the five steps above and solidified them as default behavior. **The user no longer needs to paste manually.**

Mapping:

| Original prompt text | Solidified into |
|---|---|
| "启用多个 agent 组成专家团理解下面的需求" | Step 1 restate requirement + Step 2 generate plan; for true parallel review, trigger `.trae/skills/plan-review/SKILL.md` |
| "使用 skills 和 checklist 规范执行" | Step 3 "reuse existing capabilities" + Step 4 self-check against checklist |
| "用多个 agent 并行提速" | Step 3 "parallel speedup" |
| "完成后启用专家团检查并修复完成" | Step 4 self-check |
| "采用 loop agent 的思维来开发优化这个项目" | Step 5 sediment |
| "主要是得添加核心目标，然后围绕目标去实现" | Step 1 "core goal" + Step 2 plan "around the core goal" |

## 3. Language Style

- Chinese-first, natural and colloquial.
- Restate requirements concisely, no background padding.
- Use lists for plan points, not long paragraphs.
- Report progress promptly during execution, no silent operations.
- Self-check reports use checklist form, marking pass/fail.

## 4. Prohibitions

- **Do not change code before user confirmation**.
- **Do not pretend the Skill can schedule sub-agents** — if it can't, say so honestly and give Path A or Path B alternatives.
- **Do not break the existing system**: `.trae/skills/deep-reading/`, `.trae/rules/rules.md`, the 7 reading-note prompts under `prompts/`, and `src/utils/quality.py` are out of scope for modification by this rule.
- **No over-engineering**: Use a rule file instead of a Skill when possible; use a Skill instead of Python when possible; only use LangGraph when true multi-Agent parallelism is needed.
- **Do not skip sediment**: Every development completion must do the Step 5 sediment retrospective, even if just "no new sediment this time".
- **Do not skip fixes on the grounds that "the issue was not introduced this time"**: Before merge/push, `check_book_structure.py --strict`, `pytest`, and the regression test suite must all pass.
- **Do not push/merge while any validation issue exists**: including P2-level issues.
