#!/usr/bin/env python3
"""quality-gate: 入库前强制质量校验引擎。

对草稿进行质量评分（0-100），输出通过/拒绝决定。
不调用 LLM，使用规则引擎。
"""

import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Optional

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from cache import AuditLog, DraftCache

DB_PATH = os.environ.get("CACHE_DB_PATH", str(PROJECT_DIR / "cache" / "drafts.db"))

# 评分权重
WEIGHT_COMPLETENESS = 30
WEIGHT_LENGTH = 25
WEIGHT_FORMAT = 25
WEIGHT_SOURCE = 20


def _score_completeness(draft: dict[str, Any]) -> int:
    """完整性评分（0-30）：必填字段是否齐全。"""
    score = 0
    required_fields = ["type", "title", "content"]
    for field in required_fields:
        if draft.get(field):
            score += 8
    if draft.get("metadata"):
        score += 6
    return min(WEIGHT_COMPLETENESS, score)


def _score_length(draft: dict[str, Any]) -> int:
    """内容长度评分（0-25）。"""
    title = draft.get("title", "")
    content = draft.get("content", "")
    score = 0
    if len(title) >= 5:
        score += 5
    if len(title) >= 10:
        score += 3
    if len(content) >= 50:
        score += 5
    if len(content) >= 200:
        score += 5
    if len(content) >= 500:
        score += 4
    if len(content) >= 1000:
        score += 3
    return min(WEIGHT_LENGTH, score)


def _score_format(draft: dict[str, Any]) -> int:
    """格式规范评分（0-25）：是否包含标准结构。"""
    content = draft.get("content", "")
    score = 0
    # 包含 Markdown 标题
    if re.search(r"^#{1,2}\s+", content, re.MULTILINE):
        score += 8
    # 包含列表
    if re.search(r"^\s*[-*]\s+", content, re.MULTILINE):
        score += 5
    # 包含代码块
    if "```" in content:
        score += 5
    # 包含表格
    if "|" in content and "---" in content:
        score += 4
    # 包含 frontmatter
    if content.strip().startswith("---"):
        score += 3
    return min(WEIGHT_FORMAT, score)


def _score_source(draft: dict[str, Any]) -> int:
    """来源可信度评分（0-20）。"""
    source = draft.get("source", "")
    if source == "human_edit":
        return WEIGHT_SOURCE
    elif source == "execution_feedback":
        return int(WEIGHT_SOURCE * 0.8)
    elif source == "ai_generated":
        return int(WEIGHT_SOURCE * 0.6)
    else:
        return int(WEIGHT_SOURCE * 0.5)


def evaluate_draft(draft: dict[str, Any]) -> dict[str, Any]:
    """评估单条草稿，返回评分详情。"""
    completeness = _score_completeness(draft)
    length = _score_length(draft)
    format_score = _score_format(draft)
    source = _score_source(draft)

    total = completeness + length + format_score + source

    return {
        "draftId": draft.get("id"),
        "score": total,
        "breakdown": {
            "completeness": completeness,
            "length": length,
            "format": format_score,
            "source": source,
        },
        "decision": "pass" if total >= 60 else "reject",
        "reason": None if total >= 60 else _build_reject_reason(completeness, length, format_score, source),
    }


def _build_reject_reason(c: int, l: int, f: int, s: int) -> str:
    """构建拒绝原因。"""
    reasons = []
    if c < 20:
        reasons.append("必填字段不完整")
    if l < 15:
        reasons.append("内容过短")
    if f < 15:
        reasons.append("格式不规范")
    if s < 15:
        reasons.append("来源可信度低")
    return "；".join(reasons) if reasons else "综合评分不足"


def run_quality_gate(
    draft_ids: Optional[list[str]] = None,
    db_path: Optional[str] = None,
    operator: str = "system",
    project: str = "default",
) -> dict[str, Any]:
    """执行质量门控。

    Args:
        draft_ids: 指定草稿 ID 列表，None 则处理所有 pending 草稿
        db_path: 数据库路径
        operator: 操作人

    Returns:
        质量检查结果 { checkedDrafts, passed, rejected }
    """
    db_path = db_path or DB_PATH
    draft_cache = DraftCache(db_path)
    audit_log = AuditLog(db_path)

    try:
        # 1. 读取待检测草稿
        if draft_ids:
            drafts = []
            for did in draft_ids:
                d = draft_cache.get_draft_by_id(did)
                if d and d.get("status") in ("pending", "conflict"):
                    drafts.append(d)
        else:
            drafts = draft_cache.get_drafts_by_status("pending", project_id=project)

        if not drafts:
            return {"checkedDrafts": 0, "passed": [], "rejected": []}

        passed = []
        rejected = []

        for draft in drafts:
            result = evaluate_draft(draft)
            draft_id = draft["id"]
            score = result["score"]
            decision = result["decision"]

            if decision == "pass":
                draft_cache.update_draft_status(draft_id, "approved", score)
                passed.append(result)
            else:
                draft_cache.update_draft_status(draft_id, "rejected", score)
                rejected.append(result)

        # 记录审计日志
        audit_log.log(
            action="quality_gate",
            operator=operator,
            target="drafts",
            detail={
                "checkedCount": len(drafts),
                "passedCount": len(passed),
                "rejectedCount": len(rejected),
            },
        )

        return {
            "checkedDrafts": len(drafts),
            "passed": passed,
            "rejected": rejected,
        }

    finally:
        draft_cache.close()
        audit_log.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="质量门控引擎")
    parser.add_argument("--draft-ids", nargs="*", help="指定草稿 ID 列表")
    parser.add_argument("--db-path", help="数据库路径")
    parser.add_argument("--operator", default="system", help="操作人")
    parser.add_argument("--project", default="default", help="所属项目 ID")
    args = parser.parse_args()

    result = run_quality_gate(
        draft_ids=args.draft_ids,
        db_path=args.db_path,
        operator=args.operator,
        project=args.project,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
