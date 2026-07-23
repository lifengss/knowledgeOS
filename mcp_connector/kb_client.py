"""
知识库 REST API 客户端 (KnowledgeOS MCP Connector - shared client)
====================================================================

MCP 服务（query / write）通过此客户端访问 test-knowledge-system 的 REST API
（api/server.js，默认 http://localhost:3000）。所有知识库操作（检索、读写草稿、
质量门控、冲突处理、入库、图谱）均在 REST 服务端实现，本客户端仅做薄封装，
保持“换 AI 平台仅改配置不改代码”的架构原则。

环境变量:
  KB_API_BASE    REST API 基址，默认 http://localhost:3000
  KB_API_TIMEOUT 请求超时（秒），默认 30
"""

import json
import os
import urllib.parse
import urllib.request

DEFAULT_BASE = os.environ.get("KB_API_BASE", "http://localhost:3000")
DEFAULT_TIMEOUT = float(os.environ.get("KB_API_TIMEOUT", "30"))


class KBClientError(RuntimeError):
    """REST 调用失败（含 HTTP 非 2xx）。"""


def _build_url(path: str, params: dict) -> str:
    base = DEFAULT_BASE.rstrip("/")
    url = base + path
    cleaned = {k: v for k, v in (params or {}).items() if v is not None}
    if cleaned:
        url += "?" + urllib.parse.urlencode(cleaned)
    return url


def _request(method: str, path: str, *, project=None, params=None, body=None) -> dict:
    """发起 HTTP 请求并返回解析后的 JSON。

    GET 类请求：project 作为 query 参数；POST/PUT/DELETE：project 注入 body。
    REST 端点的 resolveProject 同时读取 query.project / body.project。
    """
    # 合并 project 到 query 或 body
    if method.upper() == "GET":
        params = dict(params or {})
        if project is not None:
            params["project"] = project
    else:
        body = dict(body or {})
        if project is not None:
            body["project"] = project

    url = _build_url(path, params if method.upper() == "GET" else None)
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")
        raise KBClientError(f"HTTP {e.code} {method} {path}: {detail}") from e
    except urllib.error.URLError as e:
        raise KBClientError(f"无法连接知识库 REST API ({DEFAULT_BASE}): {e.reason}") from e

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"success": True, "raw": raw}


# ---------------------------------------------------------------------------
# 只读接口
# ---------------------------------------------------------------------------

def list_projects() -> dict:
    return _request("GET", "/api/projects")


def search(query, project=None, mode="keyword", limit=10) -> dict:
    return _request("POST", "/api/search", project=project,
                    body={"query": query, "mode": mode, "limit": limit})


def generate_cases(query, project=None, limit=5) -> dict:
    return _request("POST", "/api/generate-cases", project=project,
                    body={"query": query, "limit": limit})


def list_pages(category="all", project=None, limit=100) -> dict:
    return _request("GET", "/api/brain/pages", project=project,
                    params={"category": category, "limit": limit})


def get_page(category, page_id, project=None) -> dict:
    return _request("GET", f"/api/brain/pages/{category}/{page_id}", project=project)


def graph_data(project=None) -> dict:
    return _request("GET", "/api/graph-data", project=project)


def stats(project=None) -> dict:
    return _request("GET", "/api/stats", project=project)


def list_drafts(project=None, status=None, source=None, type_=None,
                limit=100, offset=0) -> dict:
    return _request("GET", "/api/drafts", project=project,
                    params={"status": status, "source": source, "type": type_,
                            "limit": limit, "offset": offset})


def get_draft(draft_id) -> dict:
    return _request("GET", f"/api/drafts/{draft_id}")


def list_conflicts(project=None, status=None, limit=100) -> dict:
    return _request("GET", "/api/conflicts", project=project,
                    params={"status": status, "limit": limit})


# ---------------------------------------------------------------------------
# 写入接口
# ---------------------------------------------------------------------------

def add_draft(title, content, project=None, type_="quality_rule",
              source="human_edit", metadata=None) -> dict:
    return _request("POST", "/api/drafts", project=project,
                    body={"title": title, "content": content, "type": type_,
                          "source": source, "metadata": metadata or {}})


def update_draft(draft_id, title=None, content=None, type_=None) -> dict:
    body = {}
    if title is not None:
        body["title"] = title
    if content is not None:
        body["content"] = content
    if type_ is not None:
        body["type"] = type_
    return _request("PUT", f"/api/drafts/{draft_id}", body=body)


def delete_draft(draft_id, project=None) -> dict:
    return _request("DELETE", f"/api/drafts/{draft_id}", project=project)


def edit_page(category, page_id, content, project=None) -> dict:
    return _request("PUT", f"/api/brain/pages/{category}/{page_id}",
                    project=project, body={"content": content})


def quality_gate(project=None, draft_ids=None) -> dict:
    body = {}
    if draft_ids:
        body["draft_ids"] = ",".join(str(i) for i in draft_ids) if isinstance(draft_ids, list) else draft_ids
    return _request("POST", "/api/quality-gate/check", project=project, body=body)


def detect_conflicts(project=None) -> dict:
    return _request("POST", "/api/conflicts/detect", project=project)


def resolve_conflict(conflict_id, resolution="merge", project=None) -> dict:
    return _request("PUT", f"/api/conflicts/{conflict_id}/resolve",
                    project=project, body={"resolution": resolution})


def single_commit(draft_id, project=None, skip_conflict_check=False,
                  skip_quality_gate=False) -> dict:
    return _request("POST", f"/api/drafts/{draft_id}/commit", project=project,
                    body={"skip_conflict_check": skip_conflict_check,
                          "skip_quality_gate": skip_quality_gate})


def batch_commit(project=None, ids=None, skip_conflict_check=False,
                 skip_quality_gate=False) -> dict:
    body = {"skip_conflict_check": skip_conflict_check,
            "skip_quality_gate": skip_quality_gate}
    if ids:
        body["ids"] = list(ids)
    return _request("POST", "/api/drafts/batch-commit", project=project, body=body)


def upload_source(content=None, type_="quality_rule", note="", project=None) -> dict:
    return _request("POST", "/api/source-upload", project=project,
                    body={"content": content, "type": type_, "note": note})


def promote_page(project, page_path, mode="copy") -> dict:
    return _request("POST", "/api/brain/promote",
                    body={"project": project, "pagePath": page_path, "mode": mode})


def get_ai_settings() -> dict:
    return _request("GET", "/api/ai-settings")


def set_ai_settings(config) -> dict:
    # config: dict，形如 {"ai": {"provider": "openai", "endpoint": "...", "apiKey": "...", "model": "...", "useCustomModel": false}}
    return _request("PUT", "/api/ai-settings", body=config)


def generate_quality_rule(title, old, new, project=None) -> dict:
    return _request("POST", "/api/generate-quality-rule", project=project,
                    body={"title": title, "old": old, "new": new})
