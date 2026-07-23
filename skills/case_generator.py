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
                    "slug": md.stem,
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
    elif mode == "semantic":
        embedding_cfg = _load_embedding_cfg()
        chat_cfg = _load_chat_cfg()
        if brain_dirs:
            search_results = _semantic_search(brain_dirs, query, limit, embedding_cfg, chat_cfg)
            results = [
                {"id": r["slug"], "title": r["title"], "type": r.get("type", "unknown"),
                 "score": r.get("score", 0.0), "snippet": r.get("snippet", "")}
                for r in search_results
            ]
            for r in search_results:
                if r.get("content"):
                    pages.append({"id": r["slug"], "title": r["title"], "content": r["content"][:2000]})
        else:
            results = _gbrain_query(query, limit)
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


# ---------------------------------------------------------------
# 语义检索（semantic）辅助：优先 embeddings 向量检索，否则 LLM 语义重排降级
# ---------------------------------------------------------------
def _load_embedding_cfg():
    import json, os
    endpoint = api_key = model = ''
    cfg_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'ai_config.json')
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
            emb = cfg.get('embedding', {}) or {}
            gb = cfg.get('gbrain', {}) or {}
            endpoint = emb.get('endpoint') or gb.get('endpoint', '')
            api_key = emb.get('apiKey') or gb.get('apiKey', '')
            model = emb.get('model') or gb.get('model', '')
        except Exception:
            pass
    return {'endpoint': endpoint, 'apiKey': api_key, 'model': model}


def _load_chat_cfg():
    import json, os
    endpoint = api_key = model = ''
    cfg_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'ai_config.json')
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
            ai = cfg.get('ai', {}) or {}
            gb = cfg.get('gbrain', {}) or {}
            endpoint = gb.get('endpoint') or ai.get('endpoint', '')
            api_key = gb.get('apiKey') or ai.get('apiKey', '')
            model = gb.get('model') or ai.get('model', '')
        except Exception:
            pass
    return {'endpoint': endpoint, 'apiKey': api_key, 'model': model}


def _http_post_json(url, payload, api_key, timeout=60):
    import json, urllib.request
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (api_key or '')},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8'))


def _embed(text, cfg):
    base = (cfg.get('endpoint') or '').rstrip('/')
    if not base:
        raise RuntimeError('未配置 embedding endpoint')
    url = base + '/embeddings' if not base.endswith('/embeddings') else base
    data = _http_post_json(url, {'model': cfg.get('model') or 'text-embedding-ada-002', 'input': text}, cfg.get('apiKey', ''))
    return data['data'][0]['embedding']


def _chat_complete(messages, cfg, timeout=60):
    base = (cfg.get('endpoint') or '').rstrip('/')
    if not base:
        raise RuntimeError('未配置 chat endpoint')
    url = base + '/chat/completions' if not base.endswith('/chat/completions') else base
    data = _http_post_json(url, {'model': cfg.get('model') or 'gpt-4o-mini', 'messages': messages}, cfg.get('apiKey', ''), timeout)
    return data['choices'][0]['message']['content']


