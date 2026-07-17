---
name: script-check-skill
description: 检查智能体创建的脚本文件与 V1.0 技术方案和 API 接口文档的一致性
triggers:
  - 检查这个脚本是否符合接口文档
  - 验证函数名是否与 API 文档一致
  - 检查新增的 API 是否需要更新文档
  - script check
  - 代码一致性检查
  - 接口一致性校验
mutating: false
writes_pages: false
---

# script-check-skill

## 目标

当智能体创建或修改 `test-knowledge-system/` 下的脚本、API、模块、Skill 文件时，自动检查其中的函数名、类名、API 接口名、参数设置是否与以下两份文档一致：

1. `知识管理系统-V1.0架构设计与技术方案.md`（总体架构与模块设计）
2. `test-knowledge-system/docs/API-INTERFACE-DOC.md`（接口文档）

如果发现新增但未在文档中记录的函数、类、API 端点，应标记出来，并提示需要同步更新上述文档。

## 触发条件

以下任一情况触发本 skill：

- 用户要求检查某个脚本/文件
- 用户创建新的 `.js` / `.ts` / `.md` Skill 文件
- 用户修改 `api/`、`cache/`、`scripts/`、`skills/` 目录下的文件
- 用户询问"这个实现是否符合文档"

## 输入

- 待检查的文件路径或文件内容
- （可选）需要比对的文档路径，默认：
  - `d:/self_coding/knowledgeOS/知识管理系统-V1.0架构设计与技术方案.md`
  - `d:/self_coding/knowledgeOS/test-knowledge-system/docs/API-INTERFACE-DOC.md`

## 检查规则

### 1. 函数名一致性

从 `API-INTERFACE-DOC.md` 中提取所有函数签名，例如：

- `DraftCache.addDraft(draft)`
- `ConflictQueue.resolveConflict(id, resolution, operator)`
- `AuditLog.log(action, operator, target, detail)`
- `detectConflicts(drafts, rules)`
- `checkQuality(draft)`
- `batchCommit(draftIds)`
- `singleCommit(draftId)`
- `sliceCode(codePath)`
- `buildApiGraph(sliceResult)`

检查目标文件中实现的函数名是否与文档一致。允许文档中未列出但属于私有辅助函数（以 `_` 开头）。

### 2. 类名一致性

检查以下类名是否一致：

- `DraftCache`
- `ConflictQueue`
- `AuditLog`

### 3. API 端点一致性

从 `API-INTERFACE-DOC.md` 和 `api/openapi.yaml` 中提取 REST API 端点，例如：

- `POST /api/source-upload`
- `POST /api/confirm`
- `GET /api/brain`
- `GET /api/brain/{pageId}`
- `POST /api/brain/batch-read`
- `POST /api/brain/batch-write`
- `POST /api/search`
- `GET /api/drafts`
- `GET /api/conflicts`
- `POST /api/conflicts/{conflictId}/resolve`
- `GET /api/audit`
- `GET /api/dashboard`
- `POST /api/verify-search`
- `POST /api/webhook/register`
- `POST /api/webhook/callback`

检查目标文件中是否出现未在文档中定义的端点。

### 4. 参数一致性

检查函数/接口的参数名称、类型、必填性是否与文档一致。

### 5. 新增符号检测

如果目标文件中包含未在文档中定义的函数、类、API 端点，标记为 `NEW_SYMBOL`，并建议：

- 如果是 V1.0 需要的功能：更新 `API-INTERFACE-DOC.md` 第 4 节"内部模块接口"
- 如果是架构层面的变化：更新 `知识管理系统-V1.0架构设计与技术方案.md`

## 输出格式

返回 JSON 格式的一致性报告：

```json
{
  "consistent": false,
  "summary": "发现 1 个不一致项，2 个新增符号",
  "issues": [
    {
      "type": "FUNCTION_NAME_MISMATCH",
      "severity": "error",
      "location": "cache/draft-cache.js:45",
      "message": "文档中定义 addDraft(draft)，实际实现为 createDraft(draft)",
      "docRef": "API-INTERFACE-DOC.md#4.2-DraftCache"
    },
    {
      "type": "NEW_SYMBOL",
      "severity": "warning",
      "location": "api/routes/search.js:12",
      "message": "新增 API 端点 POST /api/advanced-search 未在文档中定义",
      "suggestedAction": "更新 API-INTERFACE-DOC.md 第 2.5 节全量检索，或确认该端点是否属于 V1.0 范围"
    }
  ],
  "docUpdateSuggestions": [
    {
      "doc": "API-INTERFACE-DOC.md",
      "sections": ["2.5 全量检索", "4.2 缓冲层模块"]
    }
  ]
}
```

## 执行步骤

1. 读取目标文件内容
2. 读取 `API-INTERFACE-DOC.md` 和 `知识管理系统-V1.0架构设计与技术方案.md`
3. 使用正则表达式提取目标文件中的函数、类、API 端点
4. 与文档中提取的符号表进行比对
5. 生成一致性报告
6. 如果有新增符号，提示用户是否需要更新文档

## 注意事项

- 本 skill 是开发辅助工具，不直接修改业务代码
- 本 skill 不自动修改文档，只生成报告和建议
- 私有方法（以 `_` 开头）和工具函数不在检查范围内
- V1.0 之后的版本演进产生的新符号，应更新对应版本的文档
