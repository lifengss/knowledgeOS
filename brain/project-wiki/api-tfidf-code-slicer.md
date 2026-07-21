---
type: api-contract
module: tfidf_code_slicer
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：tfidf_code_slicer

## Compiled Truth（当前最佳理解）

本模块包含 7 个接口定义。

### 接口列表

- `tfidf_code_slicer._collect_files(code_path)` → `list[Path]`
- `tfidf_code_slicer._detect_language(file_path)` → `str`
- `tfidf_code_slicer._parse_python(file_path)` → `dict[str, Any]`
- `tfidf_code_slicer._parse_js_ts(file_path)` → `dict[str, Any]`
- `tfidf_code_slicer._parse_java(file_path)` → `dict[str, Any]`
- `tfidf_code_slicer._compute_similarities(interfaces)` → `list[dict[str, Any]]`
- `tfidf_code_slicer.slice_code(code_path)` → `dict[str, Any]`

### 调用关系

- `tfidf_code_slicer._collect_files` → `Path` （call）
- `tfidf_code_slicer._collect_files` → `path.is_file` （method_call）
- `tfidf_code_slicer._collect_files` → `path.is_dir` （method_call）
- `tfidf_code_slicer._collect_files` → `files.extend` （method_call）
- `tfidf_code_slicer._collect_files` → `path.rglob` （method_call）
- `tfidf_code_slicer._detect_language` → `mapping.get` （method_call）
- `tfidf_code_slicer._parse_python` → `ast.walk` （method_call）
- `tfidf_code_slicer._parse_python` → `file_path.read_text` （method_call）
- `tfidf_code_slicer._parse_python` → `ast.parse` （method_call）
- `tfidf_code_slicer._parse_python` → `isinstance` （call）
- `tfidf_code_slicer._parse_python` → `str` （call）
- `tfidf_code_slicer._parse_python` → `interfaces.append` （method_call）
- `tfidf_code_slicer._parse_python` → `ast.walk` （method_call）
- `tfidf_code_slicer._parse_python` → `isinstance` （call）
- `tfidf_code_slicer._parse_python` → `str` （call）
- `tfidf_code_slicer._parse_python` → `str` （call）
- `tfidf_code_slicer._parse_python` → `isinstance` （call）
- `tfidf_code_slicer._parse_python` → `ast.unparse` （method_call）
- `tfidf_code_slicer._parse_python` → `str` （call）
- `tfidf_code_slicer._parse_python` → `isinstance` （call）
- `tfidf_code_slicer._parse_python` → `isinstance` （call）
- `tfidf_code_slicer._parse_python` → `dependencies.append` （method_call）
- `tfidf_code_slicer._parse_python` → `interfaces.append` （method_call）
- `tfidf_code_slicer._parse_python` → `isinstance` （call）
- `tfidf_code_slicer._parse_python` → `isinstance` （call）
- `tfidf_code_slicer._parse_python` → `dependencies.append` （method_call）
- `tfidf_code_slicer._parse_python` → `str` （call）
- `tfidf_code_slicer._parse_js_ts` → `file_path.read_text` （method_call）
- `tfidf_code_slicer._parse_js_ts` → `re.compile` （method_call）
- `tfidf_code_slicer._parse_js_ts` → `func_pattern.finditer` （method_call）
- `tfidf_code_slicer._parse_js_ts` → `re.compile` （method_call）
- `tfidf_code_slicer._parse_js_ts` → `call_pattern.finditer` （method_call）
- `tfidf_code_slicer._parse_js_ts` → `match.group` （method_call）
- `tfidf_code_slicer._parse_js_ts` → `str` （call）
- `tfidf_code_slicer._parse_js_ts` → `match.group` （method_call）
- `tfidf_code_slicer._parse_js_ts` → `match.group` （method_call）
- `tfidf_code_slicer._parse_js_ts` → `match.group` （method_call）
- `tfidf_code_slicer._parse_js_ts` → `match.group` （method_call）
- `tfidf_code_slicer._parse_js_ts` → `match.group` （method_call）
- `tfidf_code_slicer._parse_js_ts` → `p.strip` （method_call）
- `tfidf_code_slicer._parse_js_ts` → `interfaces.append` （method_call）
- `tfidf_code_slicer._parse_js_ts` → `dependencies.append` （method_call）
- `tfidf_code_slicer._parse_js_ts` → `params_str.split` （method_call）
- `tfidf_code_slicer._parse_js_ts` → `p.strip` （method_call）
- `tfidf_code_slicer._parse_js_ts` → `str` （call）
- `tfidf_code_slicer._parse_java` → `file_path.read_text` （method_call）
- `tfidf_code_slicer._parse_java` → `re.compile` （method_call）
- `tfidf_code_slicer._parse_java` → `method_pattern.finditer` （method_call）
- `tfidf_code_slicer._parse_java` → `re.compile` （method_call）
- `tfidf_code_slicer._parse_java` → `call_pattern.finditer` （method_call）
- `tfidf_code_slicer._parse_java` → `match.group` （method_call）
- `tfidf_code_slicer._parse_java` → `match.group` （method_call）
- `tfidf_code_slicer._parse_java` → `match.group` （method_call）
- `tfidf_code_slicer._parse_java` → `str` （call）
- `tfidf_code_slicer._parse_java` → `interfaces.append` （method_call）
- `tfidf_code_slicer._parse_java` → `dependencies.append` （method_call）
- `tfidf_code_slicer._parse_java` → `p.strip` （method_call）
- `tfidf_code_slicer._parse_java` → `params_str.split` （method_call）
- `tfidf_code_slicer._parse_java` → `p.strip` （method_call）
- `tfidf_code_slicer._parse_java` → `str` （call）
- `tfidf_code_slicer._parse_java` → `p.strip` （method_call）
- `tfidf_code_slicer._compute_similarities` → `enumerate` （call）
- `tfidf_code_slicer._compute_similarities` → `a.get` （method_call）
- `tfidf_code_slicer._compute_similarities` → `b.get` （method_call）
- `tfidf_code_slicer._compute_similarities` → `similarities.append` （method_call）
- `tfidf_code_slicer._compute_similarities` → `SequenceMatcher` （call）
- `tfidf_code_slicer._compute_similarities` → `name_a.lower` （method_call）
- `tfidf_code_slicer._compute_similarities` → `name_b.lower` （method_call）
- `tfidf_code_slicer._compute_similarities` → `round` （call）
- `tfidf_code_slicer.slice_code` → `_collect_files` （call）
- `tfidf_code_slicer.slice_code` → `_compute_similarities` （call）
- `tfidf_code_slicer.slice_code` → `_detect_language` （call）
- `tfidf_code_slicer.slice_code` → `file_results.append` （method_call）
- `tfidf_code_slicer.slice_code` → `all_interfaces.extend` （method_call）
- `tfidf_code_slicer.slice_code` → `all_dependencies.extend` （method_call）
- `tfidf_code_slicer.slice_code` → `_parse_python` （call）
- `tfidf_code_slicer.slice_code` → `result.get` （method_call）
- `tfidf_code_slicer.slice_code` → `result.get` （method_call）
- `tfidf_code_slicer.slice_code` → `str` （call）
- `tfidf_code_slicer.slice_code` → `_parse_js_ts` （call）
- `tfidf_code_slicer.slice_code` → `_parse_java` （call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
