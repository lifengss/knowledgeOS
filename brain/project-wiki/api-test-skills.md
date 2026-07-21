---
type: api-contract
module: test_skills
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：test_skills

## Compiled Truth（当前最佳理解）

本模块包含 36 个接口定义。

### 接口列表

- `test_skills.temp_db()`
- `test_skills.sample_code_file()`
- `TestTfidfCodeSlicer.test_slice_code_output_structure(self, sample_code_file)` （类: `TestTfidfCodeSlicer`）
- `TestTfidfCodeSlicer.test_slice_code_extracts_classes_and_methods(self, sample_code_file)` （类: `TestTfidfCodeSlicer`）
- `TestTfidfCodeSlicer.test_slice_code_empty_for_non_python(self)` （类: `TestTfidfCodeSlicer`）
- `TestConflictDetector.test_duplicate_detection(self, temp_db)` （类: `TestConflictDetector`）
- `TestConflictDetector.test_overlap_detection(self, temp_db)` （类: `TestConflictDetector`）
- `TestQualityGate.test_pass_scenario(self, temp_db)` （类: `TestQualityGate`）
- `TestQualityGate.test_reject_scenario(self, temp_db)` （类: `TestQualityGate`）
- `TestBatchCommit.test_batch_commit_with_pending_drafts(self, temp_db)` （类: `TestBatchCommit`）
- `TestSingleCommit.test_single_commit_approved_draft(self, temp_db)` （类: `TestSingleCommit`）
- `TestSingleCommit.test_single_commit_rejects_non_approved(self, temp_db)` （类: `TestSingleCommit`）
- `TestCaseGenerator.test_generate_cases_keyword_mode(self)` （类: `TestCaseGenerator`）
- `TestCaseGenerator.test_generate_cases_empty_query(self)` （类: `TestCaseGenerator`）
- `TestCaseValidator.test_validate_action(self)` （类: `TestCaseValidator`）
- `TestCaseValidator.test_unknown_action(self)` （类: `TestCaseValidator`）
- `TestCommitIntegration.test_conflict_detector_prerequisite(self, temp_db)` （类: `TestCommitIntegration`）
- `TestCommitIntegration.test_quality_gate_prerequisite(self, temp_db)` （类: `TestCommitIntegration`）
- `TestApiGraphBuilder.test_build_api_graph_structure(self, sample_code_file)` （类: `TestApiGraphBuilder`）
- `test_skills.test_slice_code_output_structure(self, sample_code_file)`
- `test_skills.test_slice_code_extracts_classes_and_methods(self, sample_code_file)`
- `test_skills.test_slice_code_empty_for_non_python(self)`
- `test_skills.test_duplicate_detection(self, temp_db)`
- `test_skills.test_overlap_detection(self, temp_db)`
- `test_skills.test_pass_scenario(self, temp_db)`
- `test_skills.test_reject_scenario(self, temp_db)`
- `test_skills.test_batch_commit_with_pending_drafts(self, temp_db)`
- `test_skills.test_single_commit_approved_draft(self, temp_db)`
- `test_skills.test_single_commit_rejects_non_approved(self, temp_db)`
- `test_skills.test_generate_cases_keyword_mode(self)`
- `test_skills.test_generate_cases_empty_query(self)`
- `test_skills.test_validate_action(self)`
- `test_skills.test_unknown_action(self)`
- `test_skills.test_conflict_detector_prerequisite(self, temp_db)`
- `test_skills.test_quality_gate_prerequisite(self, temp_db)`
- `test_skills.test_build_api_graph_structure(self, sample_code_file)`

### 调用关系

