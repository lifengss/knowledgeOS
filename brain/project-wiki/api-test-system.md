---
type: api-contract
module: test_system
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：test_system

## Compiled Truth（当前最佳理解）

本模块包含 29 个接口定义。

### 接口列表

- `test_system._run_cmd(cmd, check)` → `subprocess.CompletedProcess`
- `TestL0Access.test_gbrain_version(self)` （类: `TestL0Access`）
- `TestL0Access.test_brain_structure(self)` （类: `TestL0Access`）
- `TestL0Access.test_mcp_http_server_help(self)` （类: `TestL0Access`）
- `TestL0Access.test_gbrain_list_pages(self)` （类: `TestL0Access`）
- `TestL3Kernel.test_four_directories(self)` （类: `TestL3Kernel`）
- `TestL3Kernel.test_page_structure(self)` （类: `TestL3Kernel`）
- `TestL3Kernel.test_rrf_search(self)` （类: `TestL3Kernel`）
- `TestL3Kernel.test_keyword_search(self)` （类: `TestL3Kernel`）
- `TestDfx.test_env_separation(self)` （类: `TestDfx`）
- `TestDfx.test_scripts_executable(self)` （类: `TestDfx`）
- `TestDfx.test_audit_log_queryable(self)` （类: `TestDfx`）
- `TestDfx.test_git_backup(self)` （类: `TestDfx`）
- `TestDfx.test_skill_documentation(self)` （类: `TestDfx`）
- `TestDfx.test_compat_check(self)` （类: `TestDfx`）
- `test_system.test_gbrain_version(self)`
- `test_system.test_brain_structure(self)`
- `test_system.test_mcp_http_server_help(self)`
- `test_system.test_gbrain_list_pages(self)`
- `test_system.test_four_directories(self)`
- `test_system.test_page_structure(self)`
- `test_system.test_rrf_search(self)`
- `test_system.test_keyword_search(self)`
- `test_system.test_env_separation(self)`
- `test_system.test_scripts_executable(self)`
- `test_system.test_audit_log_queryable(self)`
- `test_system.test_git_backup(self)`
- `test_system.test_skill_documentation(self)`
- `test_system.test_compat_check(self)`

### 调用关系

- `test_system._run_cmd` → `subprocess.run` （method_call）
- `test_system.test_gbrain_version` → `_run_cmd` （call）
- `test_system.test_gbrain_version` → `any` （call）
- `test_system.test_gbrain_version` → `c.isdigit` （method_call）
- `test_system.test_brain_structure` → `BRAIN_DIR.exists` （method_call）
- `test_system.test_brain_structure` → `pytest.skip` （method_call）
- `test_system.test_mcp_http_server_help` → `_run_cmd` （call）
- `test_system.test_gbrain_list_pages` → `_run_cmd` （call）
- `test_system.test_four_directories` → `BRAIN_DIR.exists` （method_call）
- `test_system.test_four_directories` → `pytest.skip` （method_call）
- `test_system.test_page_structure` → `_run_cmd` （call）
- `test_system.test_page_structure` → `_run_cmd` （call）
- `test_system.test_page_structure` → `content.strip` （method_call）
- `test_system.test_page_structure` → `pytest.skip` （method_call）
- `test_system.test_page_structure` → `line.split` （method_call）
- `test_system.test_page_structure` → `pytest.skip` （method_call）
- `test_system.test_page_structure` → `pytest.skip` （method_call）
- `test_system.test_rrf_search` → `_run_cmd` （call）
- `test_system.test_keyword_search` → `_run_cmd` （call）
- `test_system.test_env_separation` → `env_example.exists` （method_call）
- `test_system.test_env_separation` → `env_example.read_text` （method_call）
- `test_system.test_scripts_executable` → `path.exists` （method_call）
- `test_system.test_scripts_executable` → `_run_cmd` （call）
- `test_system.test_scripts_executable` → `str` （call）
- `test_system.test_audit_log_queryable` → `tempfile.mkstemp` （method_call）
- `test_system.test_audit_log_queryable` → `os.close` （method_call）
- `test_system.test_audit_log_queryable` → `str` （call）
- `test_system.test_audit_log_queryable` → `AuditLog` （call）
- `test_system.test_audit_log_queryable` → `log.log` （method_call）
- `test_system.test_audit_log_queryable` → `log.query` （method_call）
- `test_system.test_audit_log_queryable` → `log.close` （method_call）
- `test_system.test_audit_log_queryable` → `os.unlink` （method_call）
- `test_system.test_git_backup` → `git_dir.exists` （method_call）
- `test_system.test_git_backup` → `BRAIN_DIR.exists` （method_call）
- `test_system.test_git_backup` → `pytest.skip` （method_call）
- `test_system.test_git_backup` → `_run_cmd` （call）
- `test_system.test_git_backup` → `str` （call）
- `test_system.test_skill_documentation` → `skill_md_dir.exists` （method_call）
- `test_system.test_skill_documentation` → `md_file.exists` （method_call）
- `test_system.test_compat_check` → `_run_cmd` （call）
- `test_system.test_compat_check` → `script.exists` （method_call）
- `test_system.test_compat_check` → `pytest.skip` （method_call）
- `test_system.test_compat_check` → `pytest.skip` （method_call）
- `test_system.test_compat_check` → `str` （call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
