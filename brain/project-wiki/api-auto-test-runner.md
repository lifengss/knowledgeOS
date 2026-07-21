---
type: api-contract
module: auto_test_runner
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：auto_test_runner

## Compiled Truth（当前最佳理解）

本模块包含 12 个接口定义。

### 接口列表

- `auto_test_runner.load_registry()` → `dict`
- `auto_test_runner.save_registry(registry)` → `None`
- `auto_test_runner.discover_new_tests(registry)` → `list[Path]`
- `auto_test_runner.run_pytest(test_file)` → `dict`
- `auto_test_runner._parse_pytest_output(stdout, stderr, test_file)` → `list[dict]`
- `auto_test_runner._extract_case_from_report(test, test_file)` → `dict`
- `auto_test_runner.extract_docstring_from_source(test_file, case_name)` → `str`
- `auto_test_runner.generate_case_markdown(case, module_name, index)` → `str`
- `auto_test_runner.append_to_case_doc(markdown_blocks)` → `None`
- `auto_test_runner.print_summary(results)` → `None`
- `auto_test_runner.run_single_file(test_file, registry)` → `dict`
- `auto_test_runner.main()` → `int`

### 调用关系

- `auto_test_runner.load_registry` → `REGISTRY_FILE.exists` （method_call）
- `auto_test_runner.load_registry` → `list` （call）
- `auto_test_runner.load_registry` → `open` （call）
- `auto_test_runner.load_registry` → `json.load` （method_call）
- `auto_test_runner.save_registry` → `open` （call）
- `auto_test_runner.save_registry` → `json.dump` （method_call）
- `auto_test_runner.discover_new_tests` → `set` （call）
- `auto_test_runner.discover_new_tests` → `TESTS_DIR.exists` （method_call）
- `auto_test_runner.discover_new_tests` → `registry.get` （method_call）
- `auto_test_runner.discover_new_tests` → `TESTS_DIR.iterdir` （method_call）
- `auto_test_runner.discover_new_tests` → `f.is_file` （method_call）
- `auto_test_runner.discover_new_tests` → `new_files.append` （method_call）
- `auto_test_runner.run_pytest` → `_parse_pytest_output` （call）
- `auto_test_runner.run_pytest` → `str` （call）
- `auto_test_runner.run_pytest` → `subprocess.run` （method_call）
- `auto_test_runner.run_pytest` → `test_file.relative_to` （method_call）
- `auto_test_runner.run_pytest` → `str` （call）
- `auto_test_runner._parse_pytest_output` → `reversed` （call）
- `auto_test_runner._parse_pytest_output` → `re.compile` （method_call）
- `auto_test_runner._parse_pytest_output` → `line.strip` （method_call）
- `auto_test_runner._parse_pytest_output` → `line.startswith` （method_call）
- `auto_test_runner._parse_pytest_output` → `pattern.match` （method_call）
- `auto_test_runner._parse_pytest_output` → `stdout.strip` （method_call）
- `auto_test_runner._parse_pytest_output` → `cases.append` （method_call）
- `auto_test_runner._parse_pytest_output` → `json.loads` （method_call）
- `auto_test_runner._parse_pytest_output` → `report.get` （method_call）
- `auto_test_runner._parse_pytest_output` → `cases.append` （method_call）
- `auto_test_runner._parse_pytest_output` → `_extract_case_from_report` （call）
- `auto_test_runner._parse_pytest_output` → `m.group` （method_call）
- `auto_test_runner._parse_pytest_output` → `m.group` （method_call）
- `auto_test_runner._parse_pytest_output` → `m.group` （method_call）
- `auto_test_runner._extract_case_from_report` → `test.get` （method_call）
- `auto_test_runner._extract_case_from_report` → `nodeid.split` （method_call）
- `auto_test_runner._extract_case_from_report` → `test.get` （method_call）
- `auto_test_runner._extract_case_from_report` → `nodeid.replace` （method_call）
- `auto_test_runner._extract_case_from_report` → `doc.strip` （method_call）
- `auto_test_runner._extract_case_from_report` → `test.get` （method_call）
- `auto_test_runner._extract_case_from_report` → `test.get` （method_call）
- `auto_test_runner._extract_case_from_report` → `test.get` （method_call）
- `auto_test_runner.extract_docstring_from_source` → `re.compile` （method_call）
- `auto_test_runner.extract_docstring_from_source` → `pattern.search` （method_call）
- `auto_test_runner.extract_docstring_from_source` → `re.compile` （method_call）
- `auto_test_runner.extract_docstring_from_source` → `pattern2.search` （method_call）
- `auto_test_runner.extract_docstring_from_source` → `test_file.read_text` （method_call）
- `auto_test_runner.extract_docstring_from_source` → `re.escape` （method_call）
- `auto_test_runner.extract_docstring_from_source` → `m.group` （method_call）
- `auto_test_runner.extract_docstring_from_source` → `re.escape` （method_call）
- `auto_test_runner.extract_docstring_from_source` → `m2.group` （method_call）
- `auto_test_runner.generate_case_markdown` → `extract_docstring_from_source` （call）
- `auto_test_runner.generate_case_markdown` → `doc.lower` （method_call）
- `auto_test_runner.generate_case_markdown` → `doc.lower` （method_call）
- `auto_test_runner.generate_case_markdown` → `datetime.now` （method_call）
- `auto_test_runner.generate_case_markdown` → `l.strip` （method_call）
- `auto_test_runner.generate_case_markdown` → `len` （call）
- `auto_test_runner.generate_case_markdown` → `status.upper` （method_call）
- `auto_test_runner.generate_case_markdown` → `doc.lower` （method_call）
- `auto_test_runner.generate_case_markdown` → `doc.lower` （method_call）
- `auto_test_runner.generate_case_markdown` → `doc.splitlines` （method_call）
- `auto_test_runner.generate_case_markdown` → `l.strip` （method_call）
- `auto_test_runner.generate_case_markdown` → `datetime.now` （method_call）
- `auto_test_runner.append_to_case_doc` → `CASE_DOC.read_text` （method_call）
- `auto_test_runner.append_to_case_doc` → `CASE_DOC.exists` （method_call）
- `auto_test_runner.append_to_case_doc` → `CASE_DOC.write_text` （method_call）
- `auto_test_runner.append_to_case_doc` → `open` （call）
- `auto_test_runner.append_to_case_doc` → `f.write` （method_call）
- `auto_test_runner.append_to_case_doc` → `datetime.now` （method_call）
- `auto_test_runner.print_summary` → `print` （call）
- `auto_test_runner.print_summary` → `print` （call）
- `auto_test_runner.print_summary` → `print` （call）
- `auto_test_runner.print_summary` → `print` （call）
- `auto_test_runner.print_summary` → `print` （call）
- `auto_test_runner.print_summary` → `r.get` （method_call）
- `auto_test_runner.print_summary` → `r.get` （method_call）
- `auto_test_runner.print_summary` → `r.get` （method_call）
- `auto_test_runner.print_summary` → `print` （call）
- `auto_test_runner.print_summary` → `len` （call）
- `auto_test_runner.print_summary` → `print` （call）
- `auto_test_runner.print_summary` → `len` （call）
- `auto_test_runner.run_single_file` → `print` （call）
- `auto_test_runner.run_single_file` → `print` （call）
- `auto_test_runner.run_single_file` → `run_pytest` （call）
- `auto_test_runner.run_single_file` → `str` （call）
- `auto_test_runner.run_single_file` → `result.get` （method_call）
- `auto_test_runner.run_single_file` → `save_registry` （call）
- `auto_test_runner.run_single_file` → `append_to_case_doc` （call）
- `auto_test_runner.run_single_file` → `c.get` （method_call）
- `auto_test_runner.run_single_file` → `extract_docstring_from_source` （call）
- `auto_test_runner.run_single_file` → `generate_case_markdown` （call）
- `auto_test_runner.run_single_file` → `datetime.now` （method_call）
- `auto_test_runner.run_single_file` → `enumerate` （call）
- `auto_test_runner.main` → `argparse.ArgumentParser` （method_call）
- `auto_test_runner.main` → `parser.add_argument` （method_call）
- `auto_test_runner.main` → `parser.add_argument` （method_call）
- `auto_test_runner.main` → `parser.add_argument` （method_call）
- `auto_test_runner.main` → `parser.parse_args` （method_call）
- `auto_test_runner.main` → `load_registry` （call）
- `auto_test_runner.main` → `discover_new_tests` （call）
- `auto_test_runner.main` → `print_summary` （call）
- `auto_test_runner.main` → `Path` （call）
- `auto_test_runner.main` → `run_single_file` （call）
- `auto_test_runner.main` → `print_summary` （call）
- `auto_test_runner.main` → `print` （call）
- `auto_test_runner.main` → `print` （call）
- `auto_test_runner.main` → `print` （call）
- `auto_test_runner.main` → `run_single_file` （call）
- `auto_test_runner.main` → `results.append` （method_call）
- `auto_test_runner.main` → `all` （call）
- `auto_test_runner.main` → `target.is_absolute` （method_call）
- `auto_test_runner.main` → `target.exists` （method_call）
- `auto_test_runner.main` → `print` （call）
- `auto_test_runner.main` → `discover_new_tests` （call）
- `auto_test_runner.main` → `time.sleep` （method_call）
- `auto_test_runner.main` → `load_registry` （call）
- `auto_test_runner.main` → `print` （call）
- `auto_test_runner.main` → `print_summary` （call）
- `auto_test_runner.main` → `print` （call）
- `auto_test_runner.main` → `run_single_file` （call）
- `auto_test_runner.main` → `results.append` （method_call）
- `auto_test_runner.main` → `datetime.now` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
