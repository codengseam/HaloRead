from pathlib import Path
from typing import Annotated, Dict, List

from typing_extensions import TypedDict


def dict_merge(old: Dict[str, str], new: Dict[str, str]) -> Dict[str, str]:
    return {**old, **new}


class AgentState(TypedDict):
    book: str
    chapter: str
    event: str
    archetype: str
    user_input: str
    output_path: str
    sections: Annotated[Dict[str, str], dict_merge]
    sources: Annotated[Dict[str, List[str]], dict_merge]
    final_markdown: str
    errors: Annotated[List[str], lambda a, b: a + b]
    # 反馈循环第一档：质检 score 落盘到 state（feedback-loop/design.md §4.1）
    # quality_node 灌入；save_node 消费写 frontmatter / _meta.yaml / score_history。
    quality_score: int
    quality_dimensions: Dict[str, int]
