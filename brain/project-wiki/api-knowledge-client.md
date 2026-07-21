---
type: api-contract
module: knowledge_client
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：knowledge_client

## Compiled Truth（当前最佳理解）

本模块包含 32 个接口定义。

### 接口列表

- `KnowledgeClient.__init__(self, base_url, timeout)` （类: `KnowledgeClient`）
- `KnowledgeClient._request(self, method, path)` （类: `KnowledgeClient`）
- `KnowledgeClient.upload_source(self, file_path, data_type, note)` （类: `KnowledgeClient`）
- `KnowledgeClient.confirm_draft(self, draft_id, action)` （类: `KnowledgeClient`）
- `KnowledgeClient.list_pages(self, page_type, category, keyword)` （类: `KnowledgeClient`）
- `KnowledgeClient.get_page(self, page_id)` （类: `KnowledgeClient`）
- `KnowledgeClient.batch_read_pages(self, page_ids)` （类: `KnowledgeClient`）
- `KnowledgeClient.batch_write_pages(self, pages)` （类: `KnowledgeClient`）
- `KnowledgeClient.search(self, query, mode, limit)` （类: `KnowledgeClient`）
- `KnowledgeClient.list_drafts(self, status)` （类: `KnowledgeClient`）
- `KnowledgeClient.list_conflicts(self)` （类: `KnowledgeClient`）
- `KnowledgeClient.resolve_conflict(self, conflict_id, resolution)` （类: `KnowledgeClient`）
- `KnowledgeClient.list_audit_logs(self, action, start_time, end_time)` （类: `KnowledgeClient`）
- `KnowledgeClient.get_dashboard_stats(self)` （类: `KnowledgeClient`）
- `KnowledgeClient.verify_search(self, question)` （类: `KnowledgeClient`）
- `KnowledgeClient.register_webhook(self, url, events)` （类: `KnowledgeClient`）
- `knowledge_client.__init__(self, base_url, timeout)`
- `knowledge_client._request(self, method, path)` → `Dict[str, Any]`
- `knowledge_client.upload_source(self, file_path, data_type, note)` → `Dict[str, Any]`
- `knowledge_client.confirm_draft(self, draft_id, action)` → `Dict[str, Any]`
- `knowledge_client.list_pages(self, page_type, category, keyword)` → `List[Dict[str, Any]]`
- `knowledge_client.get_page(self, page_id)` → `Dict[str, Any]`
- `knowledge_client.batch_read_pages(self, page_ids)` → `List[Dict[str, Any]]`
- `knowledge_client.batch_write_pages(self, pages)` → `Dict[str, Any]`
- `knowledge_client.search(self, query, mode, limit)` → `List[Dict[str, Any]]`
- `knowledge_client.list_drafts(self, status)` → `List[Dict[str, Any]]`
- `knowledge_client.list_conflicts(self)` → `List[Dict[str, Any]]`
- `knowledge_client.resolve_conflict(self, conflict_id, resolution)` → `Dict[str, Any]`
- `knowledge_client.list_audit_logs(self, action, start_time, end_time)` → `List[Dict[str, Any]]`
- `knowledge_client.get_dashboard_stats(self)` → `Dict[str, Any]`
- `knowledge_client.verify_search(self, question)` → `List[Dict[str, Any]]`
- `knowledge_client.register_webhook(self, url, events)` → `Dict[str, Any]`

### 调用关系

- `knowledge_client.__init__` → `base_url.rstrip` （method_call）
- `knowledge_client._request` → `requests.request` （method_call）
- `knowledge_client._request` → `response.raise_for_status` （method_call）
- `knowledge_client._request` → `response.json` （method_call）
- `knowledge_client.upload_source` → `open` （call）
- `knowledge_client.upload_source` → `self._request` （method_call）
- `knowledge_client.confirm_draft` → `self._request` （method_call）
- `knowledge_client.list_pages` → `self._request` （method_call）
- `knowledge_client.get_page` → `self._request` （method_call）
- `knowledge_client.batch_read_pages` → `self._request` （method_call）
- `knowledge_client.batch_write_pages` → `self._request` （method_call）
- `knowledge_client.search` → `self._request` （method_call）
- `knowledge_client.list_drafts` → `self._request` （method_call）
- `knowledge_client.list_conflicts` → `self._request` （method_call）
- `knowledge_client.resolve_conflict` → `self._request` （method_call）
- `knowledge_client.list_audit_logs` → `self._request` （method_call）
- `knowledge_client.get_dashboard_stats` → `self._request` （method_call）
- `knowledge_client.verify_search` → `self._request` （method_call）
- `knowledge_client.register_webhook` → `self._request` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
