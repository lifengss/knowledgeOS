---
type: api-contract
module: test_cache
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：test_cache

## Compiled Truth（当前最佳理解）

本模块包含 20 个接口定义。

### 接口列表

- `test_cache.db_path()`
- `test_cache.draft_cache(db_path)`
- `test_cache.conflict_queue(db_path)`
- `test_cache.audit_log(db_path)`
- `TestDraftCache.test_add_and_get_draft(self, draft_cache)` （类: `TestDraftCache`）
- `TestDraftCache.test_get_drafts_by_status(self, draft_cache)` （类: `TestDraftCache`）
- `TestDraftCache.test_update_draft_status(self, draft_cache)` （类: `TestDraftCache`）
- `TestDraftCache.test_update_drafts_status(self, draft_cache)` （类: `TestDraftCache`）
- `TestConflictQueue.test_add_and_get_conflict(self, draft_cache, conflict_queue)` （类: `TestConflictQueue`）
- `TestConflictQueue.test_resolve_conflict(self, draft_cache, conflict_queue)` （类: `TestConflictQueue`）
- `TestAuditLog.test_log_and_query(self, audit_log)` （类: `TestAuditLog`）
- `TestAuditLog.test_get_stats(self, db_path, audit_log)` （类: `TestAuditLog`）
- `test_cache.test_add_and_get_draft(self, draft_cache)`
- `test_cache.test_get_drafts_by_status(self, draft_cache)`
- `test_cache.test_update_draft_status(self, draft_cache)`
- `test_cache.test_update_drafts_status(self, draft_cache)`
- `test_cache.test_add_and_get_conflict(self, draft_cache, conflict_queue)`
- `test_cache.test_resolve_conflict(self, draft_cache, conflict_queue)`
- `test_cache.test_log_and_query(self, audit_log)`
- `test_cache.test_get_stats(self, db_path, audit_log)`

### 调用关系

- `test_cache.db_path` → `tempfile.mkstemp` （method_call）
- `test_cache.db_path` → `os.close` （method_call）
- `test_cache.db_path` → `os.unlink` （method_call）
- `test_cache.draft_cache` → `DraftCache` （call）
- `test_cache.draft_cache` → `cache.close` （method_call）
- `test_cache.conflict_queue` → `ConflictQueue` （call）
- `test_cache.conflict_queue` → `queue.close` （method_call）
- `test_cache.audit_log` → `AuditLog` （call）
- `test_cache.audit_log` → `log.close` （method_call）
- `test_cache.test_add_and_get_draft` → `draft_cache.add_draft` （method_call）
- `test_cache.test_add_and_get_draft` → `draft_cache.get_draft_by_id` （method_call）
- `test_cache.test_get_drafts_by_status` → `draft_cache.add_draft` （method_call）
- `test_cache.test_get_drafts_by_status` → `draft_cache.get_drafts_by_status` （method_call）
- `test_cache.test_get_drafts_by_status` → `len` （call）
- `test_cache.test_update_draft_status` → `draft_cache.add_draft` （method_call）
- `test_cache.test_update_draft_status` → `draft_cache.update_draft_status` （method_call）
- `test_cache.test_update_draft_status` → `draft_cache.get_draft_by_id` （method_call）
- `test_cache.test_update_drafts_status` → `draft_cache.add_draft` （method_call）
- `test_cache.test_update_drafts_status` → `draft_cache.add_draft` （method_call）
- `test_cache.test_update_drafts_status` → `draft_cache.update_drafts_status` （method_call）
- `test_cache.test_update_drafts_status` → `draft_cache.get_draft_by_id` （method_call）
- `test_cache.test_add_and_get_conflict` → `draft_cache.add_draft` （method_call）
- `test_cache.test_add_and_get_conflict` → `conflict_queue.add_conflict` （method_call）
- `test_cache.test_add_and_get_conflict` → `conflict_queue.get_pending_conflicts` （method_call）
- `test_cache.test_add_and_get_conflict` → `len` （call）
- `test_cache.test_resolve_conflict` → `draft_cache.add_draft` （method_call）
- `test_cache.test_resolve_conflict` → `conflict_queue.add_conflict` （method_call）
- `test_cache.test_resolve_conflict` → `conflict_queue.resolve_conflict` （method_call）
- `test_cache.test_resolve_conflict` → `conflict_queue.get_conflict_by_id` （method_call）
- `test_cache.test_log_and_query` → `audit_log.log` （method_call）
- `test_cache.test_log_and_query` → `audit_log.query` （method_call）
- `test_cache.test_get_stats` → `DraftCache` （call）
- `test_cache.test_get_stats` → `ConflictQueue` （call）
- `test_cache.test_get_stats` → `audit_log.log` （method_call）
- `test_cache.test_get_stats` → `audit_log.get_stats` （method_call）
- `test_cache.test_get_stats` → `isinstance` （call）
- `test_cache.test_get_stats` → `isinstance` （call）
- `test_cache.test_get_stats` → `isinstance` （call）
- `test_cache.test_get_stats` → `isinstance` （call）
- `test_cache.test_get_stats` → `draft_cache.close` （method_call）
- `test_cache.test_get_stats` → `conflict_queue.close` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
