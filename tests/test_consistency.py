"""一致性检测回归测试（v1.2 新增维度）。

覆盖四类矛盾检测的正反例：
1. 数值交叉矛盾（numeric_cross）：年龄-年份/在位时长/损失-剩余
2. 同事件异值（same_event_diff_value）：同引文异字数/同战役异兵力/同典故异出处
3. 实体别名冲突（entity_alias）：字号/谥号/籍贯冲突
4. 时间线倒置（timeline_inversion）：年份逆序且无倒叙标注

误报防护：
- 别名表（曹操↔孟德↔曹孟德 等合法指代不算矛盾）
- 倒叙标注词（"此前""回过头看"等不报）
- "继位时N岁" 与 "N岁继位" 两种语序都支持，且不吞数字
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from src.utils.consistency import (
    ConsistencyReport,
    check_consistency,
    check_numeric_cross_reference,
    check_same_event_diff_value,
    check_entity_alias_conflict,
    check_timeline_inversion,
)


# ---------------------------------------------------------------------------
# 1. 数值交叉矛盾
# ---------------------------------------------------------------------------

class TestNumericCrossReference:
    """数值交叉矛盾：年龄-年份/在位时长/损失-剩余的数学矛盾。"""

    def test_age_year_contradiction(self):
        """年龄与生年/继位年矛盾应报 P0。"""
        text = """# 曹操
曹操生于前155年，前140年继位时25岁，明显与生年矛盾。
"""
        issues = check_numeric_cross_reference(text)
        # 应至少检测到 1 个 P0 矛盾
        p0_issues = [i for i in issues if i.severity == "P0" and i.type == "numeric_cross"]
        assert len(p0_issues) >= 1, f"应检测到年龄-年份矛盾，实际: {issues}"
        assert "15" in p0_issues[0].message  # 应 15 岁
        assert "25" in p0_issues[0].message  # 文中称 25 岁

    def test_age_year_consistent(self):
        """年龄与生年/继位年一致，不报。

        关键回归：'继位时N岁' 不应吞数字（之前非贪婪 \\S{0,3}? 把 15 吞成 5）。
        """
        text = """# 曹操
曹操生于前155年，前140年继位时15岁，于220年去世。
"""
        issues = check_numeric_cross_reference(text)
        age_issues = [
            i for i in issues
            if i.type == "numeric_cross" and "年龄" in i.message
        ]
        assert len(age_issues) == 0, f"年龄一致不应报错，实际: {age_issues}"

    def test_age_year_consistent_arabic_year(self):
        """公元年龄一致，不报。"""
        text = """# 李世民
李世民生于598年，626年即位时28岁。
"""
        issues = check_numeric_cross_reference(text)
        age_issues = [
            i for i in issues
            if i.type == "numeric_cross" and "年龄" in i.message
        ]
        assert len(age_issues) == 0, f"年龄一致不应报错，实际: {age_issues}"

    def test_reign_duration_contradiction(self):
        """在位年数与继位/去世年矛盾应报 P0。"""
        text = """# 汉武帝
汉武帝于前141年继位，前87年去世，在位30年。
"""
        issues = check_numeric_cross_reference(text)
        dur_issues = [
            i for i in issues
            if i.type == "numeric_cross" and "在位" in i.message
        ]
        assert len(dur_issues) >= 1, f"应检测到在位年数矛盾，实际: {issues}"
        # 实际在位 54 年，文中称 30 年
        assert "54" in dur_issues[0].message
        assert "30" in dur_issues[0].message

    def test_reign_duration_consistent(self):
        """在位年数与继位/去世年一致，不报。"""
        text = """# 汉武帝
汉武帝于前141年继位，前87年去世，在位54年。
"""
        issues = check_numeric_cross_reference(text)
        dur_issues = [
            i for i in issues
            if i.type == "numeric_cross" and "在位" in i.message
        ]
        assert len(dur_issues) == 0, f"在位年数一致不应报错，实际: {dur_issues}"

    def test_loss_remaining_contradiction(self):
        """损失-剩余数学矛盾应报 P0。"""
        text = """# 战役
