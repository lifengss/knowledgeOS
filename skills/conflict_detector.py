#!/usr/bin/env python3
"""conflict-detector: 入库前强制冲突检测引擎。

识别重复/矛盾/重叠规则，将冲突写入 conflicts 表。
不调用 LLM，使用规则引擎（关键词匹配 + 标题相似度）。
"""

import json
import os
import re
import subprocess
import sys
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Optional

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from cache import AuditLog, ConflictQueue, DraftCache

DB_PATH = os.environ.get("CACHE_DB_PATH", str(PROJECT_DIR / "cache" / "drafts.db"))
BRAIN_TYPE_MAP = {
    "quality_rule": "quality-rule",
    "defect_experience": "defect",
    "test_case": "test-case",
    "project_wiki": "project-wiki",
}


def _gbrain_list(page_type: str) -> list[dict[str, Any]]:
    """调用 gbrain list 获取指定类型的页面列表。"""
    try:
        result = subprocess.run(
            ["gbrain", "list", "--type", page_type, "-n", "1000"],
            capture_output=True,
            text=True,
            check=True,
            encoding="utf-8",
        )
        pages = []
        for line in result.stdout.strip().split("\n"):
            line = line.strip()
            if not line or "\t" not in line:
                continue
            parts = line.split("\t")
            if len(parts) >= 4:
                pages.append(
                    {
                        "slug": parts[0],
                        "type": parts[1],
                        "date": parts[2],
                        "title": parts[3],
                    }
                )
        return pages
    except subprocess.CalledProcessError as e:
        print(f"[conflict-detector] gbrain list 失败: {e}", file=sys.stderr)
        return []


def _gbrain_get(slug: str) -> dict[str, Any]:
    """调用 gbrain get 获取页面内容。"""
    try:
        result = subprocess.run(
            ["gbrain", "get", slug],
            capture_output=True,
            text=True,
            check=True,
            encoding="utf-8",
        )
        return {"slug": slug, "content": result.stdout}
    except subprocess.CalledProcessError as e:
        print(f"[conflict-detector] gbrain get {slug} 失败: {e}", file=sys.stderr)
        return {"slug": slug, "content": ""}


def _strip_frontmatter(text: str) -> str:
    """去除 Markdown frontmatter（--- 包围的 YAML 头部）。"""
    text = text.strip()
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            return parts[2].strip()
    return text


# 噪声关键词过滤列表
_NOISE_WORDS = {
    "type", "title", "status", "created", "updated", "rule_id", "category",
    "compiled", "truth", "timeline", "active", "draft", "page", "slug",
    "qr", "tc", "def", "v1", "v2", "v3", "t00", "z", "id", "md",
    "the", "and", "for", "are", "but", "not", "you", "all", "can",
    "had", "her", "was", "one", "our", "out", "day", "get", "has",
    "him", "his", "how", "its", "may", "new", "now", "old", "see",
    "two", "who", "boy", "did", "she", "use", "her", "way", "many",
}


def _extract_keywords(text: str) -> set[str]:
    """提取关键词：中文分词 + 英文单词，过滤噪声。"""
    text = _strip_frontmatter(text)
    # 英文单词
    words = set(re.findall(r"[a-zA-Z_][a-zA-Z0-9_]*", text.lower()))
    # 中文字符（简单按字提取）
    chinese_chars = set(re.findall(r"[\u4e00-\u9fff]{2,8}", text))
    words.update(chinese_chars)
    # 过滤噪声词和过短词
    words = {w for w in words if w not in _NOISE_WORDS and len(w) >= 2}
    return words


def _title_similarity(title1: str, title2: str) -> float:
    """计算标题相似度，返回 0-1。"""
    return SequenceMatcher(None, title1.lower(), title2.lower()).ratio()


def _keyword_overlap(keywords1: set[str], keywords2: set[str]) -> float:
    """计算关键词重叠率。"""
    if not keywords1 or not keywords2:
        return 0.0
    intersection = keywords1 & keywords2
    union = keywords1 | keywords2
    return len(intersection) / len(union)


