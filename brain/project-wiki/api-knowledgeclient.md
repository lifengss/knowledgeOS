---
type: api-contract
module: KnowledgeClient
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：KnowledgeClient

## Compiled Truth（当前最佳理解）

本模块包含 22 个接口定义。

### 接口列表

- `KnowledgeClient.KnowledgeClient(baseUrl)`
- `KnowledgeClient.OkHttpClient()`
- `KnowledgeClient.Gson()`
- `KnowledgeClient.postJson(path, json)`
- `KnowledgeClient.IOException(response)`
- `KnowledgeClient.get(path)`
- `KnowledgeClient.IOException(response)`
- `KnowledgeClient.uploadSource(filePath, type, note)`
- `KnowledgeClient.File(filePath)`
- `KnowledgeClient.confirmDraft(draftId, action)`
- `KnowledgeClient.listPages()`
- `KnowledgeClient.getPage(pageId)`
- `KnowledgeClient.batchReadPages(pageIds)`
- `KnowledgeClient.batchWritePages(List<Map<String, pages)`
- `KnowledgeClient.search(query, mode, limit)`
- `KnowledgeClient.listDrafts()`
- `KnowledgeClient.listConflicts()`
- `KnowledgeClient.resolveConflict(conflictId, resolution)`
- `KnowledgeClient.listAuditLogs()`
- `KnowledgeClient.getDashboardStats()`
- `KnowledgeClient.verifySearch(question)`
- `KnowledgeClient.registerWebhook(url, events)`

### 调用关系

- 无外部调用关系

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
