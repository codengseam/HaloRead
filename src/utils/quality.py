import re
from typing import Dict, List

# 显性 AI 套路句式
AI_PATTERNS_EXPLICIT = [
    r"我们可以看到",
    r"这告诉我们",
    r"总而言之",
    r"综上所述",
    r"值得注意的是",
    r"不难发现",
    r"从这个角度来看",
]

# 软性 AI 套路句式（LoopAgent 第1章测评后新增）
AI_PATTERNS_SOFT = [
    r"这件事说明",
    r"这是典型的",
    r"这是他的.*面",
    r"从结果看.*但从格局看",
    r"不是偶然",
    r"容易被忽略",
    r"最关键的.*是",
    r"与.*一脉相承",
    r"放到今天依然成立",
    r"这条规律到今天没变",
    r"这不是.*是.*式重新定义",
    r"原文大意是",
    r"核心论点是",
    r"还有一层背景容易被忽略",
    # 第2章测评后新增
    r"不是.*而是",  # 「不是X而是Y」句式
    r"他不是.*是",  # 「他不是X，是Y」
    r"这说明",
    r"这话提醒我们",
    r"可见",  # 「可见」作段尾总结
    r"第[一二三四五六]层",  # 分点骨架
    r"经得起反复咀嚼",
    # 第5章测评后新增
    r"这事说明",  # 「这事说明」软性AI套路
    r"还有一层背景须交代",  # 模板过渡
    r"另有一层.*须说明",  # 模板过渡
    # 第6章测评后新增
    r"再说一层背景",  # 模板过渡
    r"这道理在历史上反复应验",  # 模板过渡
    r"这道理在历史上也有映照",  # 模板过渡
    r"这道理.*也懂",  # 模板过渡
    r"这思路在后世也有人用",  # 模板过渡
]

# 现代学科术语（历史叙事中禁用）
MODERN_JARGON = [
    r"博弈论",
    r"坐标系",
    r"放大器",
    r"最小获胜联盟",
    r"零和博弈",
    r"底层逻辑",
    r"纳什均衡",
    r"帕累托",
    # 第2章测评后新增
    r"方法论",
    r"资产",  # 「信用是最贵的资产」
    r"润滑剂",
    r"精算师",
    r"效率极高",
    r"效率极低",
    r"死穴",  # 偏现代口语术语
    r"模式",  # 「能臣靠明主模式」
    # 第4章测评后新增
    r"天使投资",
    r"社会流动",
    r"常设机构",
    r"约束机制",
    r"纸面实力",
    r"外交战",
    r"硬道理",
    r"扎心",
    r"资本",  # 「翻身的唯一资本」现代用法
    r"缩影",
    r"教科书级",
    r"大洗牌",
    # 第5章测评后新增
    r"智商.*掉线",  # 网络流行语
    r"话术",  # 偏现代词
]

AI_PATTERNS = AI_PATTERNS_EXPLICIT + AI_PATTERNS_SOFT


def check_structure(content: str, required_sections: List[str]) -> List[str]:
    issues = []
    for section in required_sections:
        if section not in content:
            issues.append(f"缺少章节：{section}")
    return issues


def check_ai_tone(content: str) -> List[str]:
    issues = []
    for pattern in AI_PATTERNS:
        if re.search(pattern, content):
            issues.append(f"疑似 AI 味句式：{pattern}")
    return issues


def check_modern_jargon(content: str) -> List[str]:
    """检测历史叙事中硬塞的现代学科术语。"""
    issues = []
    for pattern in MODERN_JARGON:
        if re.search(pattern, content):
            issues.append(f"历史叙事中疑似硬塞现代术语：{pattern}")
    return issues


def check_mixed_language(content: str) -> List[str]:
    issues = []
    # 简单检查中英混杂：中文后紧跟英文单词（专有名词除外可后续优化）
    matches = re.findall(r"[\u4e00-\u9fff]+[a-zA-Z]{2,}", content)
    if matches:
        issues.append("检测到可能的中英文混杂")
    return issues


def check_sublimation_quota(content: str) -> List[str]:
    """检测段尾升华是否超额（讲人物/讲背景/讲道理段尾不应升华）。"""
    issues = []
    # 简单启发式：检查讲人物段尾是否有定性句
    for section in ["讲人物", "讲背景", "讲道理"]:
        # 匹配该段到下一个二级标题之间的内容
        pattern = rf"## {section}.*?(?=\n## |\Z)"
        match = re.search(pattern, content, re.DOTALL)
        if match:
            tail = match.group().strip().split("\n")[-3:]
            tail_text = "".join(tail)
            # 检测段尾定性升华
            sublimation_markers = ["这是他的", "这是典型的", "一脉相承", "放到今天"]
            for marker in sublimation_markers:
                if marker in tail_text:
                    issues.append(f"{section}段尾疑似升华：{marker}")
    return issues


def run_quality_check(content: str, required_sections: List[str]) -> Dict[str, List[str]]:
    return {
        "structure": check_structure(content, required_sections),
        "ai_tone": check_ai_tone(content),
        "modern_jargon": check_modern_jargon(content),
        "mixed_language": check_mixed_language(content),
        "sublimation_quota": check_sublimation_quota(content),
    }
