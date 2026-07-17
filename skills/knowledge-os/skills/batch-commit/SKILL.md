---
name: batch-commit
description: 批量确认入库主通路：冲突检测 -> 质量门控 -> 写入 Brain -> 刷新图谱
triggers:
  - 批量入库
  - 批量确认
  - batch commit
mutating: true
writes_pages: true
---

# batch-commit

## 目标

批量确认入库：读取全量 pending 草稿，经冲突检测、质量门控后，写入 GBrain Brain 仓库，并刷新 API 依赖图谱。

## 触发条件

- 用户批量确认入库
- AI 平台调用 MCP 批量写入接口

## 输入

- `draftIds`: 可选，指定草稿 ID 列表。不传则处理所有 pending 草稿。

## 处理流程

1. 读取全量 `pending` 草稿
2. 调用 `conflict-detector` 批量对比质量规则库
3. 标记冲突（status = `conflict`，写入 `conflicts` 表）
4. 对无冲突草稿调用 `quality-gate` 质量校验
5. 评分 >= 60 的草稿写入 Brain 仓库对应目录
6. 调用 `api-graph-builder` 增量刷新 API 依赖图谱
7. 清空已入库草稿（status = `merged`）
8. 写入 `audit_log`

## 输出格式

```json
{
  "processedDrafts": 3,
  "committed": ["D-20260715-001", "D-20260715-002"],
  "conflicts": ["C-001"],
  "rejected": ["D-20260715-003"],
  "committedPages": [
    "quality-rules/QR-018.md",
    "defect-experience/DEF-002.md"
  ]
}
```

## 约束

- 冲突检测必须前置
- 质量门控不可跳过
- 仅入库成功后清除草稿
- 写入 Brain 后必须调用 `gbrain import` 和 `gbrain sync`
- 不调用 LLM
