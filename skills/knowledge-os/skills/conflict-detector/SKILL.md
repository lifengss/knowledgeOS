---
name: conflict-detector
description: 入库前强制冲突检测，识别重复/矛盾/重叠规则
triggers:
  - 检测冲突
  - 检查规则冲突
  - 入库前冲突检测
  - detect conflicts
mutating: true
writes_pages: false
---

# conflict-detector

## 目标

在草稿入库前，对比待入库草稿与已有质量规则库，识别冲突并写入 `conflicts` 表。

## 触发条件

- `batch-commit` 内部调用
- `single-commit` 内部调用
- 用户手动触发"检测冲突"

## 输入

- `drafts`: 待检测草稿列表（从 `drafts` 表读取）
- `rules`: 已有质量规则库快照（从 `brain/quality-rules/` 读取）

## 处理流程

1. 对每条草稿，提取规则关键词与适用范围
2. 在质量规则库中检索相似规则（关键词匹配 + 标题相似度）
3. 判断冲突类型：
   - `duplicate`: 内容高度相似（标题/关键词重叠 > 80%）
   - `contradiction`: 内容相互矛盾（关键词相反或结论冲突）
   - `overlap`: 适用范围重叠
4. 标记冲突并写入 `conflicts` 表
5. 更新对应草稿状态为 `conflict`
6. 记录审计日志

## 输出格式

```json
{
  "checkedDrafts": 3,
  "conflicts": [
    {
      "id": "C-001",
      "draftId": "D-20260715-001",
      "conflictType": "overlap",
      "existingRule": "QR-008 密码长度不得小于 8 位",
      "newRule": "新增密码复杂度校验规则"
    }
  ],
  "passedDrafts": ["D-20260715-002"]
}
```

## 冲突处理方式

- `merge`: 合并新旧规则，保留两者精华
- `overwrite`: 新规则覆盖旧规则
- `discard`: 丢弃新规则

## 约束

- 所有入库动作必须前置冲突检测
- 冲突未处理的草稿不得入库
- 冲突检测结果写入 `audit_log`
- 不调用 LLM，使用规则引擎
