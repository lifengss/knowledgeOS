---
name: case-generator
description: MCP 知识查询接口：读取全量存量知识，返回 RRF/关键词搜索结果、知识图谱、Brain 页面
triggers:
  - 生成用例
  - 查询知识库
  - 获取知识上下文
  - generate test cases
mutating: false
writes_pages: false
---

# case-generator

## 目标

作为 MCP 知识查询接口（端口 8100），供 AI 平台在生成测试用例时调用。只读 Brain 仓库，返回全量存量知识。

## 触发条件

- AI 平台需要生成测试用例
- 用户触发生成操作
- MCP 查询接口被调用

## 输入

- `query`: 查询关键词或问题
- `mode`: 检索模式 `keyword` / `graph`（V1.0 不支持 `rrf`，因无 embedding）
- `limit`: 返回结果数量，默认 10
- `filters`: 过滤条件，如 type、category

## 处理流程

1. 根据 `mode` 选择检索方式：
   - `keyword`: 调用 `gbrain search <query>`
   - `graph`: 调用 `gbrain graph-query <slug>` 查询知识图谱
2. 读取相关 Brain 页面详情（`gbrain get <slug>`）
3. 返回知识上下文

## 输出格式

```json
{
  "query": "用户登录",
  "mode": "keyword",
  "results": [
    {
      "id": "TC-001",
      "title": "测试用例：用户登录",
      "type": "test-case",
      "score": 2.1,
      "snippet": "正向用例：使用有效账号密码登录..."
    }
  ],
  "graphResults": [
    {
      "from": "userService.login",
      "to": "authService.validate",
      "type": "advises"
    }
  ],
  "pages": [
    {
      "id": "TC-001",
      "title": "测试用例：用户登录",
      "content": "..."
    }
  ]
}
```

## 权限边界

- Brain 仓库：只读
- SQLite 缓存：可写入 drafts 表（接收 AI 平台生成的草稿）
- 正式知识库：禁止直接写入

## 约束

- 不调用 LLM
- 不直接生成测试用例（只提供知识上下文）
- 用例生成逻辑由 AI 平台 harness 编排
