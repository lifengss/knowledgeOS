---
type: api-contract
module: test_api_integration_0720
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：test_api_integration_0720

## Compiled Truth（当前最佳理解）

本模块包含 34 个接口定义。

### 接口列表

- `TestCallPythonJsonParse.test_multiline_json_parsing(self)` （类: `TestCallPythonJsonParse`）
- `TestSingleCommitApprovedStatus.setUp(self)` （类: `TestSingleCommitApprovedStatus`）
- `TestSingleCommitApprovedStatus.tearDown(self)` （类: `TestSingleCommitApprovedStatus`）
- `TestSingleCommitApprovedStatus.test_approved_draft_can_commit(self)` （类: `TestSingleCommitApprovedStatus`）
- `TestSingleCommitApprovedStatus.test_pending_draft_still_works(self)` （类: `TestSingleCommitApprovedStatus`）
- `TestSingleCommitApprovedStatus.test_rejected_draft_cannot_commit(self)` （类: `TestSingleCommitApprovedStatus`）
- `TestBatchCommitSkipQualityGate.setUp(self)` （类: `TestBatchCommitSkipQualityGate`）
- `TestBatchCommitSkipQualityGate.tearDown(self)` （类: `TestBatchCommitSkipQualityGate`）
- `TestBatchCommitSkipQualityGate.test_approved_drafts_skip_repeated_qg(self)` （类: `TestBatchCommitSkipQualityGate`）
- `TestBatchCommitSkipQualityGate.test_mixed_pending_and_approved(self)` （类: `TestBatchCommitSkipQualityGate`）
- `TestResolveConflictReturnFormat.setUp(self)` （类: `TestResolveConflictReturnFormat`）
- `TestResolveConflictReturnFormat.tearDown(self)` （类: `TestResolveConflictReturnFormat`）
- `TestResolveConflictReturnFormat.test_resolve_returns_full_conflict(self)` （类: `TestResolveConflictReturnFormat`）
- `TestResolveConflictReturnFormat.test_resolve_nonexistent_conflict(self)` （类: `TestResolveConflictReturnFormat`）
- `TestDraftDetailModalDataLink.setUp(self)` （类: `TestDraftDetailModalDataLink`）
- `TestDraftDetailModalDataLink.tearDown(self)` （类: `TestDraftDetailModalDataLink`）
- `TestDraftDetailModalDataLink.test_draft_detail_api_returns_full_content(self)` （类: `TestDraftDetailModalDataLink`）
- `test_api_integration_0720.test_multiline_json_parsing(self)`
- `test_api_integration_0720.setUp(self)`
- `test_api_integration_0720.tearDown(self)`
- `test_api_integration_0720.test_approved_draft_can_commit(self)`
- `test_api_integration_0720.test_pending_draft_still_works(self)`
- `test_api_integration_0720.test_rejected_draft_cannot_commit(self)`
- `test_api_integration_0720.setUp(self)`
- `test_api_integration_0720.tearDown(self)`
- `test_api_integration_0720.test_approved_drafts_skip_repeated_qg(self)`
- `test_api_integration_0720.test_mixed_pending_and_approved(self)`
- `test_api_integration_0720.setUp(self)`
- `test_api_integration_0720.tearDown(self)`
- `test_api_integration_0720.test_resolve_returns_full_conflict(self)`
- `test_api_integration_0720.test_resolve_nonexistent_conflict(self)`
- `test_api_integration_0720.setUp(self)`
- `test_api_integration_0720.tearDown(self)`
- `test_api_integration_0720.test_draft_detail_api_returns_full_content(self)`

### 调用关系