def _cosine(a, b):
    import math
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _doc_hit(md, text, score):
    import re
    fm = re.search(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    title = ''
    if fm:
        tm = re.search(r'title:\s*"?([^"\n]+)"?', fm.group(1))
        if tm:
            title = tm.group(1).strip()
    fname = md.stem
    return {'slug': str(md), 'title': title or fname, 'type': md.parent.name,
            'score': float(score), 'snippet': text[:200].replace('\n', ' '), 'content': text}


def _llm_rerank(query, cand, chat_cfg):
    import json, re
    items = []
    for i, c in enumerate(cand[:20]):
        items.append(f"[{i}] 标题: {c.get('title', '')}\n片段: {c.get('snippet', '')[:300]}")
    prompt = (
        "你是检索相关性评估器。给定用户查询和若干知识库片段，请对每个片段与查询的相关性打分（0到1，1最相关）。\n"
        f"用户查询: {query}\n\n片段列表:\n" + "\n\n".join(items) +
        "\n\n请仅输出 JSON 数组，形如 [{\"id\":0,\"score\":0.9},{\"id\":1,\"score\":0.3}]，不要输出其他内容。"
    )
    messages = [{"role": "system", "content": "你只输出 JSON，不要解释。"}, {"role": "user", "content": prompt}]
    resp = _chat_complete(messages, chat_cfg, timeout=60)
    m = re.search(r'\[.*\]', resp, re.DOTALL)
    if not m:
        return None
    arr = json.loads(m.group(0))
    scored = []
    for item in arr:
        idx = item.get('id')
        sc = float(item.get('score', 0))
        if isinstance(idx, int) and 0 <= idx < len(cand):
            c = dict(cand[idx])
            c['score'] = sc
            scored.append(c)
    scored.sort(key=lambda x: x['score'], reverse=True)
    return scored


def _semantic_search(brain_dirs, query, limit=10, embedding_cfg=None, chat_cfg=None):
    import os, pickle, re
    from pathlib import Path
    embedding_cfg = embedding_cfg or _load_embedding_cfg()
    chat_cfg = chat_cfg or _load_chat_cfg()
    docs = []
    for bdir in brain_dirs or []:
        bpath = Path(bdir)
        if not bpath.exists():
            continue
        for md in bpath.rglob('*.md'):
            try:
                text = md.read_text(encoding='utf-8', errors='ignore')
            except Exception:
                continue
            docs.append((md, text))
    if not docs:
        return []
    # 路径 1：embeddings 向量检索
    use_embeddings = False
    qvec = None
    if embedding_cfg.get('endpoint'):
        try:
            qvec = _embed(query, embedding_cfg)
            use_embeddings = True
        except Exception as e:
            print(f"[case-generator] embedding 不可用，降级 LLM 重排: {e}", file=sys.stderr)
            use_embeddings = False
    if use_embeddings:
        cache_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
        os.makedirs(cache_dir, exist_ok=True)
        cache_path = os.path.join(cache_dir, '.ks_embed_cache.pkl')
        cache = {}
        if os.path.exists(cache_path):
            try:
                with open(cache_path, 'rb') as f:
                    cache = pickle.load(f)
            except Exception:
                cache = {}
        changed = False
        hits = []
        for md, text in docs:
            key = str(md)
            mtime = md.stat().st_mtime
            dvec = None
            if key in cache and cache[key][0] == mtime:
                dvec = cache[key][1]
            else:
                try:
                    dvec = _embed(text[:4000], embedding_cfg)
                    cache[key] = (mtime, dvec)
                    changed = True
                except Exception:
                    continue
            hits.append(_doc_hit(md, text, _cosine(qvec, dvec)))
        if changed:
            try:
                with open(cache_path, 'wb') as f:
                    pickle.dump(cache, f)
            except Exception:
                pass
        hits.sort(key=lambda x: x['score'], reverse=True)
        return hits[:limit]
    # 路径 2：LLM 语义重排（降级）
    cand = _fs_search(brain_dirs, query, limit=30)
    if not cand:
        return []
    try:
        ranked = _llm_rerank(query, cand, chat_cfg)
        if ranked:
            return ranked[:limit]
    except Exception as e:
        print(f"[case-generator] LLM 重排失败，回退 keyword: {e}", file=sys.stderr)
    cand.sort(key=lambda x: x['score'], reverse=True)
    return cand[:limit]


if __name__ == "__main__":
    import argparse
    import os

    parser = argparse.ArgumentParser(description="用例生成知识查询")
    parser.add_argument("query", help="查询关键词")
    parser.add_argument("--mode", default="keyword", choices=["keyword", "graph", "query", "semantic"])
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--brain-dirs", default=None, help="逗号分隔的 Brain 目录列表（多项目隔离）")
    parser.add_argument("--project", default=None, help="所属项目 ID（用于审计隔离）")
    args = parser.parse_args()

    brain_dirs = args.brain_dirs.split(",") if args.brain_dirs else None
    result = generate_cases(args.query, args.mode, args.limit, brain_dirs=brain_dirs)

    # 记录检索审计（失败不阻断主流程），写入与提交审计相同的 drafts.db
    try:
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        db = os.environ.get("CACHE_DB_PATH") or os.path.join(root, "cache", "drafts.db")
        sys.path.insert(0, root)
        from cache.audit_log import AuditLog

        al = AuditLog(db)
        al.log(
            action="search",
            operator="web-ui",
            target=args.query,
            detail={"mode": args.mode, "limit": args.limit, "project": args.project},
            project=args.project,
        )
    except Exception:
        pass

    print(json.dumps(result, ensure_ascii=False, indent=2))
