---
name: case-validator
description: MCP 知识校验接口：读取质量规则、API 图谱、待入库草稿，支持冲突检测与入库
triggers:
  - 校验用例
  - 知识校验
  - 入库校验
  - validate test cases
mutating: true
writes_pages: true
---

# case-validator

## 目标

作为 MCP 知识写入接口（端口 8101），供 AI 平台在校验用例、执行入库时调用。可读 Brain 仓库、SQLite 缓存，可写入正式知识库。

## 触发条件

- AI 平台需要校验用例合规性
- AI 平台需要写入草稿/正式库
- 用户确认入库操作

## 输入

- `operation`: 操作类型
  - `validate`: 校验用例（返回质量规则 + API 图谱）
  - `commit`: 执行入库（单条/批量）
  - `detect-conflicts`: 冲突检测
- `payload`: 操作参数

## 处理流程

### validate 操作

1. 读取质量规则库（`brain/quality-rules/`）
2. 读取 API 依赖图谱（`brain/project-wiki/` + `gbrain graph-query`）
3. 读取历史用例库（`brain/test-cases/`）
4. 返回校验所需知识上下文

### commit 操作

1. 读取 drafts 表待入库草稿
2. 调用 `conflict-detector` 冲突检测
3. 调用 `quality-gate` 质量校验
4. 通过 `batch-commit` 或 `single-commit` 写入 Brain 仓库
5. 调用 `api-graph-builder` 增量刷新图谱
6. 写入 `audit_log`

### detect-conflicts 操作

1. 读取待检测草稿
2. 调用 `conflict-detector`
3. 返回冲突列表

## 输出格式

### validate

```json
{
  "qualityRules": [...],
  "apiGraph": [...],
  "testCases": [...]
}
```

### commit

```json
{
  "success": true,
  "committed": ["D-20260715-001"],
  "committedPages": ["quality-rules/QR-018.md"]
}
```

## 权限边界

- Brain 仓库：只读（校验时参考）
- SQLite 缓存：读写（drafts + conflicts + audit_log）
- 正式知识库：可写入（通过 batch-commit / single-commit）

## 约束

- 不调用 LLM
- 校验逻辑由 AI 平台 harness 编排
- 本接口只提供知识与写入能力
