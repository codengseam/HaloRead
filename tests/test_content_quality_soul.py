"""灵魂维度自动算分测试（反馈循环第一档收尾）。

覆盖 content_quality.py 新增的 _check_soul_dimension 与 details["soul"]：
- §9.2 AI 套话黑名单命中 ≥3 次触发 soul 扣分
- §9.3 数字事实硬错误触发 soul 扣分
- §9.4 章回体标题灵魂不足触发 soul 扣分
- 干净内容不触发 soul 扣分
- details 含 soul 维度
"""
from src.utils.content_quality import run_content_quality_checks, _check_soul_dimension


def _clean_content():
    """构造一份无明显问题的内容（narrative 桶，6 段齐全）。"""
    return (
        "---\n"
        'title: "测试"\n'
        'book: "史记"\n'
        'chapter: "项羽本纪"\n'
        'event: "巨鹿之战"\n'
        'created_at: "2026-06-27T00:00:00+08:00"\n'
        "source_agents:\n  - historian\n"
        "---\n\n"
        "## 讲事情\n项羽破釜沉舟，渡河救赵。\n\n"
        "## 讲人物\n项羽勇冠三军，诸侯莫敢仰视。\n\n"
        "## 讲背景\n秦末天下大乱，陈胜吴广首义。\n\n"
        "## 讲道理\n巨鹿一战定乾坤，项羽威震四海。\n\n"
        "## 问道悟道\n勇者无惧，然刚极易折。\n\n"
        "## 巨鹿余响\n巨鹿之战是项羽霸业的起点。\n"
    )


def test_soul_dimension_is_in_details():
    """details 应包含 soul 维度。"""
    report = run_content_quality_checks(_clean_content(), archetype="narrative")
    assert "soul" in report.details, "details 应含 soul 维度"


def test_soul_clean_content_no_soul_issues():
    """干净内容不触发 soul 扣分。"""
    report = run_content_quality_checks(_clean_content(), archetype="narrative")
    assert report.details["soul"] == [], f"干净内容不应有 soul 问题，实际: {report.details['soul']}"


def test_soul_ai_cliches_triggers_soul_issue():
    """§9.2 AI 套话黑名单命中 ≥3 次触发 soul 维度问题。"""
    content = _clean_content().replace(
        "项羽破釜沉舟",
        "宛如一颗璀璨的明珠，深刻地揭示了时代的缩影，放之四海而皆准的正确废话",
    )
    report = run_content_quality_checks(content, archetype="narrative")
    soul_issues_text = " ".join(report.details["soul"])
    assert "§9.2" in soul_issues_text, f"应触发 §9.2 AI 套话，实际: {report.details['soul']}"


def test_soul_numeric_fact_error_triggers_soul_issue():
    """§9.3 数字事实硬错误触发 soul 维度问题。

    check_numeric_facts 正则只匹配阿拉伯数字（(\\d+)个字），且 expected != actual 才算硬错误。
    """
    content = _clean_content().replace(
        "项羽破釜沉舟，渡河救赵。",
        "3个字：项羽破釜",
    )
    report = run_content_quality_checks(content, archetype="narrative")
    soul_issues_text = " ".join(report.details["soul"])
    assert "§9.3" in soul_issues_text, f"应触发 §9.3 数字事实硬错误，实际: {report.details['soul']}"


def test_soul_low_score_title_triggers_soul_issue():
    """§9.4 章回体标题灵魂不足（单标题 <3 分）触发 soul 维度问题。"""
    content = _clean_content().replace("## 讲事情", "## 备棺")
    report = run_content_quality_checks(content, archetype="narrative")
    soul_issues_text = " ".join(report.details["soul"])
    assert "§9.4" in soul_issues_text, f"应触发 §9.4 标题灵魂不足，实际: {report.details['soul']}"


def test_soul_dimension_deducts_score():
    """soul 维度问题应参与总分扣分。"""
    # 干净内容
    clean_report = run_content_quality_checks(_clean_content(), archetype="narrative")
    # 加套话触发 soul
    bad_content = _clean_content().replace(
        "项羽破釜沉舟",
        "宛如一颗璀璨的明珠，深刻地揭示了时代的缩影，放之四海而皆准的正确废话",
    )
    bad_report = run_content_quality_checks(bad_content, archetype="narrative")
    assert bad_report.score <= clean_report.score, (
        f"有 soul 问题的分数应 ≤ 干净分数，实际 bad={bad_report.score} clean={clean_report.score}"
    )
