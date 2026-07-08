#!/usr/bin/env python3
"""检测所有远程分支上存在但 master 缺失的 output 专栏。

用于：
1. 合并前检查——防止功能分支覆盖 master 已有专栏
2. 定期巡检——发现 agent 分支生成但未合入 master 的「失踪」专栏
3. 分支清理前确认——避免删除仍携带独有专栏的分支

用法：
    python scripts/check_missing_columns.py            # 检查远程分支
    python scripts/check_missing_columns.py --local    # 检查本地分支
    python scripts/check_missing_columns.py --strict   # 有缺失则非零退出（CI 用）

退出码：
    0 = 无缺失
    1 = 有缺失（--strict 模式）
"""
import argparse
import subprocess
import sys


def decode_git_path(name: str) -> str:
    """解码 git ls-tree 的八进制转义中文路径。"""
    name = name.replace('output/', '').strip('"')
    try:
        name = name.encode('latin1').decode('unicode_escape').encode('latin1').decode('utf-8')
    except Exception:
        pass
    return name


def list_columns(ref: str) -> set:
    """列出某个 git ref 下 output/ 的所有专栏目录名。"""
    result = subprocess.run(
        ['git', 'ls-tree', '-d', '--name-only', ref, 'output/'],
        capture_output=True, text=True, timeout=30,
    )
    cols = set()
    for line in result.stdout.strip().split('\n'):
        if not line:
            continue
        cols.add(decode_git_path(line))
    return cols


def list_branches(local: bool) -> list:
    """列出所有分支（本地或远程），排除 master/main/gh-pages/HEAD。"""
    fmt = '%(refname:short)' if local else '%(refname:short)'
    cmd = ['git', 'branch' if local else 'branch', '-r' if not local else '', '--format=' + fmt]
    cmd = [c for c in cmd if c]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
    branches = []
    for b in result.stdout.strip().split('\n'):
        b = b.strip()
        if not b or 'HEAD' in b:
            continue
        # 排除受保护分支
        if b in ('master', 'main', 'origin/master', 'origin/main', 'origin/gh-pages'):
            continue
        if b.startswith('release/') or b.startswith('origin/release/'):
            continue
        branches.append(b)
    return branches


def main():
    parser = argparse.ArgumentParser(description='检测 master 缺失的专栏')
    parser.add_argument('--local', action='store_true', help='检查本地分支（默认检查远程）')
    parser.add_argument('--strict', action='store_true', help='有缺失则非零退出')
    args = parser.parse_args()

    # 确保 origin 引用是最新的（检查远程分支时）
    if not args.local:
        subprocess.run(['git', 'fetch', '--quiet', 'origin'], timeout=60)

    master_cols = list_columns('master')
    print(f"master 专栏数: {len(master_cols)}")

    branches = list_branches(local=args.local)
    print(f"待检查分支数: {len(branches)}")
    print()

    missing = {}  # 专栏名 -> [来源分支]
    for b in branches:
        try:
            branch_cols = list_columns(b)
        except subprocess.TimeoutExpired:
            print(f"  ⚠️ 分支 {b} 检查超时，跳过")
            continue
        extra = branch_cols - master_cols
        if extra:
            for col in extra:
                missing.setdefault(col, []).append(b)

    if not missing:
        print("✅ 无缺失——所有分支的专栏都在 master 上")
        return 0

    print(f"❌ 发现 {len(missing)} 个 master 缺失的专栏：\n")
    for col in sorted(missing.keys()):
        sources = missing[col]
        print(f"  ❌ {col}")
        for s in sources:
            print(f"      来源: {s}")
    print()
    print("找回命令：")
    for col in sorted(missing.keys()):
        src = missing[col][0]
        print(f"  git checkout {src} -- \"output/{col}\"")
    print()
    print("找回后：git add → git commit → 跑 check_book_structure --strict → push")

    if args.strict:
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
