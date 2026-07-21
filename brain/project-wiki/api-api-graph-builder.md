---
type: api-contract
module: api_graph_builder
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：api_graph_builder

## Compiled Truth（当前最佳理解）

本模块包含 4 个接口定义。

### 接口列表

- `api_graph_builder._gbrain_put(slug, content)` → `bool`
- `api_graph_builder._gbrain_link(from_slug, to_slug, link_type)` → `bool`
- `api_graph_builder._build_api_page(interface)` → `str`
- `api_graph_builder.build_api_graph(slice_result, update_type)` → `dict[str, Any]`

### 调用关系

- `api_graph_builder._gbrain_put` → `subprocess.run` （method_call）
- `api_graph_builder._gbrain_put` → `print` （call）
- `api_graph_builder._gbrain_link` → `subprocess.run` （method_call）
- `api_graph_builder._gbrain_link` → `print` （call）
- `api_graph_builder._build_api_page` → `interface.get` （method_call）
- `api_graph_builder._build_api_page` → `interface.get` （method_call）
- `api_graph_builder._build_api_page` → `interface.get` （method_call）
- `api_graph_builder._build_api_page` → `interface.get` （method_call）
- `api_graph_builder._build_api_page` → `interface.get` （method_call）
- `api_graph_builder._build_api_page` → `interface.get` （method_call）
- `api_graph_builder._build_api_page` → `interface.get` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `lines.append` （method_call）
- `api_graph_builder._build_api_page` → `Path` （call）
- `api_graph_builder.build_api_graph` → `slice_result.get` （method_call）
- `api_graph_builder.build_api_graph` → `slice_result.get` （method_call）
- `api_graph_builder.build_api_graph` → `_build_api_page` （call）
- `api_graph_builder.build_api_graph` → `_gbrain_put` （call）
- `api_graph_builder.build_api_graph` → `dep.get` （method_call）
- `api_graph_builder.build_api_graph` → `dep.get` （method_call）
- `api_graph_builder.build_api_graph` → `from_id.split` （method_call）
- `api_graph_builder.build_api_graph` → `to_id.split` （method_call）
- `api_graph_builder.build_api_graph` → `_gbrain_link` （call）
- `api_graph_builder.build_api_graph` → `updated_pages.append` （method_call）
- `api_graph_builder.build_api_graph` → `errors.append` （method_call）
- `api_graph_builder.build_api_graph` → `len` （call）
- `api_graph_builder.build_api_graph` → `len` （call）
- `api_graph_builder.build_api_graph` → `errors.append` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
