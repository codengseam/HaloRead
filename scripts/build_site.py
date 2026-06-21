#!/usr/bin/env python3
"""静态站点构建脚本。

扫描 output/ 目录下的 Markdown 笔记，生成静态站点到 site/ 目录，
用于部署到 GitHub Pages。

用法：
    python scripts/build_site.py [--output output] [--site site]
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    import yaml  # type: ignore
except ImportError:
    yaml = None  # type: ignore

VERSION = "1.0.0"
FRONTMATTER_PATTERN = r"^---\s*\n(.*?)\n---\s*\n?"


def _parse_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    """解析 Markdown frontmatter，返回 (metadata, body)。

    优先使用 PyYAML；不可用时 fallback 到简单 key:value 解析。
    """
    match = re.match(FRONTMATTER_PATTERN, content, re.DOTALL)
    if not match:
        return {}, content

    raw = match.group(1)
    body = content[match.end():]

    if yaml is not None:
        try:
            data = yaml.safe_load(raw)
            if isinstance(data, dict):
                return data, body
        except Exception:
            pass

    return _parse_simple_frontmatter(raw), body


def _parse_simple_frontmatter(raw: str) -> dict[str, Any]:
    """无 PyYAML 时解析简单 frontmatter（顶层标量/列表）。"""
    result: dict[str, Any] = {}
    current_key: str | None = None
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("- "):
            if current_key is not None:
                item = stripped[2:].strip().strip('"').strip("'")
                if not isinstance(result.get(current_key), list):
                    result[current_key] = []
                result[current_key].append(item)
            continue
        if ":" in stripped:
            key, _, value = stripped.partition(":")
            current_key = key.strip()
            result[current_key] = value.strip().strip('"').strip("'")
    return result


def _parse_note_path(rel_path: str) -> tuple[str, str, str] | None:
    """解析相对路径为 (book, chapter, event)。

    路径格式：book/chapter_event.md
    """
    parts = rel_path.split("/")
    if len(parts) < 2:
        return None
    book = parts[0]
    stem = parts[-1]
    if stem.endswith(".md"):
        stem = stem[:-3]
    if "_" in stem:
        chapter, event = stem.split("_", 1)
    else:
        chapter = stem
        event = ""
    return book, chapter, event


def _normalize_source_agents(value: Any) -> list[str]:
    """将 source_agents 规范化为字符串列表。"""
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)]


def _normalize_created_at(value: Any) -> str:
    """将 created_at 规范化为字符串。"""
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def build_site(output_dir: str = "output", site_dir: str = "site") -> Path:
    """扫描 output/ 下的 Markdown 笔记，生成静态站点到 site/。

    Args:
        output_dir: 笔记源目录，默认 "output"。
        site_dir: 静态站点输出目录，默认 "site"。

    Returns:
        站点输出目录的 Path。
    """
    output_path = Path(output_dir)
    site_path = Path(site_dir)

    data_dir = site_path / "data"
    notes_dir = site_path / "notes"
    data_dir.mkdir(parents=True, exist_ok=True)
    notes_dir.mkdir(parents=True, exist_ok=True)

    # 清空 notes 目录，保证幂等（处理笔记删除场景）
    for child in notes_dir.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()

    notes: dict[str, dict[str, Any]] = {}
    books: dict[str, dict[str, list[dict[str, Any]]]] = {}

    if output_path.exists():
        for md_path in sorted(output_path.rglob("*.md")):
            rel = md_path.relative_to(output_path)
            rel_str = str(rel).replace("\\", "/")
            parsed = _parse_note_path(rel_str)
            if parsed is None:
                continue
            book, chapter, event = parsed

            text = md_path.read_text(encoding="utf-8")
            frontmatter, content = _parse_frontmatter(text)

            title = frontmatter.get("title") or event or chapter
            if not isinstance(title, str):
                title = str(title)
            created_at = _normalize_created_at(frontmatter.get("created_at"))
            source_agents = _normalize_source_agents(frontmatter.get("source_agents"))

            note_entry = {
                "path": rel_str,
                "book": book,
                "chapter": chapter,
                "event": event,
                "title": title,
                "created_at": created_at,
                "source_agents": source_agents,
                "content": content,
            }
            notes[rel_str] = note_entry

            books.setdefault(book, {}).setdefault(chapter, []).append(
                {
                    "title": event or chapter,
                    "type": "event",
                    "path": rel_str,
                }
            )

            # 复制 Markdown 文件到 site/notes/（保持相对路径结构）
            dest = notes_dir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(md_path, dest)

    # 构建按字母排序的 tree：book -> chapter -> event
    tree: list[dict[str, Any]] = []
    for book_name in sorted(books.keys()):
        book_node: dict[str, Any] = {
            "title": book_name,
            "type": "book",
            "children": [],
        }
        for chapter_name in sorted(books[book_name].keys()):
            events = sorted(
                books[book_name][chapter_name], key=lambda e: e["path"]
            )
            book_node["children"].append(
                {
                    "title": chapter_name,
                    "type": "chapter",
                    "children": events,
                }
            )
        tree.append(book_node)

    index = {
        "version": VERSION,
        "generated_at": datetime.now()
        .astimezone()
        .replace(microsecond=0)
        .isoformat(),
        "stats": {"books": len(books), "notes": len(notes)},
        "tree": tree,
        "notes": notes,
    }

    index_path = data_dir / "index.json"
    index_path.write_text(
        json.dumps(index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return site_path


def main(argv: list[str] | None = None) -> int:
    """CLI 入口。"""
    parser = argparse.ArgumentParser(
        description="扫描 output/ 下的 Markdown 笔记，生成静态站点到 site/。"
    )
    parser.add_argument(
        "--output", default="output", help="笔记源目录（默认 output）"
    )
    parser.add_argument(
        "--site", default="site", help="站点输出目录（默认 site）"
    )
    args = parser.parse_args(argv)

    site_path = build_site(output_dir=args.output, site_dir=args.site)
    print(f"静态站点已生成: {site_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
