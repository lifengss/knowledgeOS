---
type: api-contract
module: batch_commit
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：batch_commit

## Compiled Truth（当前最佳理解）

本模块包含 3 个接口定义。

### 接口列表

- `batch_commit._write_to_brain(slug, content)` → `bool`
- `batch_commit._build_page_content(draft)` → `str`
- `batch_commit.batch_commit(draft_ids, db_path, operator, skip_conflict_check, skip_quality_gate)` → `dict[str, Any]`

### 调用关系

- `batch_commit._write_to_brain` → `subprocess.run` （method_call）
- `batch_commit._write_to_brain` → `print` （call）
- `batch_commit._build_page_content` → `draft.get` （method_call）
- `batch_commit._build_page_content` → `draft.get` （method_call）
- `batch_commit._build_page_content` → `draft.get` （method_call）
- `batch_commit._build_page_content` → `frontmatter_lines.append` （method_call）
- `batch_commit._build_page_content` → `frontmatter_lines.append` （method_call）
- `batch_commit._build_page_content` → `frontmatter_lines.append` （method_call）
- `batch_commit._build_page_content` → `frontmatter_lines.append` （method_call）
- `batch_commit._build_page_content` → `frontmatter_lines.append` （method_call）
- `batch_commit._build_page_content` → `draft.get` （method_call）
- `batch_commit._build_page_content` → `metadata.items` （method_call）
- `batch_commit._build_page_content` → `isinstance` （call）
- `batch_commit._build_page_content` → `draft.get` （method_call）
- `batch_commit._build_page_content` → `frontmatter_lines.append` （method_call）
- `batch_commit._build_page_content` → `frontmatter_lines.append` （method_call）
- `batch_commit._build_page_content` → `json.dumps` （method_call）
- `batch_commit.batch_commit` → `DraftCache` （call）
- `batch_commit.batch_commit` → `AuditLog` （call）
- `batch_commit.batch_commit` → `audit_log.log` （method_call）
- `batch_commit.batch_commit` → `draft_cache.close` （method_call）
- `batch_commit.batch_commit` → `audit_log.close` （method_call）
- `batch_commit.batch_commit` → `detect_conflicts` （call）
- `batch_commit.batch_commit` → `draft.get` （method_call）
- `batch_commit.batch_commit` → `BRAIN_TYPE_MAP.get` （method_call）
- `batch_commit.batch_commit` → `_build_page_content` （call）
- `batch_commit.batch_commit` → `_write_to_brain` （call）
- `batch_commit.batch_commit` → `len` （call）
- `batch_commit.batch_commit` → `draft_cache.get_draft_by_id` （method_call）
- `batch_commit.batch_commit` → `draft_cache._row_to_draft` （method_call）
- `batch_commit.batch_commit` → `run_quality_gate` （call）
- `batch_commit.batch_commit` → `quality_result.get` （method_call）
- `batch_commit.batch_commit` → `draft_cache.update_draft_status` （method_call）
- `batch_commit.batch_commit` → `committed.append` （method_call）
- `batch_commit.batch_commit` → `committed_pages.append` （method_call）
- `batch_commit.batch_commit` → `failed.append` （method_call）
- `batch_commit.batch_commit` → `drafts.append` （method_call）
- `batch_commit.batch_commit` → `cursor.fetchall` （method_call）
- `batch_commit.batch_commit` → `conflict_result.get` （method_call）
- `batch_commit.batch_commit` → `len` （call）
- `batch_commit.batch_commit` → `len` （call）
- `batch_commit.batch_commit` → `len` （call）
- `batch_commit.batch_commit` → `len` （call）
- `batch_commit.batch_commit` → `len` （call）
- `batch_commit.batch_commit` → `conflict_result.get` （method_call）
- `batch_commit.batch_commit` → `d.get` （method_call）
- `batch_commit.batch_commit` → `d.get` （method_call）
- `batch_commit.batch_commit` → `d.get` （method_call）
- `batch_commit.batch_commit` → `quality_result.get` （method_call）
- `batch_commit.batch_commit` → `conflict_result.get` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
