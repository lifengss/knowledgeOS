---
type: api-contract
module: test_cache_extended
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：test_cache_extended

## Compiled Truth（当前最佳理解）

本模块包含 24 个接口定义。

### 接口列表

- `test_cache_extended.db_path()`
- `test_cache_extended.draft_cache(db_path)`
- `test_cache_extended.conflict_queue(db_path)`
- `test_cache_extended.audit_log(db_path)`
- `TestDraftSource.test_human_edit_source(self, draft_cache)` （类: `TestDraftSource`）
- `TestDraftSource.test_execution_feedback_source(self, draft_cache)` （类: `TestDraftSource`）
- `TestDraftSource.test_ai_generated_source(self, draft_cache)` （类: `TestDraftSource`）
- `TestPersistence.test_data_survives_reconnect(self, db_path)` （类: `TestPersistence`）
- `TestPersistence.test_multiple_tables_persist(self, db_path)` （类: `TestPersistence`）
- `TestStaleCleanup.test_cleanup_stale_drafts(self, db_path)` （类: `TestStaleCleanup`）
- `TestStaleCleanup.test_cleanup_respects_threshold(self, db_path)` （类: `TestStaleCleanup`）
- `TestAlertMonitor.test_conflict_pileup_alert(self, db_path, draft_cache, conflict_queue)` （类: `TestAlertMonitor`）
- `TestAlertMonitor.test_failed_commit_alert(self, db_path, draft_cache)` （类: `TestAlertMonitor`）
- `TestDraftLifecycle.test_full_lifecycle(self, db_path)` （类: `TestDraftLifecycle`）
- `test_cache_extended.test_human_edit_source(self, draft_cache)`
- `test_cache_extended.test_execution_feedback_source(self, draft_cache)`
- `test_cache_extended.test_ai_generated_source(self, draft_cache)`
- `test_cache_extended.test_data_survives_reconnect(self, db_path)`
- `test_cache_extended.test_multiple_tables_persist(self, db_path)`
- `test_cache_extended.test_cleanup_stale_drafts(self, db_path)`
- `test_cache_extended.test_cleanup_respects_threshold(self, db_path)`
- `test_cache_extended.test_conflict_pileup_alert(self, db_path, draft_cache, conflict_queue)`
- `test_cache_extended.test_failed_commit_alert(self, db_path, draft_cache)`
- `test_cache_extended.test_full_lifecycle(self, db_path)`

### 调用关系

