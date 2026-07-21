---
type: api-contract
module: quality_gate
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：quality_gate

## Compiled Truth（当前最佳理解）

本模块包含 7 个接口定义。

### 接口列表

- `quality_gate._score_completeness(draft)` → `int`
- `quality_gate._score_length(draft)` → `int`
- `quality_gate._score_format(draft)` → `int`
- `quality_gate._score_source(draft)` → `int`
- `quality_gate.evaluate_draft(draft)` → `dict[str, Any]`
- `quality_gate._build_reject_reason(c, l, f, s)` → `str`
- `quality_gate.run_quality_gate(draft_ids, db_path, operator)` → `dict[str, Any]`

### 调用关系

- `quality_gate._score_completeness` → `draft.get` （method_call）
- `quality_gate._score_completeness` → `min` （call）
- `quality_gate._score_completeness` → `draft.get` （method_call）
- `quality_gate._score_length` → `draft.get` （method_call）
- `quality_gate._score_length` → `draft.get` （method_call）
- `quality_gate._score_length` → `min` （call）
- `quality_gate._score_length` → `len` （call）
- `quality_gate._score_length` → `len` （call）
- `quality_gate._score_length` → `len` （call）
- `quality_gate._score_length` → `len` （call）
- `quality_gate._score_length` → `len` （call）
- `quality_gate._score_length` → `len` （call）
- `quality_gate._score_format` → `draft.get` （method_call）
- `quality_gate._score_format` → `re.search` （method_call）
- `quality_gate._score_format` → `re.search` （method_call）
- `quality_gate._score_format` → `min` （call）
- `quality_gate._score_format` → `content.strip` （method_call）
- `quality_gate._score_source` → `draft.get` （method_call）
- `quality_gate._score_source` → `int` （call）
- `quality_gate._score_source` → `int` （call）
- `quality_gate._score_source` → `int` （call）
- `quality_gate.evaluate_draft` → `_score_completeness` （call）
- `quality_gate.evaluate_draft` → `_score_length` （call）
- `quality_gate.evaluate_draft` → `_score_format` （call）
- `quality_gate.evaluate_draft` → `_score_source` （call）
- `quality_gate.evaluate_draft` → `draft.get` （method_call）
- `quality_gate.evaluate_draft` → `_build_reject_reason` （call）
- `quality_gate._build_reject_reason` → `reasons.append` （method_call）
- `quality_gate._build_reject_reason` → `reasons.append` （method_call）
- `quality_gate._build_reject_reason` → `reasons.append` （method_call）
- `quality_gate._build_reject_reason` → `reasons.append` （method_call）
- `quality_gate.run_quality_gate` → `DraftCache` （call）
- `quality_gate.run_quality_gate` → `AuditLog` （call）
- `quality_gate.run_quality_gate` → `audit_log.log` （method_call）
- `quality_gate.run_quality_gate` → `draft_cache.close` （method_call）
- `quality_gate.run_quality_gate` → `audit_log.close` （method_call）
- `quality_gate.run_quality_gate` → `draft_cache.get_drafts_by_status` （method_call）
- `quality_gate.run_quality_gate` → `evaluate_draft` （call）
- `quality_gate.run_quality_gate` → `len` （call）
- `quality_gate.run_quality_gate` → `draft_cache.get_draft_by_id` （method_call）
- `quality_gate.run_quality_gate` → `draft_cache.update_draft_status` （method_call）
- `quality_gate.run_quality_gate` → `passed.append` （method_call）
- `quality_gate.run_quality_gate` → `draft_cache.update_draft_status` （method_call）
- `quality_gate.run_quality_gate` → `rejected.append` （method_call）
- `quality_gate.run_quality_gate` → `drafts.append` （method_call）
- `quality_gate.run_quality_gate` → `len` （call）
- `quality_gate.run_quality_gate` → `len` （call）
- `quality_gate.run_quality_gate` → `len` （call）
- `quality_gate.run_quality_gate` → `d.get` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
