---
type: test-case
case_id: TC-SK-07
status: active
priority: P1
auto_script: `test_skills.py::TestSingleCommit`
created: 2026-07-21
updated: 2026-07-21
---

# 测试用例：single-commit 单条入库

## Compiled Truth（当前最佳理解）

**前置条件**: 存在单条 pending 草稿

**测试步骤**:
- 1. 调用 `single_commit(draft_id)`
- 2. 检查 Brain 仓库
- 3. 检查 drafts 表

**期望结果**: 单条草稿写入 Brain 仓库，对应草稿状态更新

**验收标准**: 单条草稿状态变为 merged

**自动化脚本**: ``test_skills.py::TestSingleCommit``

## Timeline（历史证据，只追加）

- 2026-07-21: 从 V1.0-测试用例全集导入 Brain 仓库
