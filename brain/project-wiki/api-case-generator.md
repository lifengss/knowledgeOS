---
type: api-contract
module: case_generator
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：case_generator

## Compiled Truth（当前最佳理解）

本模块包含 5 个接口定义。

### 接口列表

- `case_generator._gbrain_query(query, limit)` → `list[dict[str, Any]]`
- `case_generator._gbrain_search(query, limit)` → `list[dict[str, Any]]`
- `case_generator._gbrain_get(slug)` → `dict[str, Any]`
- `case_generator._gbrain_graph(slug, depth)` → `list[dict[str, Any]]`
- `case_generator.generate_cases(query, mode, limit, filters)` → `dict[str, Any]`

### 调用关系

- `case_generator._gbrain_query` → `subprocess.run` （method_call）
- `case_generator._gbrain_query` → `line.strip` （method_call）
- `case_generator._gbrain_query` → `results.append` （method_call）
- `case_generator._gbrain_query` → `print` （call）
- `case_generator._gbrain_query` → `line.startswith` （method_call）
- `case_generator._gbrain_query` → `line.startswith` （method_call）
- `case_generator._gbrain_query` → `results.append` （method_call）
- `case_generator._gbrain_query` → `line.lstrip` （method_call）
- `case_generator._gbrain_search` → `subprocess.run` （method_call）
- `case_generator._gbrain_search` → `line.strip` （method_call）
- `case_generator._gbrain_search` → `print` （call）
- `case_generator._gbrain_search` → `line.startswith` （method_call）
- `case_generator._gbrain_search` → `line.index` （method_call）
- `case_generator._gbrain_search` → `rest.split` （method_call）
- `case_generator._gbrain_search` → `slug.strip` （method_call）
- `case_generator._gbrain_search` → `title.strip` （method_call）
- `case_generator._gbrain_search` → `results.append` （method_call）
- `case_generator._gbrain_search` → `float` （call）
- `case_generator._gbrain_get` → `subprocess.run` （method_call）
- `case_generator._gbrain_get` → `print` （call）
- `case_generator._gbrain_graph` → `subprocess.run` （method_call）
- `case_generator._gbrain_graph` → `line.strip` （method_call）
- `case_generator._gbrain_graph` → `print` （call）
- `case_generator._gbrain_graph` → `str` （call）
- `case_generator._gbrain_graph` → `nodes.append` （method_call）
- `case_generator._gbrain_graph` → `line.startswith` （method_call）
- `case_generator.generate_cases` → `_gbrain_query` （call）
- `case_generator.generate_cases` → `filters.get` （method_call）
- `case_generator.generate_cases` → `_gbrain_search` （call）
- `case_generator.generate_cases` → `_gbrain_get` （call）
- `case_generator.generate_cases` → `_gbrain_search` （call）
- `case_generator.generate_cases` → `r.get` （method_call）
- `case_generator.generate_cases` → `r.get` （method_call）
- `case_generator.generate_cases` → `pages.append` （method_call）
- `case_generator.generate_cases` → `_gbrain_graph` （call）
- `case_generator.generate_cases` → `graph_results.extend` （method_call）
- `case_generator.generate_cases` → `_gbrain_get` （call）
- `case_generator.generate_cases` → `r.get` （method_call）
- `case_generator.generate_cases` → `p.get` （method_call）
- `case_generator.generate_cases` → `pages.append` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
