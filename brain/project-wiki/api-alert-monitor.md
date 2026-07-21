---
type: api-contract
module: alert_monitor
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：alert_monitor

## Compiled Truth（当前最佳理解）

本模块包含 5 个接口定义。

### 接口列表

- `alert_monitor.write_alert(level, category, message, detail)`
- `alert_monitor.check_conflicts(conn)`
- `alert_monitor.check_commit_failures(conn)`
- `alert_monitor.check_embed_failures()`
- `alert_monitor.run_alert_monitor()`

### 调用关系

- `alert_monitor.write_alert` → `print` （call）
- `alert_monitor.write_alert` → `open` （call）
- `alert_monitor.write_alert` → `f.write` （method_call）
- `alert_monitor.write_alert` → `datetime.now` （method_call）
- `alert_monitor.write_alert` → `json.dumps` （method_call）
- `alert_monitor.write_alert` → `line.strip` （method_call）
- `alert_monitor.check_conflicts` → `conn.execute` （method_call）
- `alert_monitor.check_conflicts` → `cursor.fetchone` （method_call）
- `alert_monitor.check_conflicts` → `write_alert` （call）
- `alert_monitor.check_commit_failures` → `conn.execute` （method_call）
- `alert_monitor.check_commit_failures` → `cursor.fetchone` （method_call）
- `alert_monitor.check_commit_failures` → `write_alert` （call）
- `alert_monitor.check_commit_failures` → `datetime.now` （method_call）
- `alert_monitor.check_commit_failures` → `timedelta` （call）
- `alert_monitor.check_embed_failures` → `int` （call）
- `alert_monitor.check_embed_failures` → `write_alert` （call）
- `alert_monitor.run_alert_monitor` → `sqlite3.connect` （method_call）
- `alert_monitor.run_alert_monitor` → `check_conflicts` （call）
- `alert_monitor.run_alert_monitor` → `check_commit_failures` （call）
- `alert_monitor.run_alert_monitor` → `check_embed_failures` （call）
- `alert_monitor.run_alert_monitor` → `print` （call）
- `alert_monitor.run_alert_monitor` → `conn.close` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
