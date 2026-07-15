"""
知识管理系统 V1.0 Python 简易 SDK

使用示例：
    from knowledge_client import KnowledgeClient
    client = KnowledgeClient(base_url="http://localhost:3000")
    pages = client.search("用户登录", mode="rrf")
"""

import requests
from typing import List, Dict, Optional, Any


class KnowledgeClient:
    def __init__(self, base_url: str = "http://localhost:3000", timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _request(self, method: str, path: str, **kwargs) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        response = requests.request(
            method, url, timeout=self.timeout, **kwargs
        )
        response.raise_for_status()
        return response.json()

    def upload_source(
        self,
        file_path: str,
        data_type: str = "prd",
        note: Optional[str] = None
    ) -> Dict[str, Any]:
        """上传源数据文件"""
        with open(file_path, "rb") as f:
            files = {"file": f}
            data = {"type": data_type}
            if note:
                data["note"] = note
            return self._request("POST", "/api/source-upload", files=files, data=data)

    def confirm_draft(self, draft_id: str, action: str = "commit") -> Dict[str, Any]:
        """确认草稿操作：commit 或 discard"""
        return self._request(
            "POST",
            "/api/confirm",
            json={"draftId": draft_id, "action": action}
        )

    def list_pages(
        self,
        page_type: Optional[str] = None,
        category: Optional[str] = None,
        keyword: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """获取知识库页面列表"""
        params = {}
        if page_type:
            params["type"] = page_type
        if category:
            params["category"] = category
        if keyword:
            params["keyword"] = keyword
        return self._request("GET", "/api/brain", params=params)

    def get_page(self, page_id: str) -> Dict[str, Any]:
        """获取知识库页面详情"""
        return self._request("GET", f"/api/brain/{page_id}")

    def batch_read_pages(self, page_ids: List[str]) -> List[Dict[str, Any]]:
        """批量读取知识库页面"""
        return self._request(
            "POST",
            "/api/brain/batch-read",
            json={"pageIds": page_ids}
        )

    def batch_write_pages(self, pages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """批量写入知识库页面"""
        return self._request(
            "POST",
            "/api/brain/batch-write",
            json={"pages": pages}
        )

    def search(
        self,
        query: str,
        mode: str = "rrf",
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """全量检索：rrf / keyword / graph"""
        return self._request(
            "POST",
            "/api/search",
            json={"query": query, "mode": mode, "limit": limit}
        )

    def list_drafts(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """获取草稿列表"""
        params = {}
        if status:
            params["status"] = status
        return self._request("GET", "/api/drafts", params=params)

    def list_conflicts(self) -> List[Dict[str, Any]]:
        """获取冲突列表"""
        return self._request("GET", "/api/conflicts")

    def resolve_conflict(self, conflict_id: str, resolution: str) -> Dict[str, Any]:
        """处理冲突：merge / overwrite / discard"""
        return self._request(
            "POST",
            f"/api/conflicts/{conflict_id}/resolve",
            json={"resolution": resolution}
        )

    def list_audit_logs(
        self,
        action: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """获取审计日志"""
        params = {}
        if action:
            params["action"] = action
        if start_time:
            params["startTime"] = start_time
        if end_time:
            params["endTime"] = end_time
        return self._request("GET", "/api/audit", params=params)

    def get_dashboard_stats(self) -> Dict[str, Any]:
        """获取全局操作日志统计面板数据"""
        return self._request("GET", "/api/dashboard")

    def verify_search(self, question: str) -> List[Dict[str, Any]]:
        """验证性推理测试"""
        return self._request(
            "POST",
            "/api/verify-search",
            json={"question": question}
        )

    def register_webhook(
        self,
        url: str,
        events: List[str]
    ) -> Dict[str, Any]:
        """注册变更回调"""
        return self._request(
            "POST",
            "/api/webhook/register",
            json={"url": url, "events": events}
        )
