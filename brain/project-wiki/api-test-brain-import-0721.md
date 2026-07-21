---
type: api-contract
module: test_brain_import_0721
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：test_brain_import_0721

## Compiled Truth（当前最佳理解）

本模块包含 18 个接口定义。

### 接口列表

- `TestImportTestCasesToBrain.test_test_cases_dir_exists(self)` （类: `TestImportTestCasesToBrain`）
- `TestImportTestCasesToBrain.test_test_case_has_frontmatter(self)` （类: `TestImportTestCasesToBrain`）
- `TestImportTestCasesToBrain.test_test_case_has_compiled_truth(self)` （类: `TestImportTestCasesToBrain`）
- `TestImportTestCasesToBrain.test_test_case_has_timeline(self)` （类: `TestImportTestCasesToBrain`）
- `TestCloneAndSliceProject.test_slice_result_has_interfaces(self)` （类: `TestCloneAndSliceProject`）
- `TestCloneAndSliceProject.test_slice_result_has_dependencies(self)` （类: `TestCloneAndSliceProject`）
- `TestCloneAndSliceProject.test_project_wiki_dir_exists(self)` （类: `TestCloneAndSliceProject`）
- `TestCloneAndSliceProject.test_api_page_has_frontmatter(self)` （类: `TestCloneAndSliceProject`）
- `TestCloneAndSliceProject.test_api_page_has_module_list(self)` （类: `TestCloneAndSliceProject`）
- `test_brain_import_0721.test_test_cases_dir_exists(self)`
- `test_brain_import_0721.test_test_case_has_frontmatter(self)`
- `test_brain_import_0721.test_test_case_has_compiled_truth(self)`
- `test_brain_import_0721.test_test_case_has_timeline(self)`
- `test_brain_import_0721.test_slice_result_has_interfaces(self)`
- `test_brain_import_0721.test_slice_result_has_dependencies(self)`
- `test_brain_import_0721.test_project_wiki_dir_exists(self)`
- `test_brain_import_0721.test_api_page_has_frontmatter(self)`
- `test_brain_import_0721.test_api_page_has_module_list(self)`

### 调用关系

- `test_brain_import_0721.test_test_cases_dir_exists` → `tc_dir.exists` （method_call）
- `test_brain_import_0721.test_test_cases_dir_exists` → `list` （call）
- `test_brain_import_0721.test_test_cases_dir_exists` → `tc_dir.glob` （method_call）
- `test_brain_import_0721.test_test_cases_dir_exists` → `len` （call）
- `test_brain_import_0721.test_test_case_has_frontmatter` → `tc_file.exists` （method_call）
- `test_brain_import_0721.test_test_case_has_frontmatter` → `tc_file.read_text` （method_call）
- `test_brain_import_0721.test_test_case_has_frontmatter` → `content.startswith` （method_call）
- `test_brain_import_0721.test_test_case_has_compiled_truth` → `tc_file.read_text` （method_call）
- `test_brain_import_0721.test_test_case_has_timeline` → `tc_file.read_text` （method_call）
- `test_brain_import_0721.test_slice_result_has_interfaces` → `slice_code` （call）
- `test_brain_import_0721.test_slice_result_has_interfaces` → `str` （call）
- `test_brain_import_0721.test_slice_result_has_interfaces` → `len` （call）
- `test_brain_import_0721.test_slice_result_has_dependencies` → `slice_code` （call）
- `test_brain_import_0721.test_slice_result_has_dependencies` → `str` （call）
- `test_brain_import_0721.test_project_wiki_dir_exists` → `wiki_dir.exists` （method_call）
- `test_brain_import_0721.test_project_wiki_dir_exists` → `list` （call）
- `test_brain_import_0721.test_project_wiki_dir_exists` → `wiki_dir.glob` （method_call）
- `test_brain_import_0721.test_project_wiki_dir_exists` → `len` （call）
- `test_brain_import_0721.test_api_page_has_frontmatter` → `wiki_file.exists` （method_call）
- `test_brain_import_0721.test_api_page_has_frontmatter` → `wiki_file.read_text` （method_call）
- `test_brain_import_0721.test_api_page_has_frontmatter` → `content.startswith` （method_call）
- `test_brain_import_0721.test_api_page_has_module_list` → `wiki_file.read_text` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
