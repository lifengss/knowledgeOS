---
type: test-case
case_id: TC-SK-02
status: active
priority: P1
auto_script: `test_skills.py::TestApiGraphBuilder`
created: 2026-07-21
updated: 2026-07-21
---

# 测试用例：api-graph-builder 更新 API 实体页面

## Compiled Truth（当前最佳理解）

**前置条件**: tfidf-code-slicer 已输出 JSON

**测试步骤**:
- 1. 调用 `build_api_graph()`
- 2. 检查 project-wiki 目录
- 3. 检查知识图谱

**期望结果**: 为每个 API 创建或更新实体页面，建立关系

**验收标准**: project-wiki 新增 API 页面

**自动化脚本**: ``test_skills.py::TestApiGraphBuilder``

## Timeline（历史证据，只追加）

- 2026-07-21: 从 V1.0-测试用例全集导入 Brain 仓库
