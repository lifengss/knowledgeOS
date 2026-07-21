---
type: api-contract
module: test_cleanup_stale_0721
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：test_cleanup_stale_0721

## Compiled Truth（当前最佳理解）

本模块包含 16 个接口定义。

### 接口列表

- `TestCleanupStaleDrafts.setup_method(self)` （类: `TestCleanupStaleDrafts`）
- `TestCleanupStaleDrafts.teardown_method(self)` （类: `TestCleanupStaleDrafts`）
- `TestCleanupStaleDrafts._add_draft(self, status, days_ago)` （类: `TestCleanupStaleDrafts`）
- `TestCleanupStaleDrafts.test_expires_old_pending_drafts(self)` （类: `TestCleanupStaleDrafts`）
- `TestCleanupStaleDrafts.test_no_expiry_when_none_stale(self)` （类: `TestCleanupStaleDrafts`）
- `TestCleanupStaleDrafts.test_does_not_touch_non_pending(self)` （类: `TestCleanupStaleDrafts`）
- `TestCleanupStaleDrafts.test_writes_audit_log(self)` （类: `TestCleanupStaleDrafts`）
- `TestCleanupStaleDrafts.test_dry_run_does_not_modify(self)` （类: `TestCleanupStaleDrafts`）
- `test_cleanup_stale_0721.setup_method(self)`
- `test_cleanup_stale_0721.teardown_method(self)`
- `test_cleanup_stale_0721._add_draft(self, status, days_ago)`
- `test_cleanup_stale_0721.test_expires_old_pending_drafts(self)`
- `test_cleanup_stale_0721.test_no_expiry_when_none_stale(self)`
- `test_cleanup_stale_0721.test_does_not_touch_non_pending(self)`
- `test_cleanup_stale_0721.test_writes_audit_log(self)`
- `test_cleanup_stale_0721.test_dry_run_does_not_modify(self)`

### 调用关系

- `test_cleanup_stale_0721.setup_method` → `tempfile.mkstemp` （method_call）
- `test_cleanup_stale_0721.setup_method` → `DraftCache` （call）
- `test_cleanup_stale_0721.setup_method` → `AuditLog` （call）
- `test_cleanup_stale_0721.teardown_method` → `os.close` （method_call）
- `test_cleanup_stale_0721.teardown_method` → `os.unlink` （method_call）
- `test_cleanup_stale_0721._add_draft` → `datetime.now` （method_call）
- `test_cleanup_stale_0721._add_draft` → `timedelta` （call）
- `test_cleanup_stale_0721.test_expires_old_pending_drafts` → `self._add_draft` （method_call）
- `test_cleanup_stale_0721.test_expires_old_pending_drafts` → `self._add_draft` （method_call）
- `test_cleanup_stale_0721.test_expires_old_pending_drafts` → `cleanup_stale_drafts` （call）
- `test_cleanup_stale_0721.test_expires_old_pending_drafts` → `any` （call）
- `test_cleanup_stale_0721.test_no_expiry_when_none_stale` → `self._add_draft` （method_call）
- `test_cleanup_stale_0721.test_no_expiry_when_none_stale` → `cleanup_stale_drafts` （call）
- `test_cleanup_stale_0721.test_does_not_touch_non_pending` → `self._add_draft` （method_call）
- `test_cleanup_stale_0721.test_does_not_touch_non_pending` → `self._add_draft` （method_call）
- `test_cleanup_stale_0721.test_does_not_touch_non_pending` → `cleanup_stale_drafts` （call）
- `test_cleanup_stale_0721.test_writes_audit_log` → `self._add_draft` （method_call）
- `test_cleanup_stale_0721.test_writes_audit_log` → `cleanup_stale_drafts` （call）
- `test_cleanup_stale_0721.test_dry_run_does_not_modify` → `self._add_draft` （method_call）
- `test_cleanup_stale_0721.test_dry_run_does_not_modify` → `subprocess.run` （method_call）
- `test_cleanup_stale_0721.test_dry_run_does_not_modify` → `json.loads` （method_call）
- `test_cleanup_stale_0721.test_dry_run_does_not_modify` → `len` （call）
- `test_cleanup_stale_0721.test_dry_run_does_not_modify` → `str` （call）
- `test_cleanup_stale_0721.test_dry_run_does_not_modify` → `cursor.fetchall` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
