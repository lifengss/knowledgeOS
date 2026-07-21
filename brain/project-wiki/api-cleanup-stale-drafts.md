---
type: api-contract
module: cleanup_stale_drafts
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：cleanup_stale_drafts

## Compiled Truth（当前最佳理解）

本模块包含 2 个接口定义。

### 接口列表

- `cleanup_stale_drafts.cleanup_stale_drafts(db_path, days)` → `dict`
- `cleanup_stale_drafts.main()`

### 调用关系

- `cleanup_stale_drafts.cleanup_stale_drafts` → `DraftCache` （call）
- `cleanup_stale_drafts.cleanup_stale_drafts` → `AuditLog` （call）
- `cleanup_stale_drafts.cleanup_stale_drafts` → `cache.cleanup_stale_drafts` （method_call）
- `cleanup_stale_drafts.cleanup_stale_drafts` → `print` （call）
- `cleanup_stale_drafts.cleanup_stale_drafts` → `cache.close` （method_call）
- `cleanup_stale_drafts.cleanup_stale_drafts` → `audit.close` （method_call）
- `cleanup_stale_drafts.cleanup_stale_drafts` → `audit.log` （method_call）
- `cleanup_stale_drafts.cleanup_stale_drafts` → `json.dumps` （method_call）
- `cleanup_stale_drafts.cleanup_stale_drafts` → `cursor.fetchall` （method_call）
- `cleanup_stale_drafts.cleanup_stale_drafts` → `datetime.now` （method_call）
- `cleanup_stale_drafts.main` → `argparse.ArgumentParser` （method_call）
- `cleanup_stale_drafts.main` → `parser.add_argument` （method_call）
- `cleanup_stale_drafts.main` → `parser.add_argument` （method_call）
- `cleanup_stale_drafts.main` → `parser.add_argument` （method_call）
- `cleanup_stale_drafts.main` → `parser.parse_args` （method_call）
- `cleanup_stale_drafts.main` → `cleanup_stale_drafts` （call）
- `cleanup_stale_drafts.main` → `DraftCache` （call）
- `cleanup_stale_drafts.main` → `print` （call）
- `cleanup_stale_drafts.main` → `cache.close` （method_call）
- `cleanup_stale_drafts.main` → `json.dumps` （method_call）
- `cleanup_stale_drafts.main` → `cursor.fetchall` （method_call）
- `cleanup_stale_drafts.main` → `len` （call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
