---
type: test-case
case_id: TC-SK-01
status: active
priority: P1
auto_script: `test_skills.py::TestTfidfCodeSlicer`
created: 2026-07-21
updated: 2026-07-21
---

# 测试用例：tfidf-code-slicer 解析代码输出 JSON

## Compiled Truth（当前最佳理解）

**前置条件**: Python 3.10+ 已安装

**测试步骤**:
- 1. 准备示例代码文件
- 2. 调用 `slice_code()`
- 3. 检查输出 JSON

**期望结果**: JSON 包含 interfaces 和 dependencies

**验收标准**: JSON 结构符合设计

**自动化脚本**: ``test_skills.py::TestTfidfCodeSlicer``

## Timeline（历史证据，只追加）

- 2026-07-21: 从 V1.0-测试用例全集导入 Brain 仓库
