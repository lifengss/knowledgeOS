---
type: api-contract
module: init_cache
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：init_cache

## Compiled Truth（当前最佳理解）

本模块包含 1 个接口定义。

### 接口列表

- `init_cache.init_cache()`

### 调用关系

- `init_cache.init_cache` → `print` （call）
- `init_cache.init_cache` → `DraftCache` （call）
- `init_cache.init_cache` → `ConflictQueue` （call）
- `init_cache.init_cache` → `AuditLog` （call）
- `init_cache.init_cache` → `sqlite3.connect` （method_call）
- `init_cache.init_cache` → `conn.execute` （method_call）
- `init_cache.init_cache` → `conn.close` （method_call）
- `init_cache.init_cache` → `set` （call）
- `init_cache.init_cache` → `print` （call）
- `init_cache.init_cache` → `sqlite3.connect` （method_call）
- `init_cache.init_cache` → `conn.execute` （method_call）
- `init_cache.init_cache` → `conn.close` （method_call）
- `init_cache.init_cache` → `print` （call）
- `init_cache.init_cache` → `print` （call）
- `init_cache.init_cache` → `draft_cache.close` （method_call）
- `init_cache.init_cache` → `conflict_queue.close` （method_call）
- `init_cache.init_cache` → `audit_log.close` （method_call）
- `init_cache.init_cache` → `print` （call）
- `init_cache.init_cache` → `sys.exit` （method_call）
- `init_cache.init_cache` → `cursor.fetchall` （method_call）
- `init_cache.init_cache` → `cursor.fetchall` （method_call）
- `init_cache.init_cache` → `sorted` （call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