- `test_skills.temp_db` → `tempfile.mkstemp` （method_call）
- `test_skills.temp_db` → `os.close` （method_call）
- `test_skills.temp_db` → `os.unlink` （method_call）
- `test_skills.sample_code_file` → `tempfile.mkstemp` （method_call）
- `test_skills.sample_code_file` → `os.close` （method_call）
- `test_skills.sample_code_file` → `os.unlink` （method_call）
- `test_skills.sample_code_file` → `Path` （call）
- `test_skills.test_slice_code_output_structure` → `slice_code` （call）
- `test_skills.test_slice_code_output_structure` → `isinstance` （call）
- `test_skills.test_slice_code_output_structure` → `isinstance` （call）
- `test_skills.test_slice_code_output_structure` → `str` （call）
- `test_skills.test_slice_code_extracts_classes_and_methods` → `slice_code` （call）
- `test_skills.test_slice_code_extracts_classes_and_methods` → `str` （call）
- `test_skills.test_slice_code_extracts_classes_and_methods` → `len` （call）
- `test_skills.test_slice_code_extracts_classes_and_methods` → `len` （call）
- `test_skills.test_slice_code_empty_for_non_python` → `tempfile.mkstemp` （method_call）
- `test_skills.test_slice_code_empty_for_non_python` → `os.close` （method_call）
- `test_skills.test_slice_code_empty_for_non_python` → `str` （call）
- `test_skills.test_slice_code_empty_for_non_python` → `slice_code` （call）
- `test_skills.test_slice_code_empty_for_non_python` → `os.unlink` （method_call）
- `test_skills.test_slice_code_empty_for_non_python` → `Path` （call）
- `test_skills.test_duplicate_detection` → `DraftCache` （call）
- `test_skills.test_duplicate_detection` → `cache.add_draft` （method_call）
- `test_skills.test_duplicate_detection` → `detect_conflicts` （call）
- `test_skills.test_duplicate_detection` → `cache.close` （method_call）
- `test_skills.test_duplicate_detection` → `isinstance` （call）
- `test_skills.test_duplicate_detection` → `str` （call）
- `test_skills.test_overlap_detection` → `DraftCache` （call）
- `test_skills.test_overlap_detection` → `cache.add_draft` （method_call）
- `test_skills.test_overlap_detection` → `detect_conflicts` （call）
- `test_skills.test_overlap_detection` → `cache.close` （method_call）
- `test_skills.test_overlap_detection` → `isinstance` （call）
- `test_skills.test_overlap_detection` → `str` （call）
- `test_skills.test_pass_scenario` → `DraftCache` （call）
- `test_skills.test_pass_scenario` → `cache.add_draft` （method_call）
- `test_skills.test_pass_scenario` → `run_quality_gate` （call）
- `test_skills.test_pass_scenario` → `cache.close` （method_call）
- `test_skills.test_pass_scenario` → `str` （call）
- `test_skills.test_pass_scenario` → `len` （call）
- `test_skills.test_reject_scenario` → `DraftCache` （call）
- `test_skills.test_reject_scenario` → `cache.get_drafts_by_status` （method_call）
- `test_skills.test_reject_scenario` → `cache.add_draft` （method_call）
- `test_skills.test_reject_scenario` → `run_quality_gate` （call）
- `test_skills.test_reject_scenario` → `cache.close` （method_call）
- `test_skills.test_reject_scenario` → `str` （call）
- `test_skills.test_reject_scenario` → `cache.update_draft_status` （method_call）
- `test_skills.test_reject_scenario` → `len` （call）
- `test_skills.test_batch_commit_with_pending_drafts` → `DraftCache` （call）
- `test_skills.test_batch_commit_with_pending_drafts` → `range` （call）
- `test_skills.test_batch_commit_with_pending_drafts` → `batch_commit` （call）
- `test_skills.test_batch_commit_with_pending_drafts` → `cache.close` （method_call）
- `test_skills.test_batch_commit_with_pending_drafts` → `isinstance` （call）
- `test_skills.test_batch_commit_with_pending_drafts` → `str` （call）
- `test_skills.test_batch_commit_with_pending_drafts` → `cache.add_draft` （method_call）
- `test_skills.test_single_commit_approved_draft` → `DraftCache` （call）
- `test_skills.test_single_commit_approved_draft` → `cache.add_draft` （method_call）
- `test_skills.test_single_commit_approved_draft` → `cache.update_draft_status` （method_call）
- `test_skills.test_single_commit_approved_draft` → `single_commit` （call）
- `test_skills.test_single_commit_approved_draft` → `cache.close` （method_call）
- `test_skills.test_single_commit_approved_draft` → `str` （call）
- `test_skills.test_single_commit_rejects_non_approved` → `DraftCache` （call）
- `test_skills.test_single_commit_rejects_non_approved` → `cache.add_draft` （method_call）
- `test_skills.test_single_commit_rejects_non_approved` → `cache.update_draft_status` （method_call）
- `test_skills.test_single_commit_rejects_non_approved` → `single_commit` （call）
- `test_skills.test_single_commit_rejects_non_approved` → `cache.close` （method_call）
- `test_skills.test_single_commit_rejects_non_approved` → `str` （call）
- `test_skills.test_generate_cases_keyword_mode` → `generate_cases` （call）
- `test_skills.test_generate_cases_keyword_mode` → `isinstance` （call）
- `test_skills.test_generate_cases_keyword_mode` → `str` （call）
- `test_skills.test_generate_cases_empty_query` → `generate_cases` （call）
- `test_skills.test_generate_cases_empty_query` → `str` （call）
- `test_skills.test_validate_action` → `run_validator` （call）
- `test_skills.test_validate_action` → `isinstance` （call）
- `test_skills.test_validate_action` → `str` （call）
- `test_skills.test_unknown_action` → `run_validator` （call）
- `test_skills.test_unknown_action` → `str` （call）
- `test_skills.test_conflict_detector_prerequisite` → `DraftCache` （call）
- `test_skills.test_conflict_detector_prerequisite` → `ConflictQueue` （call）
- `test_skills.test_conflict_detector_prerequisite` → `cache.add_draft` （method_call）
- `test_skills.test_conflict_detector_prerequisite` → `batch_commit` （call）
- `test_skills.test_conflict_detector_prerequisite` → `queue.get_pending_conflicts` （method_call）
- `test_skills.test_conflict_detector_prerequisite` → `cache.close` （method_call）
- `test_skills.test_conflict_detector_prerequisite` → `queue.close` （method_call）
- `test_skills.test_conflict_detector_prerequisite` → `isinstance` （call）
- `test_skills.test_conflict_detector_prerequisite` → `str` （call）
- `test_skills.test_quality_gate_prerequisite` → `DraftCache` （call）
- `test_skills.test_quality_gate_prerequisite` → `cache.add_draft` （method_call）
- `test_skills.test_quality_gate_prerequisite` → `batch_commit` （call）
- `test_skills.test_quality_gate_prerequisite` → `cache.close` （method_call）
- `test_skills.test_quality_gate_prerequisite` → `isinstance` （call）
- `test_skills.test_quality_gate_prerequisite` → `str` （call）
- `test_skills.test_build_api_graph_structure` → `slice_code` （call）
- `test_skills.test_build_api_graph_structure` → `isinstance` （call）
- `test_skills.test_build_api_graph_structure` → `str` （call）
- `test_skills.test_build_api_graph_structure` → `len` （call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