- `test_api_integration_0720.test_multiline_json_parsing` → `json.dumps` （method_call）
- `test_api_integration_0720.test_multiline_json_parsing` → `json.loads` （method_call）
- `test_api_integration_0720.test_multiline_json_parsing` → `self.assertEqual` （method_call）
- `test_api_integration_0720.test_multiline_json_parsing` → `self.assertEqual` （method_call）
- `test_api_integration_0720.test_multiline_json_parsing` → `len` （call）
- `test_api_integration_0720.setUp` → `DraftCache` （call）
- `test_api_integration_0720.setUp` → `AuditLog` （call）
- `test_api_integration_0720.setUp` → `os.remove` （method_call）
- `test_api_integration_0720.tearDown` → `os.remove` （method_call）
- `test_api_integration_0720.test_approved_draft_can_commit` → `single_commit` （call）
- `test_api_integration_0720.test_approved_draft_can_commit` → `self.assertTrue` （method_call）
- `test_api_integration_0720.test_approved_draft_can_commit` → `self.assertIsNotNone` （method_call）
- `test_api_integration_0720.test_approved_draft_can_commit` → `self.assertEqual` （method_call）
- `test_api_integration_0720.test_approved_draft_can_commit` → `result.get` （method_call）
- `test_api_integration_0720.test_pending_draft_still_works` → `single_commit` （call）
- `test_api_integration_0720.test_pending_draft_still_works` → `self.assertTrue` （method_call）
- `test_api_integration_0720.test_pending_draft_still_works` → `result.get` （method_call）
- `test_api_integration_0720.test_rejected_draft_cannot_commit` → `single_commit` （call）
- `test_api_integration_0720.test_rejected_draft_cannot_commit` → `self.assertFalse` （method_call）
- `test_api_integration_0720.test_rejected_draft_cannot_commit` → `self.assertIn` （method_call）
- `test_api_integration_0720.test_rejected_draft_cannot_commit` → `result.get` （method_call）
- `test_api_integration_0720.setUp` → `DraftCache` （call）
- `test_api_integration_0720.setUp` → `os.remove` （method_call）
- `test_api_integration_0720.tearDown` → `os.remove` （method_call）
- `test_api_integration_0720.test_approved_drafts_skip_repeated_qg` → `batch_commit` （call）
- `test_api_integration_0720.test_approved_drafts_skip_repeated_qg` → `self.assertIn` （method_call）
- `test_api_integration_0720.test_approved_drafts_skip_repeated_qg` → `self.assertGreater` （method_call）
- `test_api_integration_0720.test_approved_drafts_skip_repeated_qg` → `len` （call）
- `test_api_integration_0720.test_mixed_pending_and_approved` → `batch_commit` （call）
- `test_api_integration_0720.test_mixed_pending_and_approved` → `self.assertIn` （method_call）
- `test_api_integration_0720.test_mixed_pending_and_approved` → `self.assertIn` （method_call）
- `test_api_integration_0720.setUp` → `ConflictQueue` （call）
- `test_api_integration_0720.setUp` → `DraftCache` （call）
- `test_api_integration_0720.setUp` → `os.remove` （method_call）
- `test_api_integration_0720.tearDown` → `os.remove` （method_call）
- `test_api_integration_0720.test_resolve_returns_full_conflict` → `self.assertTrue` （method_call）
- `test_api_integration_0720.test_resolve_returns_full_conflict` → `self.assertEqual` （method_call）
- `test_api_integration_0720.test_resolve_returns_full_conflict` → `self.assertEqual` （method_call）
- `test_api_integration_0720.test_resolve_returns_full_conflict` → `self.assertIsNotNone` （method_call）
- `test_api_integration_0720.test_resolve_nonexistent_conflict` → `self.assertFalse` （method_call）
- `test_api_integration_0720.setUp` → `DraftCache` （call）
- `test_api_integration_0720.setUp` → `os.remove` （method_call）
- `test_api_integration_0720.tearDown` → `os.remove` （method_call）
- `test_api_integration_0720.test_draft_detail_api_returns_full_content` → `self.assertIsNotNone` （method_call）
- `test_api_integration_0720.test_draft_detail_api_returns_full_content` → `self.assertEqual` （method_call）
- `test_api_integration_0720.test_draft_detail_api_returns_full_content` → `self.assertIn` （method_call）
- `test_api_integration_0720.test_draft_detail_api_returns_full_content` → `self.assertEqual` （method_call）
- `test_api_integration_0720.test_draft_detail_api_returns_full_content` → `self.assertEqual` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
