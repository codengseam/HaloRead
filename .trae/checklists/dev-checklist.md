# Development Self-check Checklist

This checklist is used for post-development self-check. Use it with `.trae/rules/dev-workflow.md` Step 4, or trigger it via `.trae/skills/dev-selfcheck/SKILL.md`.

**Usage**: Check item-by-item, marking ✅ pass / ❌ fail / ➖ not applicable. Failed items must be fixed or the reason explained.

---

## 1. Code Quality

- [ ] Code passes lint (if configured)
- [ ] Code passes typecheck (if configured, e.g. `mypy` / `pyright`)
- [ ] No obvious dead code, unused imports, unused variables
- [ ] No hardcoded keys, paths, URLs (should go through config or env vars)
- [ ] Exception handling is reasonable: no swallowed exceptions, no bare `except`, edge cases covered
- [ ] Functions/classes/modules have single responsibility, no "god objects"
- [ ] Clear naming, no vague names like `temp` / `foo` / `data2`

## 2. Project Convention Compliance

- [ ] Follows existing directory structure (see README §七), no files dumped in root
- [ ] File naming follows conventions: Python uses `snake_case`, Markdown uses Chinese or underscores
- [ ] Does not break the behavior of `.trae/skills/deep-reading/SKILL.md`
- [ ] Does not break `.trae/rules/rules.md` (reading-note writing rules)
- [ ] Does not break the 7 reading-note prompts under `prompts/`
- [ ] Does not break the detection logic of `src/utils/quality.py`
- [ ] If `.trae/rules/rules.md` was modified, ran `python scripts/sync_rules.py` to sync to `RULES.md`
- [ ] Ran `python scripts/check_duplicates.py` before commit; no duplicate Markdown files in `output/`
- [ ] No 「模块N」 prefix in chapter names or filenames under `output/` (auto-blocked by `check_book_structure.py --strict`, historical issue BUG-019)

## 3. Tests

- [ ] New features have corresponding unit tests
- [ ] After modifying existing logic, related tests updated
- [ ] `pytest` all pass (or skip reason clearly stated)
- [ ] Ran `python scripts/check_book_structure.py --output output --strict`, P0/P1/P2 all cleared (must be done before merge)
- [ ] Edge cases covered: empty input, oversized input, illegal paths, concurrency, etc.
- [ ] Mock mode (`DEEP_READING_MOCK=1`) end-to-end flow runs through
- [ ] When fixing a recurring code/data bug, regression tests added or `tests/bug_regression_list.md` updated

## 4. Dependencies & Config

- [ ] No undeclared new dependencies introduced (if introduced, `requirements.txt` updated)
- [ ] No undeclared MCP servers introduced (if introduced, `config.yaml` `mcp_servers` updated)
- [ ] New config items added to both `config.yaml` and `.env.example`
- [ ] New trusted search domains added to `config.yaml` `trusted_domains`

## 5. Documentation

- [ ] Does README.md need updating (new features, new commands, new directories)
- [ ] Do new Skills / rule files / checklists need to be registered in README
- [ ] Are important design decisions recorded under `docs/`
- [ ] Are API changes reflected in related docs

## 6. Trae Skill Boundary (check when adding/modifying a Skill)

- [ ] Skill file does not claim to "schedule sub-agents" or "directly call MCP tools" (Skill cannot do these)
- [ ] When true parallelism is needed, the Skill triggers a Python script (Path B)
- [ ] Skill trigger conditions are clear and do not overlap with existing Skills
- [ ] Skill is consistent with the boundary declared in `.trae/rules/dev-workflow.md`

## 7. LoopAgent Sediment (must do after every development completion)

- [ ] Did this change expose a new common problem?
- [ ] Do rule files under `.trae/rules/` need updating?
- [ ] Does `src/utils/quality.py` detection need updating?
- [ ] Does this checklist (`dev-checklist.md`) need updating?
- [ ] Should a development-sediment record be appended to `docs/loop_log.md`?
- [ ] If a historical bug was fixed, is it recorded in `tests/bug_regression_list.md` with frequency updated?
- [ ] If no new sediment, explicitly state "no new sediment this time"

---

## Self-check Report Template

```
## 自检报告

### 一、代码质量
- ✅/❌ lint：____
- ✅/❌ typecheck：____
- ...

### 二、项目规范遵循
- ...

### 三、测试
- pytest 结果：____
- ...

### 四、依赖与配置
- ...

### 五、文档
- ...

### 六、Trae Skill 边界
- ...

### 七、LoopAgent 沉淀
- 新共性问题：____
- 规则更新：____
- checklist 更新：____
- loop_log 追加：____

### 总结
- 通过项：__ / 总项数 __
- 未通过项及处理：____
```
