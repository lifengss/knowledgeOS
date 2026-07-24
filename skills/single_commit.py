#!/usr/bin/env python3
"""single-commit: 单条确认入库兜底通路。

冲突检测 -> 质量门控 -> 写入 Brain -> 清空草稿
"""

import json
import os
import sys
from pathlib import Path
from typing import Any, Optional

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from cache import AuditLog, DraftCache
from skills.batch_commit import _build_page_content, _write_to_brain, _resolve_brain_dir, _standard_categories
from skills.conflict_detector import detect_conflicts
from skills.quality_gate import run_quality_gate

DB_PATH = os.environ.get("CACHE_DB_PATH", str(PROJECT_DIR / "cache" / "drafts.db"))


def single_commit(
    draft_id: str,
    db_path: Optional[str] = None,
    operator: str = "system",
    skip_conflict_check: bool = False,
    skip_quality_gate: bool = False,
    project: str = "default",
) -> dict[str, Any]:
    """单条入库。

    Args:
        draft_id: 草稿 ID
        db_path: 数据库路径
        operator: 操作人
        skip_conflict_check: 调试用，跳过冲突检测
        skip_quality_gate: 调试用，跳过质量门控

    Returns:
        入库结果 { draftId, success, committedPage, conflictId, score, reason }
    """
    db_path = db_path or DB_PATH
    draft_cache = DraftCache(db_path)
    audit_log = AuditLog(db_path)

    try:
        draft = draft_cache.get_draft_by_id(draft_id)
        if not draft:
            return {
                "draftId": draft_id,
                "success": False,
                "committedPage": None,
                "conflictId": None,
                "score": None,
                "reason": "草稿不存在",
            }

        if draft.get("status") not in ("pending", "approved"):
            return {
                "draftId": draft_id,
                "success": False,
                "committedPage": None,
                "conflictId": None,
                "score": None,
                "reason": f"草稿状态为 {draft.get('status')}，不是 pending/approved",
            }

        effective_project = draft.get("projectId") or project

        # 1. 冲突检测
        if not skip_conflict_check:
            conflict_result = detect_conflicts(
                draft_ids=[draft_id], db_path=db_path, operator=operator, project=effective_project
            )
            if conflict_result.get("conflicts"):
                conflict = conflict_result["conflicts"][0]
                return {
                    "draftId": draft_id,
                    "success": False,
                    "committedPage": None,
                    "conflictId": conflict["id"],
                    "score": None,
                    "reason": f"检测到冲突: {conflict['conflictType']}",
                }

        # 2. 质量门控
        if not skip_quality_gate:
            if draft.get("status") == "approved":
                score = draft.get("qualityScore")
            else:
                quality_result = run_quality_gate(
                    draft_ids=[draft_id], db_path=db_path, operator=operator, project=effective_project
                )
                rejected = quality_result.get("rejected", [])
                if rejected:
                    return {
                        "draftId": draft_id,
                        "success": False,
                        "committedPage": None,
                        "conflictId": None,
                        "score": rejected[0]["score"],
                        "reason": f"质量门控拒绝: {rejected[0].get('reason', '评分不足')}",
                    }
                passed = quality_result.get("passed", [])
                score = passed[0].get("score") if passed else None
        else:
            score = None

        # 3. 写入 Brain
        from skills.batch_commit import BRAIN_TYPE_MAP, _shared_brain_path

        draft_type = draft.get("type", "")
        metadata = draft.get("metadata") or {}

        if draft_type == "knowledge_edit":
            # 人工编辑优化（链路 3a）：写回原知识库页面，而非生成新文件
            # 对齐 batch_commit.py 的同名分支，修复"单条入库被非标准分类拒绝"的问题
            category = metadata.get("category") or ""
            page_id = metadata.get("pageId") or draft_id
            repo = metadata.get("repo") or ""
            if (not category or ".." in category or "/" in category or "\\" in category
                    or ".." in page_id or "/" in page_id or "\\" in page_id):
                return {
                    "draftId": draft_id,
                    "success": False,
                    "committedPage": None,
                    "conflictId": None,
                    "score": score,
                    "reason": "非法的知识编辑分类或页面 ID（禁止路径越界）",
                }
            if repo and os.path.basename(str(_shared_brain_path())) == repo:
                brain_dir_edit = _shared_brain_path()
            else:
                brain_dir_edit = _resolve_brain_dir(effective_project)
            slug = f"{category}/{page_id}"
            page_content = draft.get("content", "")  # 所见即所得，不包裹 frontmatter
            success = _write_to_brain(brain_dir_edit, slug, page_content)
            # 重分类移动：目标分类与原分类不同则删除原文件（严格移动，不留旧文件）
            original_category = metadata.get("originalCategory") or ""
            if success and original_category and original_category != category:
                orig_path = os.path.join(brain_dir_edit, original_category, f"{page_id}.md")
                try:
                    if os.path.exists(orig_path):
                        os.remove(orig_path)
                except OSError:
                    pass  # 旧文件删除失败不阻断主流程（新文件已写入）
        else:
            brain_type = BRAIN_TYPE_MAP.get(draft_type, draft_type)
            # 禁止诞生非标准分类（如 defect_rule）：目标目录必须是项目标准分类之一
            if brain_type not in _standard_categories(effective_project):
                return {
                    "draftId": draft_id,
                    "success": False,
                    "committedPage": None,
                    "conflictId": None,
                    "score": score,
                    "reason": f"非标准分类 '{brain_type}' 被拒绝入库：请使用标准分类之一 {_standard_categories(effective_project)}",
                }
            slug = f"{brain_type}/{draft_id}"

            page_content = _build_page_content(draft)
            brain_dir = _resolve_brain_dir(effective_project)
            success = _write_to_brain(brain_dir, slug, page_content)

        if not success:
            return {
                "draftId": draft_id,
                "success": False,
                "committedPage": None,
                "conflictId": None,
                "score": score,
                "reason": "写入 Brain 失败",
            }

        # 4. 更新草稿状态
        draft_cache.update_draft_status(draft_id, "merged")

        # 5. 记录审计日志
        audit_log.log(
            action="commit",
            operator=operator,
            target=draft_id,
            detail={"mode": "single", "committedPage": slug, "score": score},
            project=effective_project,
        )

        return {
            "draftId": draft_id,
            "success": True,
            "committedPage": slug,
            "conflictId": None,
            "score": score,
            "reason": None,
        }

    finally:
        draft_cache.close()
        audit_log.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="单条入库")
    parser.add_argument("draft_id", help="草稿 ID")
    parser.add_argument("--db-path", help="数据库路径")
    parser.add_argument("--operator", default="system", help="操作人")
    parser.add_argument("--skip-conflict-check", action="store_true", help="跳过冲突检测")
    parser.add_argument("--skip-quality-gate", action="store_true", help="跳过质量门控")
    parser.add_argument("--project", default="default", help="所属项目 ID")
    args = parser.parse_args()

    result = single_commit(
        draft_id=args.draft_id,
        db_path=args.db_path,
        operator=args.operator,
        skip_conflict_check=args.skip_conflict_check,
        skip_quality_gate=args.skip_quality_gate,
        project=args.project,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
