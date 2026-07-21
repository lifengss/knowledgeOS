---
type: api-contract
module: case_validator
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：case_validator

## Compiled Truth（当前最佳理解）

本模块包含 6 个接口定义。

### 接口列表

- `case_validator._gbrain_list(page_type, limit)` → `list[dict[str, Any]]`
- `case_validator._gbrain_get(slug)` → `dict[str, Any]`
- `case_validator.validate(query, limit)` → `dict[str, Any]`
- `case_validator.commit(draft_ids, mode, db_path, operator)` → `dict[str, Any]`
- `case_validator.detect_conflicts_op(draft_ids, db_path, operator)` → `dict[str, Any]`
- `case_validator.run_validator(operation, payload, db_path, operator)` → `dict[str, Any]`

### 调用关系

- `case_validator._gbrain_list` → `subprocess.run` （method_call）
- `case_validator._gbrain_list` → `line.strip` （method_call）
- `case_validator._gbrain_list` → `print` （call）
- `case_validator._gbrain_list` → `str` （call）
- `case_validator._gbrain_list` → `line.split` （method_call）
- `case_validator._gbrain_list` → `len` （call）
- `case_validator._gbrain_list` → `pages.append` （method_call）
- `case_validator._gbrain_get` → `subprocess.run` （method_call）
- `case_validator._gbrain_get` → `print` （call）
- `case_validator.validate` → `_gbrain_list` （call）
- `case_validator.validate` → `_gbrain_list` （call）
- `case_validator.validate` → `_gbrain_list` （call）
- `case_validator.validate` → `_gbrain_get` （call）
- `case_validator.validate` → `quality_rules_detail.append` （method_call）
- `case_validator.validate` → `_gbrain_get` （call）
- `case_validator.validate` → `api_graph.append` （method_call）
- `case_validator.validate` → `_gbrain_get` （call）
- `case_validator.validate` → `test_cases_detail.append` （method_call）
- `case_validator.validate` → `query.lower` （method_call）
- `case_validator.commit` → `batch_commit` （call）
- `case_validator.commit` → `single_commit` （call）
- `case_validator.detect_conflicts_op` → `detect_conflicts` （call）
- `case_validator.run_validator` → `validate` （call）
- `case_validator.run_validator` → `commit` （call）
- `case_validator.run_validator` → `payload.get` （method_call）
- `case_validator.run_validator` → `payload.get` （method_call）
- `case_validator.run_validator` → `detect_conflicts_op` （call）
- `case_validator.run_validator` → `payload.get` （method_call）
- `case_validator.run_validator` → `payload.get` （method_call）
- `case_validator.run_validator` → `payload.get` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