三万大军出征，损失一万，只剩一万。
"""
        issues = check_numeric_cross_reference(text)
        loss_issues = [
            i for i in issues
            if i.type == "numeric_cross" and "损失" in i.message
        ]
        assert len(loss_issues) >= 1, f"应检测到损失-剩余矛盾，实际: {issues}"

    def test_no_year_claim_no_false_positive(self):
        """没有生年/继位年声明，不应误报年龄矛盾。"""
        text = """# 简介
曹操是一位雄才大略的政治家。
他统一了北方。
"""
        issues = check_numeric_cross_reference(text)
        age_issues = [
            i for i in issues
            if i.type == "numeric_cross" and "年龄" in i.message
        ]
        assert len(age_issues) == 0, f"无年份声明不应误报，实际: {age_issues}"


# ---------------------------------------------------------------------------
# 2. 同事件异值
# ---------------------------------------------------------------------------

class TestSameEventDiffValue:
    """同事件异值：同引文异字数/同战役异兵力/同典故异出处。"""

    def test_same_quote_diff_char_count(self):
        """同引文两次出现，字数标注不一致应报 P0。"""
        text = """# 论语
前文写道：「君君臣臣」这四个字。
后文又写：「君君臣臣」这五个字。
"""
        issues = check_same_event_diff_value(text)
        char_issues = [
            i for i in issues
            if i.type == "same_event_diff_value" and "字数" in i.message
        ]
        assert len(char_issues) >= 1, f"应检测到同引文异字数，实际: {issues}"
        assert "君君臣臣" in char_issues[0].message

    def test_same_quote_same_char_count(self):
        """同引文两次出现，字数标注一致，不报。"""
        text = """# 论语
前文写道：「君君臣臣」这四个字。
后文又写：「君君臣臣」这四个字。
"""
        issues = check_same_event_diff_value(text)
        char_issues = [
            i for i in issues
            if i.type == "same_event_diff_value" and "字数" in i.message
        ]
        assert len(char_issues) == 0, f"字数一致不应报错，实际: {char_issues}"

    def test_same_battle_diff_troops(self):
        """同战役两次出现，兵力不同应报 P1。"""
        text = """# 赤壁之战
前文记载：赤壁之战，曹操率二十万大军南下。
后文又写：赤壁之战，曹操率八十万大军南下。
"""
        issues = check_same_event_diff_value(text)
        battle_issues = [
            i for i in issues
            if i.type == "same_event_diff_value" and "兵力" in i.message
        ]
        assert len(battle_issues) >= 1, f"应检测到同战役异兵力，实际: {issues}"
        assert "赤壁之战" in battle_issues[0].message

    def test_same_idiom_diff_source(self):
        """同典故两次出现，出处不一致应报 P1。"""
        text = """# 典故
前文写道：「唇亡齿寒」出自《左传》。
后文又写：「唇亡齿寒」语出《谷梁传》。
"""
        issues = check_same_event_diff_value(text)
        idiom_issues = [
            i for i in issues
            if i.type == "same_event_diff_value" and "典故" in i.message
        ]
        assert len(idiom_issues) >= 1, f"应检测到同典故异出处，实际: {issues}"

    def test_different_idiom_same_source_no_false_positive(self):
        """不同典故各自有出处，不算同典故异出处。"""
        text = """# 典故
「唇亡齿寒」出自《左传》。
「退避三舍」出自《左传》。
"""
        issues = check_same_event_diff_value(text)
        idiom_issues = [
            i for i in issues
            if i.type == "same_event_diff_value" and "典故" in i.message
        ]
        assert len(idiom_issues) == 0, f"不同典故不算矛盾，实际: {idiom_issues}"


# ---------------------------------------------------------------------------
# 3. 实体别名冲突
# ---------------------------------------------------------------------------

class TestEntityAliasConflict:
    """实体别名冲突：字号/谥号/籍贯冲突。"""

    def test_zi_conflict(self):
        """字号冲突应报 P0。"""
        text = """# 曹操
