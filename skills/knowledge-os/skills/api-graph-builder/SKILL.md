---
name: api-graph-builder
description: 根据 tfidf-code-slicer 输出构建/更新 API 依赖图谱
triggers:
  - 更新 API 依赖图谱
  - 构建 API 图谱
  - 代码变更后更新图谱
  - build api graph
mutating: true
writes_pages: true
---

# api-graph-builder

## 目标

根据 `tfidf-code-slicer` 输出的 JSON，在 GBrain 知识图谱中创建/更新 API 实体和调用关系，并更新 `brain/project-wiki/` 下的 API 契约文档。

## 触发条件

1. 业务代码更新后，由 `tfidf-code-slicer` 触发全量重构
2. 知识库变更后，由 Dream Cycle 触发增量更新

## 输入

- `sliceResult`: `tfidf-code-slicer` 输出的 JSON 对象
- `updateType`: `full`（全量）/ `incremental`（增量）

## 处理流程

1. 读取 `sliceResult.interfaces`，为每个 API 创建/更新 GBrain 实体页面
2. 读取 `sliceResult.dependencies`，建立实体间关联
3. 更新 `brain/project-wiki/api-contracts.md` 等 API 契约文档
4. 调用 `gbrain import` 导入变更
5. 调用 `gbrain sync` 同步到数据库

## 实体关系映射

| 实体类型 | GBrain 关系 | 说明 |
|---------|------------|------|
| API 接口 | `works_at` | API 属于模块 |
| 方法调用 | `attended` | 方法调用 API |
| 模块 | `founded` | 模块包含 API |
| 依赖关系 | `advises` | API 依赖另一个 API |

## 输出格式

```json
{
  "updatedInterfaces": 12,
  "updatedDependencies": 8,
  "updatedPages": ["project-wiki/api-contracts.md"],
  "errors": []
}
```

## 约束

- 无人工编辑入口，完全后台数据驱动
- 全量重构时不删除已有关联，仅追加修正
- 增量更新仅修正前置/后置依赖逻辑
- 不调用 LLM

## 调用方式

```javascript
const { buildApiGraph } = require('./skills/knowledge-os/api-graph-builder');
const result = buildApiGraph(sliceResult, 'incremental');
```