- `test_cache_extended.db_path` → `tempfile.mkstemp` （method_call）
- `test_cache_extended.db_path` → `os.close` （method_call）
- `test_cache_extended.db_path` → `os.unlink` （method_call）
- `test_cache_extended.draft_cache` → `DraftCache` （call）
- `test_cache_extended.draft_cache` → `cache.close` （method_call）
- `test_cache_extended.conflict_queue` → `ConflictQueue` （call）
- `test_cache_extended.conflict_queue` → `queue.close` （method_call）
- `test_cache_extended.audit_log` → `AuditLog` （call）
- `test_cache_extended.audit_log` → `log.close` （method_call）
- `test_cache_extended.test_human_edit_source` → `draft_cache.add_draft` （method_call）
- `test_cache_extended.test_human_edit_source` → `draft_cache.get_draft_by_id` （method_call）
- `test_cache_extended.test_execution_feedback_source` → `draft_cache.add_draft` （method_call）
- `test_cache_extended.test_execution_feedback_source` → `draft_cache.get_draft_by_id` （method_call）
- `test_cache_extended.test_ai_generated_source` → `draft_cache.add_draft` （method_call）
- `test_cache_extended.test_ai_generated_source` → `draft_cache.get_draft_by_id` （method_call）
- `test_cache_extended.test_data_survives_reconnect` → `DraftCache` （call）
- `test_cache_extended.test_data_survives_reconnect` → `cache1.add_draft` （method_call）
- `test_cache_extended.test_data_survives_reconnect` → `cache1.close` （method_call）
- `test_cache_extended.test_data_survives_reconnect` → `DraftCache` （call）
- `test_cache_extended.test_data_survives_reconnect` → `cache2.get_draft_by_id` （method_call）
- `test_cache_extended.test_data_survives_reconnect` → `cache2.get_drafts_by_status` （method_call）
- `test_cache_extended.test_data_survives_reconnect` → `cache2.close` （method_call）
- `test_cache_extended.test_data_survives_reconnect` → `len` （call）
- `test_cache_extended.test_multiple_tables_persist` → `DraftCache` （call）
- `test_cache_extended.test_multiple_tables_persist` → `ConflictQueue` （call）
- `test_cache_extended.test_multiple_tables_persist` → `AuditLog` （call）
- `test_cache_extended.test_multiple_tables_persist` → `cache.add_draft` （method_call）
- `test_cache_extended.test_multiple_tables_persist` → `queue.add_conflict` （method_call）
- `test_cache_extended.test_multiple_tables_persist` → `log.log` （method_call）
- `test_cache_extended.test_multiple_tables_persist` → `cache.close` （method_call）
- `test_cache_extended.test_multiple_tables_persist` → `queue.close` （method_call）
- `test_cache_extended.test_multiple_tables_persist` → `log.close` （method_call）
- `test_cache_extended.test_multiple_tables_persist` → `DraftCache` （call）
- `test_cache_extended.test_multiple_tables_persist` → `ConflictQueue` （call）
- `test_cache_extended.test_multiple_tables_persist` → `AuditLog` （call）
- `test_cache_extended.test_multiple_tables_persist` → `log2.query` （method_call）
- `test_cache_extended.test_multiple_tables_persist` → `cache2.close` （method_call）
- `test_cache_extended.test_multiple_tables_persist` → `queue2.close` （method_call）
- `test_cache_extended.test_multiple_tables_persist` → `log2.close` （method_call）
- `test_cache_extended.test_multiple_tables_persist` → `cache2.get_draft_by_id` （method_call）
- `test_cache_extended.test_multiple_tables_persist` → `queue2.get_conflict_by_id` （method_call）
- `test_cache_extended.test_cleanup_stale_drafts` → `DraftCache` （call）
- `test_cache_extended.test_cleanup_stale_drafts` → `cache.add_draft` （method_call）
- `test_cache_extended.test_cleanup_stale_drafts` → `sqlite3.connect` （method_call）
- `test_cache_extended.test_cleanup_stale_drafts` → `conn.execute` （method_call）
- `test_cache_extended.test_cleanup_stale_drafts` → `conn.commit` （method_call）
- `test_cache_extended.test_cleanup_stale_drafts` → `conn.close` （method_call）
- `test_cache_extended.test_cleanup_stale_drafts` → `cache.cleanup_stale_drafts` （method_call）
- `test_cache_extended.test_cleanup_stale_drafts` → `cache.get_draft_by_id` （method_call）
- `test_cache_extended.test_cleanup_stale_drafts` → `cache.close` （method_call）
- `test_cache_extended.test_cleanup_stale_drafts` → `datetime.now` （method_call）
- `test_cache_extended.test_cleanup_stale_drafts` → `timedelta` （call）
- `test_cache_extended.test_cleanup_respects_threshold` → `DraftCache` （call）
- `test_cache_extended.test_cleanup_respects_threshold` → `cache.add_draft` （method_call）
- `test_cache_extended.test_cleanup_respects_threshold` → `cache.cleanup_stale_drafts` （method_call）
- `test_cache_extended.test_cleanup_respects_threshold` → `cache.get_draft_by_id` （method_call）
- `test_cache_extended.test_cleanup_respects_threshold` → `cache.close` （method_call）
- `test_cache_extended.test_conflict_pileup_alert` → `range` （call）
- `test_cache_extended.test_conflict_pileup_alert` → `conflict_queue.get_pending_conflicts` （method_call）
- `test_cache_extended.test_conflict_pileup_alert` → `draft_cache.add_draft` （method_call）
- `test_cache_extended.test_conflict_pileup_alert` → `conflict_queue.add_conflict` （method_call）
- `test_cache_extended.test_conflict_pileup_alert` → `len` （call）
- `test_cache_extended.test_failed_commit_alert` → `draft_cache.add_draft` （method_call）
- `test_cache_extended.test_failed_commit_alert` → `draft_cache.update_draft_status` （method_call）
- `test_cache_extended.test_failed_commit_alert` → `draft_cache.get_drafts_by_status` （method_call）
- `test_cache_extended.test_failed_commit_alert` → `len` （call）
- `test_cache_extended.test_full_lifecycle` → `DraftCache` （call）
- `test_cache_extended.test_full_lifecycle` → `ConflictQueue` （call）
- `test_cache_extended.test_full_lifecycle` → `AuditLog` （call）
- `test_cache_extended.test_full_lifecycle` → `cache.add_draft` （method_call）
- `test_cache_extended.test_full_lifecycle` → `log.log` （method_call）
- `test_cache_extended.test_full_lifecycle` → `log.log` （method_call）
- `test_cache_extended.test_full_lifecycle` → `queue.add_conflict` （method_call）
- `test_cache_extended.test_full_lifecycle` → `log.log` （method_call）
- `test_cache_extended.test_full_lifecycle` → `queue.resolve_conflict` （method_call）
- `test_cache_extended.test_full_lifecycle` → `cache.update_draft_status` （method_call）
- `test_cache_extended.test_full_lifecycle` → `log.log` （method_call）
- `test_cache_extended.test_full_lifecycle` → `log.log` （method_call）
- `test_cache_extended.test_full_lifecycle` → `cache.update_draft_status` （method_call）
- `test_cache_extended.test_full_lifecycle` → `log.log` （method_call）
- `test_cache_extended.test_full_lifecycle` → `cache.get_draft_by_id` （method_call）
- `test_cache_extended.test_full_lifecycle` → `queue.get_conflict_by_id` （method_call）
- `test_cache_extended.test_full_lifecycle` → `log.get_stats` （method_call）
- `test_cache_extended.test_full_lifecycle` → `cache.close` （method_call）
- `test_cache_extended.test_full_lifecycle` → `queue.close` （method_call）
- `test_cache_extended.test_full_lifecycle` → `log.close` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
