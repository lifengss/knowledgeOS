#!/usr/bin/env python3
"""case-generator: MCP 知识查询接口。

供 AI 平台在生成测试用例时调用，返回全量存量知识。
只读 Brain 仓库，不调用 LLM。
"""

import json
import subprocess
import sys
from typing import Any, Optional


def _gbrain_query(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """调用 gbrain query 进行混合搜索。"""
    try:
        result = subprocess.run(
            ["gbrain", "query", query, "--no-expand"],
            capture_output=True,
            text=True,
            check=True,
            encoding="utf-8",
        )
        # 解析输出（gbrain query 返回 Markdown 格式的结果）
        lines = result.stdout.strip().split("\n")
        results = []
        current = {}
        for line in lines:
            line = line.strip()
            if line.startswith("# ") or line.startswith("## "):
                if current:
                    results.append(current)
                current = {"title": line.lstrip("# ").strip(), "content": ""}
            elif current:
                current["content"] += line + "\n"
        if current:
            results.append(current)
        return results[:limit]
    except subprocess.CalledProcessError as e:
        print(f"[case-generator] gbrain query 失败: {e.stderr}", file=sys.stderr)
        return []


def _gbrain_search(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """调用 gbrain search 进行关键词搜索。"""
    try:
        result = subprocess.run(
            ["gbrain", "search", query],
            capture_output=True,
            text=True,
            check=True,
            encoding="utf-8",
        )
        lines = result.stdout.strip().split("\n")
        results = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            # 格式: [score] slug -- content
            if line.startswith("[") and "]" in line:
                score_end = line.index("]")
                score = line[1:score_end]
                rest = line[score_end + 1 :].strip()
                if " -- " in rest:
                    slug, title = rest.split(" -- ", 1)
                    slug = slug.strip()
                    title = title.strip()
                    if slug and title:
                        results.append(
                            {
                                "slug": slug,
                                "title": title[:100],
                                "score": float(score) if score else 0.0,
                            }
                        )
        return results[:limit]
    except subprocess.CalledProcessError as e:
        print(f"[case-generator] gbrain search 失败: {e.stderr}", file=sys.stderr)
        return []


def _gbrain_get(slug: str) -> dict[str, Any]:
    """调用 gbrain get 获取页面详情。"""
    try:
        result = subprocess.run(
            ["gbrain", "get", slug],
            capture_output=True,
            text=True,
            check=True,
            encoding="utf-8",
        )
        return {"slug": slug, "content": result.stdout}
    except subprocess.CalledProcessError as e:
        print(f"[case-generator] gbrain get {slug} 失败: {e.stderr}", file=sys.stderr)
        return {"slug": slug, "content": ""}


def _gbrain_graph(slug: str, depth: int = 2) -> list[dict[str, Any]]:
    """调用 gbrain graph 获取知识图谱。"""
    try:
        result = subprocess.run(
            ["gbrain", "graph", slug, "--depth", str(depth)],
            capture_output=True,
            text=True,
            check=True,
            encoding="utf-8",
        )
        # 解析图谱输出
        lines = result.stdout.strip().split("\n")
        nodes = []
        for line in lines:
            line = line.strip()
            if line and not line.startswith("#"):
                nodes.append({"name": line})
        return nodes
    except subprocess.CalledProcessError as e:
        print(f"[case-generator] gbrain graph {slug} 失败: {e.stderr}", file=sys.stderr)
        return []


def _fs_search(brain_dirs, query, limit=10):
    """在多个 Brain 目录中做关键词检索（多项目隔离 + 共享合并）。"""
    import re
    from pathlib import Path

    q = (query or "").strip().lower()
    if not q:
        return []
    terms = [t for t in re.split(r"[\s,，。；;]+", q) if t]
    hits = []
    for bdir in brain_dirs or []:
        bpath = Path(bdir)
        if not bpath.exists():
            continue
        for md in bpath.rglob("*.md"):
            try:
                text = md.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            low = text.lower()
            score = 0
            title = ""
            fm = re.search(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
            if fm:
                tm = re.search(r'title:\s*"?([^"\n]+)"?', fm.group(1))
                if tm:
                    title = tm.group(1).strip()
            fname = md.stem
            for t in terms:
                if t in low:
                    score += 1
                if title and t in title.lower():
                    score += 2
                if t in fname.lower():
                    score += 1
            if score > 0:
                hits.append({
                    "slug": str(md),
                    "title": title or fname,
                    "type": md.parent.name,
                    "score": float(score),
                    "snippet": text[:200].replace("\n", " "),
                    "content": text,
                })
    hits.sort(key=lambda x: x["score"], reverse=True)
    return hits[:limit]


def generate_cases(
    query: str,
    mode: str = "keyword",
    limit: int = 10,
    filters: Optional[dict[str, str]] = None,
    brain_dirs: Optional[list[str]] = None,
) -> dict[str, Any]:
    """生成用例所需的知识上下文。

    Args:
        query: 查询关键词或问题
        mode: keyword / graph / query（混合搜索）
        limit: 返回结果数量
        filters: 过滤条件
        brain_dirs: 多项目隔离时的 Brain 目录列表（项目私有 + 共享）

    Returns:
        知识上下文 { query, mode, results, graphResults, pages }
    """
    results = []
    graph_results = []
    pages = []

    if mode == "query":
        if brain_dirs:
            search_results = _fs_search(brain_dirs, query, limit)
            results = [
                {"id": r["slug"], "title": r["title"], "type": r.get("type", "unknown"),
                 "score": r.get("score", 1.0), "snippet": r.get("snippet", "")}
                for r in search_results
            ]
            for r in search_results:
                if r.get("content"):
                    pages.append({"id": r["slug"], "title": r["title"], "content": r["content"][:2000]})
        else:
            results = _gbrain_query(query, limit)
    elif mode == "keyword":
        if brain_dirs:
            search_results = _fs_search(brain_dirs, query, limit)
            results = [
                {"id": r["slug"], "title": r["title"], "type": r.get("type", "unknown"),
                 "score": r.get("score", 1.0), "snippet": r.get("snippet", "")}
                for r in search_results
            ]
            for r in search_results:
                if r.get("content"):
                    pages.append({"id": r["slug"], "title": r["title"], "content": r["content"][:2000]})
        else:
            search_results = _gbrain_search(query, limit)
            results = [
                {
                    "id": r["slug"],
                    "title": r["title"],
                    "type": r.get("type", "unknown"),
                    "score": r.get("score", 1.0),
                    "snippet": "",
                }
                for r in search_results
            ]
            # 获取页面详情
            for r in search_results:
                page = _gbrain_get(r["slug"])
                if page["content"]:
                    pages.append(
                        {
                            "id": r["slug"],
                            "title": r["title"],
                            "content": page["content"][:2000],  # 截断
                        }
                    )
    elif mode == "graph":
        # 先搜索找到入口页面，再获取图谱（图谱跨项目，保留 gbrain）
        search_results = _gbrain_search(query, limit=3)
        for r in search_results:
            nodes = _gbrain_graph(r["slug"], depth=2)
            graph_results.extend(nodes)
            page = _gbrain_get(r["slug"])
            if page["content"]:
                pages.append(
                    {
                        "id": r["slug"],
                        "title": r["title"],
                        "content": page["content"][:2000],
                    }
                )

    # 应用过滤
    if filters and filters.get("type"):
        type_filter = filters["type"]
        results = [r for r in results if r.get("type") == type_filter]
        pages = [p for p in pages if p.get("type") == type_filter]

    return {
        "query": query,
        "mode": mode,
        "results": results,
        "graphResults": graph_results,
        "pages": pages,
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="用例生成知识查询")
    parser.add_argument("query", help="查询关键词")
    parser.add_argument("--mode", default="keyword", choices=["keyword", "graph", "query"])
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--brain-dirs", default=None, help="逗号分隔的 Brain 目录列表（多项目隔离）")
    args = parser.parse_args()

    brain_dirs = args.brain_dirs.split(",") if args.brain_dirs else None
    result = generate_cases(args.query, args.mode, args.limit, brain_dirs=brain_dirs)
    print(json.dumps(result, ensure_ascii=False, indent=2))