前文写道：曹操字孟德。
后文又说：曹操字子建。
"""
        issues = check_entity_alias_conflict(text)
        zi_issues = [
            i for i in issues
            if i.type == "entity_alias" and "字" in i.message
        ]
        assert len(zi_issues) >= 1, f"应检测到字号冲突，实际: {issues}"

    def test_zi_consistent(self):
        """字号一致不报。"""
        text = """# 曹操
前文写道：曹操字孟德。
后文又写：曹操字孟德。
"""
        issues = check_entity_alias_conflict(text)
        zi_issues = [
            i for i in issues
            if i.type == "entity_alias" and "字" in i.message
        ]
        assert len(zi_issues) == 0, f"字号一致不应报错，实际: {zi_issues}"

    def test_native_place_conflict(self):
        """籍贯冲突应报 P1。"""
        text = """# 曹操
前文写道：曹操，沛国谯县人。
后文又说：曹操，沛国相县人。
"""
        issues = check_entity_alias_conflict(text)
        place_issues = [
            i for i in issues
            if i.type == "entity_alias" and "籍贯" in i.message
        ]
        assert len(place_issues) >= 1, f"应检测到籍贯冲突，实际: {issues}"

    def test_legitimate_alias_no_false_positive(self):
        """合法别名（曹操/孟德/曹孟德）不算矛盾。"""
        text = """# 曹操
曹操字孟德，沛国谯县人。
曹孟德雄才大略，统一北方。
孟德生于前155年。
"""
        issues = check_entity_alias_conflict(text)
        # 不应有任何 entity_alias 问题
        alias_issues = [i for i in issues if i.type == "entity_alias"]
        assert len(alias_issues) == 0, f"合法别名不应报错，实际: {alias_issues}"


# ---------------------------------------------------------------------------
# 4. 时间线倒置
# ---------------------------------------------------------------------------

class TestTimelineInversion:
    """时间线倒置：年份逆序且无倒叙标注。"""

    def test_year_inversion(self):
        """年份逆序且无倒叙标注应报 P2。"""
        text = """# 三国大事记

## 讲事情

建安十三年，赤壁之战爆发。
建安十二年，隆中对提出。
"""
        issues = check_timeline_inversion(text)
        inv_issues = [
            i for i in issues
            if i.type == "timeline_inversion"
        ]
        assert len(inv_issues) >= 1, f"应检测到时间线倒置，实际: {issues}"

    def test_year_increasing_no_false_positive(self):
        """年份递增不报。"""
        text = """# 三国大事记

## 讲事情

建安十二年，隆中对提出。
建安十三年，赤壁之战爆发。
"""
        issues = check_timeline_inversion(text)
        inv_issues = [
            i for i in issues
            if i.type == "timeline_inversion"
        ]
        assert len(inv_issues) == 0, f"年份递增不应报错，实际: {inv_issues}"

    def test_flashback_marker_exemption(self):
        """含倒叙标注词不报。"""
        text = """# 三国大事记

## 讲事情

建安十三年，赤壁之战爆发。
回顾此前，建安十二年，隆中对提出。
"""
        issues = check_timeline_inversion(text)
        inv_issues = [
            i for i in issues
            if i.type == "timeline_inversion"
        ]
        assert len(inv_issues) == 0, f"倒叙标注应豁免，实际: {inv_issues}"

    def test_absolute_year_inversion(self):
        """公元年份逆序也应报。"""
        text = """# 大事记

## 讲事情

220年，曹操去世。
200年，官渡之战爆发。
"""
        issues = check_timeline_inversion(text)
        inv_issues = [
            i for i in issues
            if i.type == "timeline_inversion"
        ]
        assert len(inv_issues) >= 1, f"公元年份逆序应报，实际: {issues}"


# ---------------------------------------------------------------------------
# 5. 综合入口 + archetype 路由
# ---------------------------------------------------------------------------

class TestCheckConsistencyEntryPoint:
    """check_consistency 主入口 + archetype 路由。"""

    def test_consistency_report_passed_property(self):
        """ConsistencyReport.passed：至多 1 个 P0 或 2 个 P1。"""
        # 无问题
        clean_text = "# 标题\n这是一段没有矛盾的文本。\n"
        report = check_consistency(clean_text, archetype="narrative")
        assert report.passed is True
        assert report.score == 10

    def test_consistency_report_score_property(self):
        """ConsistencyReport.score：P0 扣 5，P1 扣 3，P2 扣 2，下限 0。"""
        # 制造 1 个 P0 矛盾
        text = """# 测试
