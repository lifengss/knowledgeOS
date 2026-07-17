---
name: quality-gate
description: 入库前强制质量校验，输出评分与通过/拒绝决定
triggers:
  - 质量检查
  - 质量门控
  - 评分草稿
  - quality check
mutating: true
writes_pages: false
---

# quality-gate

## 目标

对通过冲突检测的草稿进行质量校验，输出评分（0-100）和通过/拒绝决定。

## 触发条件

- `batch-commit` 内部调用（冲突检测之后）
- `single-commit` 内部调用（冲突检测之后）
- 用户手动触发"质量检查"

## 输入

- `drafts`: 通过冲突检测的草稿列表

## 处理流程

1. 校验草稿完整性（必填字段：type、title、content、metadata）
2. 校验内容质量：
   - 最小长度：title >= 5 字符，content >= 50 字符
   - 格式规范：必须包含 `## Compiled Truth` 标题
   - 来源可信度：`human_edit` 优先级 > `execution_feedback`
3. 计算质量评分（0-100）
4. 评分 >= 60 允许入库，< 60 标记为 `rejected`
5. 更新草稿 `quality_score`
6. 记录审计日志

## 评分规则

| 维度 | 权重 | 说明 |
|------|------|------|
| 完整性 | 30 | 必填字段是否齐全 |
| 内容长度 | 25 | content 是否足够详细 |
| 格式规范 | 25 | 是否包含 Compiled Truth / Timeline 结构 |
| 来源可信度 | 20 | human_edit 得分高于 execution_feedback |

## 输出格式

```json
{
  "checkedDrafts": 2,
  "passed": [
    {
      "draftId": "D-20260715-001",
      "score": 78,
      "decision": "pass"
    }
  ],
  "rejected": [
    {
      "draftId": "D-20260715-003",
      "score": 45,
      "decision": "reject",
      "reason": "内容过短，缺少 Timeline"
    }
  ]
}
```

## 沉淀优先级规则

- 可用性优先于数量
- 只沉淀人工校验、执行验证过的有效规则
- 杜绝无效海量垃圾知识堆积
- 评分 < 60 的草稿自动标记为"待人工审核"

## 约束

- 质量门控不可跳过
- 拒绝的草稿保留在 `drafts` 表，status 改为 `rejected`
- 质量评分写入 `audit_log`
- 不调用 LLM
