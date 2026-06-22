"""构建脚本 build_site.py 的单元测试。

使用 pytest 函数式风格，借助 tempfile 隔离每个用例的文件系统。
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from scripts.build_site import build_site


SAMPLE_FRONTMATTER = """---
title: "商鞅变法"
book: "资治通鉴"
chapter: "周纪二"
event: "商鞅变法"
created_at: "2026-06-21T23:00:00+08:00"
source_agents:
  - historian
  - biographer
---

## 讲事情

商鞅入秦，徙木立信。
"""


def _create_sample_output(output_dir: Path) -> None:
    """在 output_dir 下创建样例笔记。"""
    note_path = output_dir / "资治通鉴" / "周纪二_商鞅变法.md"
    note_path.parent.mkdir(parents=True, exist_ok=True)
    note_path.write_text(SAMPLE_FRONTMATTER, encoding="utf-8")


def test_build_site_creates_site_directory():
    """构建后 site/ 目录存在。"""
    with tempfile.TemporaryDirectory() as tmp:
        output_dir = Path(tmp) / "output"
        site_dir = Path(tmp) / "site"
        _create_sample_output(output_dir)
        result = build_site(str(output_dir), str(site_dir))
        assert result.exists()
        assert result.is_dir()


def test_build_site_generates_index_json():
    """site/data/index.json 存在且可解析。"""
    with tempfile.TemporaryDirectory() as tmp:
        output_dir = Path(tmp) / "output"
        site_dir = Path(tmp) / "site"
        _create_sample_output(output_dir)
        build_site(str(output_dir), str(site_dir))
        index_path = site_dir / "data" / "index.json"
        assert index_path.exists()
        data = json.loads(index_path.read_text(encoding="utf-8"))
        assert isinstance(data, dict)
        assert "version" in data
        assert "generated_at" in data
        assert "stats" in data
        assert "tree" in data
        assert "notes" in data


def test_index_json_tree_structure():
    """tree 结构正确（book→chapter→event）。"""
    with tempfile.TemporaryDirectory() as tmp:
        output_dir = Path(tmp) / "output"
        site_dir = Path(tmp) / "site"
        _create_sample_output(output_dir)
        build_site(str(output_dir), str(site_dir))
        data = json.loads(
            (site_dir / "data" / "index.json").read_text(encoding="utf-8")
        )
        tree = data["tree"]
        assert len(tree) == 1

        book_node = tree[0]
        assert book_node["title"] == "资治通鉴"
        assert book_node["type"] == "book"
        assert len(book_node["children"]) == 1

        chapter_node = book_node["children"][0]
        assert chapter_node["title"] == "周纪二"
        assert chapter_node["type"] == "chapter"
        assert len(chapter_node["children"]) == 1

        event_node = chapter_node["children"][0]
        assert event_node["title"] == "商鞅变法"
        assert event_node["type"] == "event"
        assert event_node["path"] == "资治通鉴/周纪二_商鞅变法.md"


def test_index_json_notes_content():
    """notes 字典含正确字段。"""
    with tempfile.TemporaryDirectory() as tmp:
        output_dir = Path(tmp) / "output"
        site_dir = Path(tmp) / "site"
        _create_sample_output(output_dir)
        build_site(str(output_dir), str(site_dir))
        data = json.loads(
            (site_dir / "data" / "index.json").read_text(encoding="utf-8")
        )
        notes = data["notes"]
        assert "资治通鉴/周纪二_商鞅变法.md" in notes

        note = notes["资治通鉴/周纪二_商鞅变法.md"]
        assert note["path"] == "资治通鉴/周纪二_商鞅变法.md"
        assert note["book"] == "资治通鉴"
        assert note["chapter"] == "周纪二"
        assert note["event"] == "商鞅变法"
        assert note["title"] == "商鞅变法"
        assert note["created_at"] == "2026-06-21T23:00:00+08:00"
        assert note["source_agents"] == ["historian", "biographer"]
        assert "## 讲事情" in note["content"]
        assert "商鞅入秦" in note["content"]


def test_build_site_copies_notes():
    """site/notes/ 下有 Markdown 文件副本。"""
    with tempfile.TemporaryDirectory() as tmp:
        output_dir = Path(tmp) / "output"
        site_dir = Path(tmp) / "site"
        _create_sample_output(output_dir)
        build_site(str(output_dir), str(site_dir))
        note_copy = site_dir / "notes" / "资治通鉴" / "周纪二_商鞅变法.md"
        assert note_copy.exists()
        text = note_copy.read_text(encoding="utf-8")
        assert text.startswith("---")
        assert "## 讲事情" in text
        assert "商鞅入秦" in text


def test_build_site_empty_output():
    """output/ 为空时不报错，tree 为空列表。"""
    with tempfile.TemporaryDirectory() as tmp:
        output_dir = Path(tmp) / "output"
        site_dir = Path(tmp) / "site"
        # output 目录不存在
        build_site(str(output_dir), str(site_dir))
        index_path = site_dir / "data" / "index.json"
        assert index_path.exists()
        data = json.loads(index_path.read_text(encoding="utf-8"))
        assert data["tree"] == []
        assert data["notes"] == {}
        assert data["stats"]["books"] == 0
        assert data["stats"]["notes"] == 0


def test_build_site_idempotent():
    """连续构建两次结果一致。"""
    with tempfile.TemporaryDirectory() as tmp:
        output_dir = Path(tmp) / "output"
        site_dir = Path(tmp) / "site"
        _create_sample_output(output_dir)

        build_site(str(output_dir), str(site_dir))
        data1 = json.loads(
            (site_dir / "data" / "index.json").read_text(encoding="utf-8")
        )

        build_site(str(output_dir), str(site_dir))
        data2 = json.loads(
            (site_dir / "data" / "index.json").read_text(encoding="utf-8")
        )

        # generated_at 可能因时间不同而变化，但 tree/notes/stats 应一致
        assert data1["tree"] == data2["tree"]
        assert data1["notes"] == data2["notes"]
        assert data1["stats"] == data2["stats"]


def test_index_json_chinese_not_escaped():
    """JSON 文件中中文不被 \\u 转义。"""
    with tempfile.TemporaryDirectory() as tmp:
        output_dir = Path(tmp) / "output"
        site_dir = Path(tmp) / "site"
        _create_sample_output(output_dir)
        build_site(str(output_dir), str(site_dir))
        raw = (site_dir / "data" / "index.json").read_text(encoding="utf-8")
        assert "资治通鉴" in raw
        assert "周纪二" in raw
        assert "商鞅变法" in raw
        assert "\\u" not in raw


def test_build_site_cli():
    """CLI 调用 python scripts/build_site.py --output ... --site ... 返回 0。"""
    with tempfile.TemporaryDirectory() as tmp:
        output_dir = Path(tmp) / "output"
        site_dir = Path(tmp) / "site"
        _create_sample_output(output_dir)
        result = subprocess.run(
            [
                sys.executable,
                "scripts/build_site.py",
                "--output",
                str(output_dir),
                "--site",
                str(site_dir),
            ],
            cwd=Path(__file__).parent.parent,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stderr
        assert (site_dir / "data" / "index.json").exists()
        assert (
            site_dir / "notes" / "资治通鉴" / "周纪二_商鞅变法.md"
        ).exists()