曹操生于前155年，前140年继位时25岁。
"""
        report = check_consistency(text, archetype="narrative")
        # 应有 1 个 P0，score = 10 - 5 = 5
        assert report.score == 5, f"P0 应扣 5 分，实际 score={report.score}"

    def test_archetype_routing_narrative(self):
        """narrative archetype 应跑全部 4 类检测。"""
        text = """# 测试
曹操生于前155年，前140年继位时25岁。
「君君臣臣」这四个字，「君君臣臣」这五个字。
"""
        report = check_consistency(text, archetype="narrative")
        assert len(report.issues) >= 2, f"应检测到 2+ 类矛盾，实际: {report.issues}"

    def test_archetype_routing_modern(self):
        """modern archetype 也应能跑（职场类内容）。"""
        text = """# 职场沟通
小王入职三年，担任项目经理五年。  # 数学矛盾
"""
        # modern archetype 不会爆错
        report = check_consistency(text, archetype="modern")
        assert isinstance(report, ConsistencyReport)
        assert isinstance(report.issues, list)

    def test_archetype_routing_knowledge(self):
        """knowledge archetype 不应爆错。"""
        text = """# MySQL 索引
B+ 树是 MySQL InnoDB 的默认索引结构。
"""
        report = check_consistency(text, archetype="knowledge")
        assert isinstance(report, ConsistencyReport)


# ---------------------------------------------------------------------------
# 6. 集成层：content_quality.py 联动
# ---------------------------------------------------------------------------

class TestContentQualityIntegration:
    """content_quality.py 应将 consistency 维度纳入 6 维度评分。"""

    def test_consistency_dimension_in_details(self):
        """run_content_quality_checks 的 details 应包含 consistency 键。"""
        from src.utils.content_quality import run_content_quality_checks
        text = """---
title: 测试
book: 测试
chapter: 测试
event: 测试
sort: 1
chapter_sort: 1
---

# 测试

曹操生于前155年，前140年继位时25岁。
"""
        report = run_content_quality_checks(text, archetype="narrative")
        assert "consistency" in report.details, "details 应包含 consistency 键"
        # 应至少有 1 个一致性问题
        assert len(report.details["consistency"]) >= 1, f"应检测到一致性问题，实际: {report.details['consistency']}"

    def test_consistency_dimension_clean(self):
        """无矛盾内容，consistency 维度应为空列表。"""
        from src.utils.content_quality import run_content_quality_checks
        text = """---
title: 测试
book: 测试
chapter: 测试
event: 测试
sort: 1
chapter_sort: 1
---

# 测试

这是一段没有矛盾的简短文本。
"""
        report = run_content_quality_checks(text, archetype="narrative")
        assert "consistency" in report.details
        assert len(report.details["consistency"]) == 0, f"无矛盾不应有问题，实际: {report.details['consistency']}"

    def test_consistency_score_impact(self):
        """有 P0 一致性问题时，总分应扣分（10 - score）。"""
        from src.utils.content_quality import run_content_quality_checks
        text_dirty = """---
title: 测试
book: 测试
chapter: 测试
event: 测试
sort: 1
chapter_sort: 1
---

# 测试

曹操生于前155年，前140年继位时25岁。
"""
        text_clean = """---
title: 测试
book: 测试
chapter: 测试
event: 测试
sort: 1
chapter_sort: 1
---

# 测试

这是一段没有矛盾的简短文本。
"""
        dirty = run_content_quality_checks(text_dirty, archetype="narrative")
        clean = run_content_quality_checks(text_clean, archetype="narrative")
        # 有矛盾的总分应低于无矛盾的
        assert dirty.score < clean.score, (
            f"有矛盾应扣分: dirty={dirty.score}, clean={clean.score}"
        )
