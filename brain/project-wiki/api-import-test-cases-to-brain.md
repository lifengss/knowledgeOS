---
type: api-contract
module: import_test_cases_to_brain
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：import_test_cases_to_brain

## Compiled Truth（当前最佳理解）

本模块包含 3 个接口定义。

### 接口列表

- `import_test_cases_to_brain.parse_test_cases(content)` → `list[dict]`
- `import_test_cases_to_brain.generate_brain_page(case)` → `str`
- `import_test_cases_to_brain.main()`

### 调用关系

- `import_test_cases_to_brain.parse_test_cases` → `re.compile` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `pattern.finditer` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `re.compile` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `table_pattern.finditer` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `props.get` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `props.get` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `props.get` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `props.get` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `cases.append` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `match.group` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `match.group` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `match.group` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `props.get` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `props.get` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `props.get` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `props.get` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `row.group` （method_call）
- `import_test_cases_to_brain.parse_test_cases` → `row.group` （method_call）
- `import_test_cases_to_brain.generate_brain_page` → `steps.replace` （method_call）
- `import_test_cases_to_brain.main` → `OUTPUT_DIR.mkdir` （method_call）
- `import_test_cases_to_brain.main` → `SOURCE_FILE.read_text` （method_call）
- `import_test_cases_to_brain.main` → `parse_test_cases` （call）
- `import_test_cases_to_brain.main` → `print` （call）
- `import_test_cases_to_brain.main` → `print` （call）
- `import_test_cases_to_brain.main` → `SOURCE_FILE.exists` （method_call）
- `import_test_cases_to_brain.main` → `print` （call）
- `import_test_cases_to_brain.main` → `sys.exit` （method_call）
- `import_test_cases_to_brain.main` → `generate_brain_page` （call）
- `import_test_cases_to_brain.main` → `file_path.write_text` （method_call）
- `import_test_cases_to_brain.main` → `print` （call）
- `import_test_cases_to_brain.main` → `len` （call）
- `import_test_cases_to_brain.main` → `len` （call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
