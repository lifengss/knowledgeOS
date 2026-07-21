---
type: api-contract
module: conflict_detector
source: auto-generated
created: 2026-07-21
updated: 2026-07-21
---

# API 契约：conflict_detector

## Compiled Truth（当前最佳理解）

本模块包含 8 个接口定义。

### 接口列表

- `conflict_detector._gbrain_list(page_type)` → `list[dict[str, Any]]`
- `conflict_detector._gbrain_get(slug)` → `dict[str, Any]`
- `conflict_detector._strip_frontmatter(text)` → `str`
- `conflict_detector._extract_keywords(text)` → `set[str]`
- `conflict_detector._title_similarity(title1, title2)` → `float`
- `conflict_detector._keyword_overlap(keywords1, keywords2)` → `float`
- `conflict_detector._detect_conflict_type(draft, existing_page)` → `Optional[str]`
- `conflict_detector.detect_conflicts(draft_ids, db_path, operator)` → `dict[str, Any]`

### 调用关系

- `conflict_detector._gbrain_list` → `subprocess.run` （method_call）
- `conflict_detector._gbrain_list` → `line.strip` （method_call）
- `conflict_detector._gbrain_list` → `line.split` （method_call）
- `conflict_detector._gbrain_list` → `print` （call）
- `conflict_detector._gbrain_list` → `len` （call）
- `conflict_detector._gbrain_list` → `pages.append` （method_call）
- `conflict_detector._gbrain_get` → `subprocess.run` （method_call）
- `conflict_detector._gbrain_get` → `print` （call）
- `conflict_detector._strip_frontmatter` → `text.strip` （method_call）
- `conflict_detector._strip_frontmatter` → `text.startswith` （method_call）
- `conflict_detector._strip_frontmatter` → `text.split` （method_call）
- `conflict_detector._strip_frontmatter` → `len` （call）
- `conflict_detector._extract_keywords` → `_strip_frontmatter` （call）
- `conflict_detector._extract_keywords` → `set` （call）
- `conflict_detector._extract_keywords` → `set` （call）
- `conflict_detector._extract_keywords` → `words.update` （method_call）
- `conflict_detector._extract_keywords` → `re.findall` （method_call）
- `conflict_detector._extract_keywords` → `re.findall` （method_call）
- `conflict_detector._extract_keywords` → `text.lower` （method_call）
- `conflict_detector._extract_keywords` → `len` （call）
- `conflict_detector._title_similarity` → `SequenceMatcher` （call）
- `conflict_detector._title_similarity` → `title1.lower` （method_call）
- `conflict_detector._title_similarity` → `title2.lower` （method_call）
- `conflict_detector._keyword_overlap` → `len` （call）
- `conflict_detector._keyword_overlap` → `len` （call）
- `conflict_detector._detect_conflict_type` → `draft.get` （method_call）
- `conflict_detector._detect_conflict_type` → `draft.get` （method_call）
- `conflict_detector._detect_conflict_type` → `existing_page.get` （method_call）
- `conflict_detector._detect_conflict_type` → `existing_page.get` （method_call）
- `conflict_detector._detect_conflict_type` → `_title_similarity` （call）
- `conflict_detector._detect_conflict_type` → `_extract_keywords` （call）
- `conflict_detector._detect_conflict_type` → `_extract_keywords` （call）
- `conflict_detector._detect_conflict_type` → `_keyword_overlap` （call）
- `conflict_detector._detect_conflict_type` → `any` （call）
- `conflict_detector._detect_conflict_type` → `any` （call）
- `conflict_detector._detect_conflict_type` → `any` （call）
- `conflict_detector._detect_conflict_type` → `any` （call）
- `conflict_detector._detect_conflict_type` → `any` （call）
- `conflict_detector._detect_conflict_type` → `any` （call）
- `conflict_detector.detect_conflicts` → `DraftCache` （call）
- `conflict_detector.detect_conflicts` → `ConflictQueue` （call）
- `conflict_detector.detect_conflicts` → `AuditLog` （call）
- `conflict_detector.detect_conflicts` → `audit_log.log` （method_call）
- `conflict_detector.detect_conflicts` → `draft_cache.close` （method_call）
- `conflict_detector.detect_conflicts` → `conflict_queue.close` （method_call）
- `conflict_detector.detect_conflicts` → `audit_log.close` （method_call）
- `conflict_detector.detect_conflicts` → `draft_cache.get_drafts_by_status` （method_call）
- `conflict_detector.detect_conflicts` → `draft.get` （method_call）
- `conflict_detector.detect_conflicts` → `BRAIN_TYPE_MAP.get` （method_call）
- `conflict_detector.detect_conflicts` → `draft.get` （method_call）
- `conflict_detector.detect_conflicts` → `BRAIN_TYPE_MAP.get` （method_call）
- `conflict_detector.detect_conflicts` → `type_to_pages.get` （method_call）
- `conflict_detector.detect_conflicts` → `len` （call）
- `conflict_detector.detect_conflicts` → `draft_cache.get_draft_by_id` （method_call）
- `conflict_detector.detect_conflicts` → `_gbrain_list` （call）
- `conflict_detector.detect_conflicts` → `_detect_conflict_type` （call）
- `conflict_detector.detect_conflicts` → `passed_drafts.append` （method_call）
- `conflict_detector.detect_conflicts` → `drafts.append` （method_call）
- `conflict_detector.detect_conflicts` → `_gbrain_get` （call）
- `conflict_detector.detect_conflicts` → `conflict_queue.add_conflict` （method_call）
- `conflict_detector.detect_conflicts` → `conflicts.append` （method_call）
- `conflict_detector.detect_conflicts` → `draft_cache.update_draft_status` （method_call）
- `conflict_detector.detect_conflicts` → `len` （call）
- `conflict_detector.detect_conflicts` → `len` （call）
- `conflict_detector.detect_conflicts` → `len` （call）
- `conflict_detector.detect_conflicts` → `page_content.get` （method_call）
- `conflict_detector.detect_conflicts` → `draft.get` （method_call）
- `conflict_detector.detect_conflicts` → `draft.get` （method_call）

## Timeline（历史证据，只追加）

- 2026-07-21: 由 tfidf-code-slicer 自动从项目源码生成
