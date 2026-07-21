---
type: api-contract
module: generate_demo_data
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：generate_demo_data

## Compiled Truth（当前最佳理解）

本模块包含 7 个接口定义。

### 接口列表

- `generate_demo_data.ensure_db()`
- `generate_demo_data.generate_draft_data(cache)`
- `generate_demo_data.generate_conflict_data(queue, draft_ids)`
- `generate_demo_data.generate_audit_log(log, draft_ids, conflict_ids)`
- `generate_demo_data.set_draft_statuses(cache, draft_ids)`
- `generate_demo_data.print_summary(cache, queue, log)`
- `generate_demo_data.main()`

### 调用关系

- `generate_demo_data.ensure_db` → `DEMO_DB.exists` （method_call）
- `generate_demo_data.ensure_db` → `print` （call）
- `generate_demo_data.ensure_db` → `init_script.exists` （method_call）
- `generate_demo_data.ensure_db` → `os.system` （method_call）
- `generate_demo_data.ensure_db` → `print` （call）
- `generate_demo_data.ensure_db` → `sys.exit` （method_call）
- `generate_demo_data.generate_draft_data` → `cache.add_draft` （method_call）
- `generate_demo_data.generate_draft_data` → `ids.append` （method_call）
- `generate_demo_data.generate_draft_data` → `print` （call）
- `generate_demo_data.generate_conflict_data` → `queue.add_conflict` （method_call）
- `generate_demo_data.generate_conflict_data` → `ids.append` （method_call）
- `generate_demo_data.generate_conflict_data` → `print` （call）
- `generate_demo_data.generate_audit_log` → `log.log` （method_call）
- `generate_demo_data.generate_audit_log` → `print` （call）
- `generate_demo_data.set_draft_statuses` → `cache.update_draft_status` （method_call）
- `generate_demo_data.set_draft_statuses` → `print` （call）
- `generate_demo_data.set_draft_statuses` → `cache.update_draft_status` （method_call）
- `generate_demo_data.set_draft_statuses` → `print` （call）
- `generate_demo_data.set_draft_statuses` → `cache.update_draft_status` （method_call）
- `generate_demo_data.set_draft_statuses` → `print` （call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `cache.get_drafts_by_status` （method_call）
- `generate_demo_data.print_summary` → `cache.get_drafts_by_status` （method_call）
- `generate_demo_data.print_summary` → `cache.get_drafts_by_status` （method_call）
- `generate_demo_data.print_summary` → `cache.get_drafts_by_status` （method_call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `queue.get_pending_conflicts` （method_call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `log.get_stats` （method_call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `print` （call）
- `generate_demo_data.print_summary` → `len` （call）
- `generate_demo_data.print_summary` → `len` （call）
- `generate_demo_data.print_summary` → `len` （call）
- `generate_demo_data.print_summary` → `len` （call）
- `generate_demo_data.print_summary` → `len` （call）
- `generate_demo_data.main` → `print` （call）
- `generate_demo_data.main` → `ensure_db` （call）
- `generate_demo_data.main` → `DraftCache` （call）
- `generate_demo_data.main` → `ConflictQueue` （call）
- `generate_demo_data.main` → `AuditLog` （call）
- `generate_demo_data.main` → `print` （call）
- `generate_demo_data.main` → `str` （call）
- `generate_demo_data.main` → `str` （call）
- `generate_demo_data.main` → `str` （call）
- `generate_demo_data.main` → `generate_draft_data` （call）
- `generate_demo_data.main` → `generate_conflict_data` （call）
- `generate_demo_data.main` → `generate_audit_log` （call）
- `generate_demo_data.main` → `set_draft_statuses` （call）
- `generate_demo_data.main` → `print_summary` （call）
- `generate_demo_data.main` → `cache.close` （method_call）
- `generate_demo_data.main` → `queue.close` （method_call）
- `generate_demo_data.main` → `log.close` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
