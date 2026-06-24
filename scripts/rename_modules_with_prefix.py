"""将养生类课程文件名统一为「模块N模块名_章节名.md」格式，并同步 frontmatter 中的 chapter 字段。"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

# 模块顺序定义（与 migrate_wellness_books.py 保持一致）
BOOK_MODULES: dict[str, list[str]] = {
    "饮食养生课": [
        "开篇",
        "饮食的底层逻辑",
        "喝水",
        "吃饭",
        "水果",
        "菜谱与烹饪",
        "饮食习惯",
        "场景化解决方案",
        "误区与避坑",
        "长期饮食体系",
    ],
    "饮食养生课第二版": [
        "食养根本",
        "食材列传",
        "饮之有道",
        "厨房之道",
        "吃法决定命运",
        "吃出一辈子",
    ],
    "睡眠与精力修复课": [
        "开篇",
        "修复的底层逻辑",
        "夜间睡眠优化",
        "日间快速修复",
        "冥想与呼吸修复",
        "场景化解决方案",
        "误区避坑与长期体系",
    ],
}


def _parse_frontmatter(path: Path) -> tuple[str, str] | None:
    """读取并返回 (frontmatter, body)；若格式不对返回 None。"""
    content = path.read_text(encoding="utf-8")
    if not content.startswith("---"):
        return None
    end = content.find("---", 3)
    if end == -1:
        return None
    return content[: end + 3], content[end + 3 :]


def _update_chapter(frontmatter: str, new_chapter: str) -> str:
    """更新 frontmatter 中的 chapter 字段。"""
    pattern = re.compile(r"^(chapter:\s*).*?$", re.MULTILINE)
    if pattern.search(frontmatter):
        return pattern.sub(r"\1" + new_chapter, frontmatter)
    # 没有 chapter 字段时追加到末尾
    return frontmatter.rstrip() + f"\nchapter: {new_chapter}\n"


def rename_book(book_dir: Path, modules: list[str]) -> list[str]:
    """重命名单本书内的笔记文件，返回操作日志。"""
    logs: list[str] = []
    module_index = {name: idx for idx, name in enumerate(modules)}

    for path in sorted(book_dir.glob("*.md")):
        if path.name.startswith("_"):
            continue
        if "_" not in path.stem:
            continue
        module, event = path.stem.split("_", 1)
        if module not in module_index:
            logs.append(f"跳过未识别模块: {path.name}")
            continue
        idx = module_index[module]
        new_name = f"模块{idx}{module}_{event}.md"
        if path.name == new_name:
            continue

        parsed = _parse_frontmatter(path)
        if parsed is None:
            logs.append(f"无 frontmatter，仅重命名: {path.name} -> {new_name}")
            path.rename(path.parent / new_name)
            continue

        frontmatter, body = parsed
        new_chapter = f"模块{idx}{module}"
        new_frontmatter = _update_chapter(frontmatter, new_chapter)
        (path.parent / new_name).write_text(
            new_frontmatter + body, encoding="utf-8"
        )
        path.unlink()
        logs.append(f"{path.name} -> {new_name} (chapter: {new_chapter})")

    return logs


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="output")
    args = parser.parse_args()

    output = Path(args.output)
    all_logs: list[str] = []
    for book, modules in BOOK_MODULES.items():
        book_dir = output / book
        if not book_dir.exists():
            print(f"跳过不存在的目录: {book_dir}")
            continue
        logs = rename_book(book_dir, modules)
        all_logs.extend([f"[{book}] {line}" for line in logs])

    print("\n".join(all_logs))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
