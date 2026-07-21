---
type: test-case
case_id: TC-SK-08
status: active
priority: P1
auto_script: `test_skills.py::TestCommitIntegration::test_quality_gate_prerequisite`
created: 2026-07-21
updated: 2026-07-21
---

# 测试用例：quality-gate 强制前置调用

## Compiled Truth（当前最佳理解）

**前置条件**: 存在待入库草稿

**测试步骤**:
- 1. 调用 batch-commit 或 single-commit
- 2. 检查是否先调用 quality-gate

**期望结果**: 所有入库动作前置调用 quality-gate

**验收标准**: 未调用质量门控则入库失败

**自动化脚本**: ``test_skills.py::TestCommitIntegration::test_quality_gate_prerequisite``

## Timeline（历史证据，只追加）

- 2026-07-21: 从 V1.0-测试用例全集导入 Brain 仓库
