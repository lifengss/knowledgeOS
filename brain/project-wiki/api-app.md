---
type: api-contract
module: app
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：app

## Compiled Truth（当前最佳理解）

本模块包含 27 个接口定义。

### 接口列表

- `app.apiGet(endpoint)`
- `app.apiPost(endpoint, body)`
- `app.apiPut(endpoint, body)`
- `app.typeLabel(type)`
- `app.actionLabel(action)`
- `app.conflictTypeLabel(type)`
- `app.errorBox(msg)`
- `app.successBox(msg)`
- `app.showResultModal(title, htmlBody)`
- `app.renderPage(page)`
- `app.commitDraft(id)`
- `app.discardDraft(id)`
- `app.batchCommit()`
- `app.detectConflicts()`
- `app.runQualityGate()`
- `app.resolveConflict(id, resolution)`
- `app.showConflictDetail(id)`
- `app.showDraftDetail(id)`
- `app.showPageDetail(category, id)`
- `app.escapeHtml(text)`
- `app.searchBrain()`
- `app.filterBrain(category)`
- `app.changeAuditPage(page)`
- `app.filterAudit()`
- `app.resetAuditFilter()`
- `app.runVerify()`
- `app.route()`

### 调用关系

- 无外部调用关系

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
