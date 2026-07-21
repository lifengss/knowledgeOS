---
type: test-case
case_id: TC-SK-04
status: active
priority: P1
auto_script: `test_skills.py::TestCaseValidator`
created: 2026-07-21
updated: 2026-07-21
---

# 测试用例：case-validator MCP 知识校验

## Compiled Truth（当前最佳理解）

**前置条件**: 存在质量规则

**测试步骤**:
- 1. 调用 `run_validator(action, payload)`
- 2. 检查返回结果

**期望结果**: 返回质量规则、API 图谱、校验建议

**验收标准**: 返回结果可用于用例校验

**自动化脚本**: ``test_skills.py::TestCaseValidator``

## Timeline（历史证据，只追加）

- 2026-07-21: 从 V1.0-测试用例全集导入 Brain 仓库
