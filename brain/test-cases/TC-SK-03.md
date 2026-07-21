---
type: test-case
case_id: TC-SK-03
status: active
priority: P1
auto_script: `test_skills.py::TestCaseGenerator`
created: 2026-07-21
updated: 2026-07-21
---

# 测试用例：case-generator MCP 知识查询

## Compiled Truth（当前最佳理解）

**前置条件**: Brain 有数据

**测试步骤**:
- 1. 调用 `generate_cases(query)`
- 2. 检查返回结果

**期望结果**: 返回 RRF 搜索结果、知识图谱数据、Brain 页面内容

**验收标准**: 返回结果包含质量规则、API 图谱、历史用例、项目 Wiki

**自动化脚本**: ``test_skills.py::TestCaseGenerator``

## Timeline（历史证据，只追加）

- 2026-07-21: 从 V1.0-测试用例全集导入 Brain 仓库
