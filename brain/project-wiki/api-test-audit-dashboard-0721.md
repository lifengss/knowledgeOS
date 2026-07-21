---
type: api-contract
module: test_audit_dashboard_0721
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：test_audit_dashboard_0721

## Compiled Truth（当前最佳理解）

本模块包含 22 个接口定义。

### 接口列表

- `TestAuditLogQuery.setUp(self)` （类: `TestAuditLogQuery`）
- `TestAuditLogQuery.tearDown(self)` （类: `TestAuditLogQuery`）
- `TestAuditLogQuery._seed_logs(self)` （类: `TestAuditLogQuery`）
- `TestAuditLogQuery.test_pagination(self)` （类: `TestAuditLogQuery`）
- `TestAuditLogQuery.test_filter_by_action(self)` （类: `TestAuditLogQuery`）
- `TestAuditLogQuery.test_filter_by_operator(self)` （类: `TestAuditLogQuery`）
- `TestAuditLogQuery.test_filter_by_target(self)` （类: `TestAuditLogQuery`）
- `TestDashboardStats.setUp(self)` （类: `TestDashboardStats`）
- `TestDashboardStats.tearDown(self)` （类: `TestDashboardStats`）
- `TestDashboardStats.test_dashboard_stats(self)` （类: `TestDashboardStats`）
- `TestAuditApiResponseStructure.test_required_fields(self)` （类: `TestAuditApiResponseStructure`）
- `test_audit_dashboard_0721.setUp(self)`
- `test_audit_dashboard_0721.tearDown(self)`
- `test_audit_dashboard_0721._seed_logs(self)`
- `test_audit_dashboard_0721.test_pagination(self)`
- `test_audit_dashboard_0721.test_filter_by_action(self)`
- `test_audit_dashboard_0721.test_filter_by_operator(self)`
- `test_audit_dashboard_0721.test_filter_by_target(self)`
- `test_audit_dashboard_0721.setUp(self)`
- `test_audit_dashboard_0721.tearDown(self)`
- `test_audit_dashboard_0721.test_dashboard_stats(self)`
- `test_audit_dashboard_0721.test_required_fields(self)`

### 调用关系

- `test_audit_dashboard_0721.setUp` → `AuditLog` （call）
- `test_audit_dashboard_0721.setUp` → `DraftCache` （call）
- `test_audit_dashboard_0721.setUp` → `os.remove` （method_call）
- `test_audit_dashboard_0721.tearDown` → `os.remove` （method_call）
- `test_audit_dashboard_0721._seed_logs` → `range` （call）
- `test_audit_dashboard_0721._seed_logs` → `range` （call）
- `test_audit_dashboard_0721.test_pagination` → `self._seed_logs` （method_call）
- `test_audit_dashboard_0721.test_pagination` → `self.assertEqual` （method_call）
- `test_audit_dashboard_0721.test_pagination` → `self.assertEqual` （method_call）
- `test_audit_dashboard_0721.test_pagination` → `self.assertEqual` （method_call）
- `test_audit_dashboard_0721.test_pagination` → `self.assertEqual` （method_call）
- `test_audit_dashboard_0721.test_pagination` → `len` （call）
- `test_audit_dashboard_0721.test_filter_by_action` → `self._seed_logs` （method_call）
- `test_audit_dashboard_0721.test_filter_by_action` → `self.assertEqual` （method_call）
- `test_audit_dashboard_0721.test_filter_by_action` → `self.assertEqual` （method_call）
- `test_audit_dashboard_0721.test_filter_by_operator` → `self._seed_logs` （method_call）
- `test_audit_dashboard_0721.test_filter_by_operator` → `self.assertEqual` （method_call）
- `test_audit_dashboard_0721.test_filter_by_target` → `self._seed_logs` （method_call）
- `test_audit_dashboard_0721.test_filter_by_target` → `self.assertEqual` （method_call）
- `test_audit_dashboard_0721.setUp` → `AuditLog` （call）
- `test_audit_dashboard_0721.setUp` → `DraftCache` （call）
- `test_audit_dashboard_0721.setUp` → `ConflictQueue` （call）
- `test_audit_dashboard_0721.setUp` → `os.remove` （method_call）
- `test_audit_dashboard_0721.tearDown` → `os.remove` （method_call）
- `test_audit_dashboard_0721.test_dashboard_stats` → `self.assertEqual` （method_call）
- `test_audit_dashboard_0721.test_dashboard_stats` → `self.assertEqual` （method_call）
- `test_audit_dashboard_0721.test_dashboard_stats` → `self.assertEqual` （method_call）
- `test_audit_dashboard_0721.test_dashboard_stats` → `self.assertEqual` （method_call）
- `test_audit_dashboard_0721.test_required_fields` → `AuditLog` （call）
- `test_audit_dashboard_0721.test_required_fields` → `audit.log` （method_call）
- `test_audit_dashboard_0721.test_required_fields` → `audit.query` （method_call）
- `test_audit_dashboard_0721.test_required_fields` → `audit.close` （method_call）
- `test_audit_dashboard_0721.test_required_fields` → `self.assertEqual` （method_call）
- `test_audit_dashboard_0721.test_required_fields` → `self.assertIn` （method_call）
- `test_audit_dashboard_0721.test_required_fields` → `self.assertIn` （method_call）
- `test_audit_dashboard_0721.test_required_fields` → `self.assertIn` （method_call）
- `test_audit_dashboard_0721.test_required_fields` → `self.assertIn` （method_call）
- `test_audit_dashboard_0721.test_required_fields` → `self.assertIn` （method_call）
- `test_audit_dashboard_0721.test_required_fields` → `self.assertIn` （method_call）
- `test_audit_dashboard_0721.test_required_fields` → `os.remove` （method_call）
- `test_audit_dashboard_0721.test_required_fields` → `os.remove` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
