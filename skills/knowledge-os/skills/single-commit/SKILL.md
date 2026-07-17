---
name: single-commit
description: 单条确认入库兜底通路：冲突检测 -> 质量门控 -> 写入 Brain -> 刷新图谱
triggers:
  - 单条入库
  - 单条确认
  - single commit
mutating: true
writes_pages: true
---

# single-commit

## 目标

单条确认入库：读取单条 pending 草稿，经冲突检测、质量门控后，写入 GBrain Brain 仓库，并刷新 API 依赖图谱。

## 触发条件

- 用户单条确认入库
- AI 平台调用 MCP 单条写入接口
- 冲突处理后重新入库

## 输入

- `draftId`: 草稿 ID

## 处理流程

1. 读取单条 `pending` 草稿
2. 调用 `conflict-detector` 单条对比
3. 有冲突则标记并返回
4. 无冲突则调用 `quality-gate` 质量校验
5. 评分 >= 60 则写入 Brain 仓库对应目录
6. 调用 `api-graph-builder` 增量刷新 API 依赖图谱
7. 清除对应草稿（status = `merged`）
8. 写入 `audit_log`

## 输出格式

```json
{
  "draftId": "D-20260715-001",
  "success": true,
  "committedPage": "quality-rules/QR-018.md",
  "conflictId": null,
  "score": 78
}
```

## 约束

- 冲突检测必须前置
- 质量门控不可跳过
- 仅入库成功后清除草稿
- 不调用 LLM
