---
type: api-contract
module: single_commit
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：single_commit

## Compiled Truth（当前最佳理解）

本模块包含 1 个接口定义。

### 接口列表

- `single_commit.single_commit(draft_id, db_path, operator, skip_conflict_check, skip_quality_gate)` → `dict[str, Any]`

### 调用关系

- `single_commit.single_commit` → `DraftCache` （call）
- `single_commit.single_commit` → `AuditLog` （call）
- `single_commit.single_commit` → `draft_cache.get_draft_by_id` （method_call）
- `single_commit.single_commit` → `draft.get` （method_call）
- `single_commit.single_commit` → `BRAIN_TYPE_MAP.get` （method_call）
- `single_commit.single_commit` → `_build_page_content` （call）
- `single_commit.single_commit` → `_write_to_brain` （call）
- `single_commit.single_commit` → `draft_cache.update_draft_status` （method_call）
- `single_commit.single_commit` → `audit_log.log` （method_call）
- `single_commit.single_commit` → `draft_cache.close` （method_call）
- `single_commit.single_commit` → `audit_log.close` （method_call）
- `single_commit.single_commit` → `draft.get` （method_call）
- `single_commit.single_commit` → `detect_conflicts` （call）
- `single_commit.single_commit` → `conflict_result.get` （method_call）
- `single_commit.single_commit` → `draft.get` （method_call）
- `single_commit.single_commit` → `draft.get` （method_call）
- `single_commit.single_commit` → `run_quality_gate` （call）
- `single_commit.single_commit` → `quality_result.get` （method_call）
- `single_commit.single_commit` → `quality_result.get` （method_call）
- `single_commit.single_commit` → `draft.get` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
