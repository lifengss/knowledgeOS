---
type: api-contract
module: clone_and_slice_project
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：clone_and_slice_project

## Compiled Truth（当前最佳理解）

本模块包含 4 个接口定义。

### 接口列表

- `clone_and_slice_project.copy_project(source, target)`
- `clone_and_slice_project.run_slicer(code_path)` → `dict`
- `clone_and_slice_project.generate_api_wiki_pages(result)` → `list[Path]`
- `clone_and_slice_project.main()`

### 调用关系

- `clone_and_slice_project.copy_project` → `target.exists` （method_call）
- `clone_and_slice_project.copy_project` → `target.mkdir` （method_call）
- `clone_and_slice_project.copy_project` → `source.rglob` （method_call）
- `clone_and_slice_project.copy_project` → `print` （call）
- `clone_and_slice_project.copy_project` → `shutil.rmtree` （method_call）
- `clone_and_slice_project.copy_project` → `any` （call）
- `clone_and_slice_project.copy_project` → `item.relative_to` （method_call）
- `clone_and_slice_project.copy_project` → `item.is_dir` （method_call）
- `clone_and_slice_project.copy_project` → `dest.mkdir` （method_call）
- `clone_and_slice_project.copy_project` → `item.is_file` （method_call）
- `clone_and_slice_project.copy_project` → `shutil.copy2` （method_call）
- `clone_and_slice_project.run_slicer` → `slice_code` （call）
- `clone_and_slice_project.run_slicer` → `print` （call）
- `clone_and_slice_project.run_slicer` → `str` （call）
- `clone_and_slice_project.run_slicer` → `str` （call）
- `clone_and_slice_project.run_slicer` → `len` （call）
- `clone_and_slice_project.run_slicer` → `len` （call）
- `clone_and_slice_project.generate_api_wiki_pages` → `OUTPUT_WIKI_DIR.mkdir` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `modules.items` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `sorted` （call）
- `clone_and_slice_project.generate_api_wiki_pages` → `overview_path.write_text` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `written.append` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `print` （call）
- `clone_and_slice_project.generate_api_wiki_pages` → `iface.get` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `file_path.write_text` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `written.append` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `print` （call）
- `clone_and_slice_project.generate_api_wiki_pages` → `modules.keys` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `iface.get` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `iface.get` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `len` （call）
- `clone_and_slice_project.generate_api_wiki_pages` → `len` （call）
- `clone_and_slice_project.generate_api_wiki_pages` → `len` （call）
- `clone_and_slice_project.generate_api_wiki_pages` → `len` （call）
- `clone_and_slice_project.generate_api_wiki_pages` → `modules.setdefault` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `len` （call）
- `clone_and_slice_project.generate_api_wiki_pages` → `iface.get` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `datetime.now` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `datetime.now` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `datetime.now` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `mod_name.lower` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `datetime.now` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `datetime.now` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `datetime.now` （method_call）
- `clone_and_slice_project.generate_api_wiki_pages` → `mod_name.lower` （method_call）
- `clone_and_slice_project.main` → `print` （call）
- `clone_and_slice_project.main` → `copy_project` （call）
- `clone_and_slice_project.main` → `print` （call）
- `clone_and_slice_project.main` → `run_slicer` （call）
- `clone_and_slice_project.main` → `slice_json_path.write_text` （method_call）
- `clone_and_slice_project.main` → `print` （call）
- `clone_and_slice_project.main` → `print` （call）
- `clone_and_slice_project.main` → `generate_api_wiki_pages` （call）
- `clone_and_slice_project.main` → `print` （call）
- `clone_and_slice_project.main` → `print` （call）
- `clone_and_slice_project.main` → `print` （call）
- `clone_and_slice_project.main` → `json.dumps` （method_call）
- `clone_and_slice_project.main` → `len` （call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