def _detect_conflict_type(
    draft: dict[str, Any], existing_page: dict[str, Any]
) -> Optional[str]:
    """检测冲突类型：duplicate / contradiction / overlap / None。"""
    draft_title = draft.get("title", "")
    draft_content = draft.get("content", "")
    existing_title = existing_page.get("title", "")
    existing_content = existing_page.get("content", "")

    title_sim = _title_similarity(draft_title, existing_title)
    draft_kw = _extract_keywords(draft_title + " " + draft_content)
    existing_kw = _extract_keywords(existing_title + " " + existing_content)
    kw_overlap = _keyword_overlap(draft_kw, existing_kw)

    # duplicate: 标题相似度 > 0.8 且关键词重叠 > 0.7
    if title_sim > 0.8 and kw_overlap > 0.7:
        return "duplicate"

    # contradiction: 标题相似度 > 0.5 且关键词重叠 > 0.5，但内容有矛盾关键词
    contradiction_keywords = ["禁止", "必须", "不得", "必须不", "不允许", "必须允许"]
    draft_has = any(kw in draft_content for kw in contradiction_keywords)
    existing_has = any(kw in existing_content for kw in contradiction_keywords)
    if title_sim > 0.5 and kw_overlap > 0.5 and draft_has and existing_has:
        # 检查是否有直接矛盾表述
        draft_neg = any(kw in draft_content for kw in ["禁止", "不得", "不允许"])
        existing_pos = any(kw in existing_content for kw in ["必须", "必须允许"])
        draft_pos = any(kw in draft_content for kw in ["必须", "必须允许"])
        existing_neg = any(kw in existing_content for kw in ["禁止", "不得", "不允许"])
        if (draft_neg and existing_pos) or (draft_pos and existing_neg):
            return "contradiction"

    # overlap: 关键词重叠 > 0.4 但不到 duplicate 程度
    if kw_overlap > 0.4:
        return "overlap"

    return None


def detect_conflicts(
    draft_ids: Optional[list[str]] = None,
    db_path: Optional[str] = None,
    operator: str = "system",
) -> dict[str, Any]:
    """执行冲突检测。

    Args:
        draft_ids: 指定草稿 ID 列表，None 则检测所有 pending 草稿
        db_path: 数据库路径
        operator: 操作人

    Returns:
        检测结果 { checkedDrafts, conflicts, passedDrafts }
    """
    db_path = db_path or DB_PATH
    draft_cache = DraftCache(db_path)
    conflict_queue = ConflictQueue(db_path)
    audit_log = AuditLog(db_path)

    try:
        # 1. 读取待检测草稿
        if draft_ids:
            drafts = []
            for did in draft_ids:
                d = draft_cache.get_draft_by_id(did)
                if d:
                    drafts.append(d)
        else:
            drafts = draft_cache.get_drafts_by_status("pending")

        if not drafts:
            return {"checkedDrafts": 0, "conflicts": [], "passedDrafts": []}

        # 2. 按类型分组，读取对应 Brain 页面
        type_to_pages: dict[str, list[dict[str, Any]]] = {}
        for draft in drafts:
            draft_type = draft.get("type", "")
            brain_type = BRAIN_TYPE_MAP.get(draft_type, draft_type)
            if brain_type not in type_to_pages:
                pages = _gbrain_list(brain_type)
                # 获取页面内容
                type_to_pages[brain_type] = []
                for page_meta in pages:
                    page_content = _gbrain_get(page_meta["slug"])
                    type_to_pages[brain_type].append(
                        {
                            "slug": page_meta["slug"],
                            "title": page_meta["title"],
                            "content": page_content.get("content", ""),
                        }
                    )

        # 3. 逐条检测冲突
        conflicts = []
        passed_drafts = []

        for draft in drafts:
            draft_id = draft["id"]
            draft_type = draft.get("type", "")
            brain_type = BRAIN_TYPE_MAP.get(draft_type, draft_type)
            existing_pages = type_to_pages.get(brain_type, [])

            found_conflict = False
            for page in existing_pages:
                conflict_type = _detect_conflict_type(draft, page)
                if conflict_type:
                    conflict_id = conflict_queue.add_conflict(
                        {
                            "draftId": draft_id,
                            "existingRule": f"{page['slug']} {page['title']}",
                            "newRule": draft.get("title", ""),
                            "conflictType": conflict_type,
                        }
                    )
                    conflicts.append(
                        {
                            "id": conflict_id,
                            "draftId": draft_id,
                            "conflictType": conflict_type,
                            "existingRule": page["slug"],
                            "newRule": draft.get("title", ""),
                        }
                    )
                    draft_cache.update_draft_status(draft_id, "conflict")
                    found_conflict = True
                    break

            if not found_conflict:
                passed_drafts.append(draft_id)

        # 4. 记录审计日志
        audit_log.log(
            action="conflict_detect",
            operator=operator,
            target="drafts",
            detail={
                "checkedCount": len(drafts),
                "conflictCount": len(conflicts),
                "passedCount": len(passed_drafts),
            },
        )

        return {
            "checkedDrafts": len(drafts),
            "conflicts": conflicts,
            "passedDrafts": passed_drafts,
        }

    finally:
        draft_cache.close()
        conflict_queue.close()
        audit_log.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="冲突检测引擎")
    parser.add_argument("--draft-ids", nargs="*", help="指定草稿 ID 列表")
    parser.add_argument("--db-path", help="数据库路径")
    parser.add_argument("--operator", default="system", help="操作人")
    args = parser.parse_args()

    result = detect_conflicts(
        draft_ids=args.draft_ids,
        db_path=args.db_path,
        operator=args.operator,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
