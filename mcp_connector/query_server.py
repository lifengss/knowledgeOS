"""
KnowledgeOS MCP 连接器 —— 查询服务 (只读, 对应设计文档 query :8100)

以 stdio 方式启动，供 CodeBuddy / Agent SDK 接入。所有工具只读访问知识库，
底层复用 test-knowledge-system 的 REST API（api/server.js）。

启动: python mcp/query_server.py
配置: 通过环境变量 KB_API_BASE 指定 REST 基址（默认 http://localhost:3000）

工具清单（对齐设计文档“查询服务”能力）:
  - search_knowledge      检索知识（POST /api/search）            [设计: case-generator 检索通道]
  - generate_test_cases   依据 query 生成测试用例草稿素材        [设计: case-generator]
  - list_knowledge_pages  列出知识库页面                          [设计: GBrain 页面浏览]
  - get_knowledge_page    读取单个知识页面正文
  - get_knowledge_graph   获取知识图谱（节点/边）                [设计: api-graph-builder]
  - get_stats             知识库统计
  - list_projects         枚举多项目知识库
  - list_drafts           列出缓冲层草稿
  - get_draft             读取单条草稿
  - list_conflicts        列出冲突
  - tfidf_code_slicer     对知识 Markdown 语料做 TF-IDF 切片     [设计: tfidf-code-slicer]
"""

import json
import math
import re
import sys

from mcp.server.fastmcp import FastMCP

import kb_client as kb

mcp = FastMCP("knowledgeos-query", instructions=(
    "知识库只读查询连接器。用于检索知识、读取知识页面与图谱、查看草稿/冲突/统计。"
    "所有操作只读，不会修改知识库。写入请使用 knowledgeos-write 连接器。"
))


def _ok(data) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def _run(fn):
    try:
        return _ok(fn())
    except kb.KBClientError as e:
        return f"[错误] {e}"
    except Exception as e:  # pragma: no cover - 防御性
        return f"[错误] {type(e).__name__}: {e}"


@mcp.tool()
def search_knowledge(query: str, project: str = "default", mode: str = "keyword",
                     limit: int = 10) -> str:
    """检索知识库。query=检索词；project=项目ID；mode=keyword|semantic；limit=返回条数。"""
    return _run(lambda: kb.search(query, project=project, mode=mode, limit=limit))


@mcp.tool()
def generate_test_cases(query: str, project: str = "default", limit: int = 5) -> str:
    """依据 query 从知识库检索并产出测试用例草稿素材（只读，不直接落库）。"""
    return _run(lambda: kb.generate_cases(query, project=project, limit=limit))


@mcp.tool()
def list_knowledge_pages(category: str = "all", project: str = "default",
                         limit: int = 100) -> str:
    """列出知识库页面。category=quality-rules|defect-experience|project-wiki|test-cases|all。"""
    return _run(lambda: kb.list_pages(category=category, project=project, limit=limit))


@mcp.tool()
def get_knowledge_page(category: str, page_id: str, project: str = "default") -> str:
    """读取单个知识页面正文。category=分类；page_id=页面ID(不含.md)。"""
    return _run(lambda: kb.get_page(category, page_id, project=project))


@mcp.tool()
def get_knowledge_graph(project: str = "default") -> str:
    """获取知识图谱（节点与边），用于理解 API/函数调用关系。"""
    return _run(lambda: kb.graph_data(project=project))


@mcp.tool()
def get_stats(project: str = "default") -> str:
    """获取知识库统计信息（草稿数、页面数、冲突数等）。"""
    return _run(lambda: kb.stats(project=project))


@mcp.tool()
def list_projects() -> str:
    """枚举所有项目知识库（含默认项目与共享库路径）。"""
    return _run(lambda: kb.list_projects())


@mcp.tool()
def list_drafts(project: str = "default", status: str = None, source: str = None,
                type_: str = None, limit: int = 100, offset: int = 0) -> str:
    """列出缓冲层草稿。status=pending|approved|conflict|...；source/type 可过滤。"""
    return _run(lambda: kb.list_drafts(project=project, status=status, source=source,
                                       type_=type_, limit=limit, offset=offset))


@mcp.tool()
def get_draft(draft_id: str) -> str:
    """读取单条草稿详情（by id）。"""
    return _run(lambda: kb.get_draft(draft_id))


@mcp.tool()
def list_conflicts(project: str = "default", status: str = None, limit: int = 100) -> str:
    """列出冲突处理队列。status 未填则返回全部。"""
    return _run(lambda: kb.list_conflicts(project=project, status=status, limit=limit))


# ---------------------------------------------------------------------------
# tfidf-code-slicer：对知识语料做 TF-IDF 切片（轻量实现，复用 REST 读取页面）
# ---------------------------------------------------------------------------

_STOP = set("""
a an the of to in on for and or is are be with as by from at this that these those
if else for while def class function return import from not but can will may should
we you they it its their our your his her he she which what when where how why 的 了
与 和 或 是 在 对 及 一个 一种 可以 我们 他们 这个 那个 通过 进行 使用 包括 如下
""".split())


def _tokenize(text: str):
    return [w for w in re.findall(r"[A-Za-z_][A-Za-z0-9_]*|[一-龥]{2,}", text.lower())
            if w not in _STOP]


@mcp.tool()
def tfidf_code_slicer(project: str = "default", category: str = "all",
                      top_n: int = 10, max_pages: int = 30) -> str:
    """对知识库 Markdown 语料做 TF-IDF 切片，返回全局高频词与各文档代表性词。
    category=all|分类；top_n=每文档返回词数；max_pages=参与计算的页面上限。"""
    def impl():
        pages = kb.list_pages(category=category, project=project, limit=max_pages)
        if not pages.get("success"):
            return pages
        items = pages.get("data", [])[:max_pages]
        docs = []
        for p in items:
            full = kb.get_page(p["category"], p["id"], project=project)
            content = full.get("data", {}).get("content", "") if full.get("success") else ""
            docs.append({
                "id": p["id"], "category": p["category"],
                "title": p.get("title", p["id"]),
                "tokens": _tokenize(content or p.get("preview", "")),
            })
        # 文档频率
        df = {}
        for d in docs:
            for t in set(d["tokens"]):
                df[t] = df.get(t, 0) + 1
        n = max(len(docs), 1)
        # 全局 TF-IDF 词
        global_scores = {}
        for t, freq in df.items():
            idf = math.log((n + 1) / (freq + 1)) + 1
            tf = sum(d["tokens"].count(t) for d in docs)
            global_scores[t] = tf * idf
        global_top = sorted(global_scores.items(), key=lambda x: -x[1])[:top_n]
        per_doc = []
        for d in docs:
            tf_local = {}
            for t in d["tokens"]:
                tf_local[t] = tf_local.get(t, 0) + 1
            scored = []
            for t, tf in tf_local.items():
                idf = math.log((n + 1) / (df.get(t, 0) + 1)) + 1
                scored.append((t, tf * idf))
            top = sorted(scored, key=lambda x: -x[1])[:top_n]
            per_doc.append({"id": d["id"], "title": d["title"],
                            "category": d["category"],
                            "terms": [{"term": w, "score": round(s, 3)} for w, s in top]})
        return {
            "success": True,
            "data": {
                "documents": len(docs),
                "global_top_terms": [{"term": w, "score": round(s, 3)} for w, s in global_top],
                "per_document": per_doc,
            },
        }
    return _run(impl)


if __name__ == "__main__":
    mcp.run()  # stdio transport
