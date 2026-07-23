#!/usr/bin/env python3
"""batch-commit: 批量确认入库主通路。

冲突检测 -> 质量门控 -> 写入 Brain -> 刷新图谱 -> 清空草稿
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from cache import AuditLog, DraftCache
from skills.conflict_detector import detect_conflicts
from skills.quality_gate import run_quality_gate

DB_PATH = os.environ.get("CACHE_DB_PATH", str(PROJECT_DIR / "cache" / "drafts.db"))
BRAIN_TYPE_MAP = {
    "quality_rule": "quality-rules",
    "defect_experience": "defect-experience",
    "test_case": "test-cases",
    "test_script": "test-scripts",
    "project_wiki": "project-wiki",
}


def _shared_brain_path() -> Path:
    """返回共享脑库目录（对齐 api/projects.js 的 resolveSharedDir）。"""
    pcfg = PROJECT_DIR / "config" / "projects.json"
    if pcfg.exists():
        try:
            cfg = json.loads(pcfg.read_text(encoding="utf-8"))
            return PROJECT_DIR / (cfg.get("sharedBrain") or "brains/_shared")
        except Exception:
            pass
    return PROJECT_DIR / "brains" / "_shared"


def _resolve_brain_dir(project_id: str = "default") -> Path:
    """根据项目 ID 解析其私有 Brain 仓库目录（多项目隔离）。"""
    pcfg = PROJECT_DIR / "config" / "projects.json"
    if pcfg.exists():
        try:
            cfg = json.loads(pcfg.read_text(encoding="utf-8"))
            proj = next((p for p in cfg["projects"] if p["id"] == project_id), cfg["projects"][0])
            return PROJECT_DIR / proj["brainPath"]
        except Exception:
            pass
    return PROJECT_DIR / "brain"


def _write_to_brain(brain_dir: Path, slug: str, content: str) -> bool:
    """将页面写入项目私有 Brain 仓库的对应分类目录（文件系统）。"""
    try:
        parts = slug.split("/")
        category = parts[0] if len(parts) > 1 else "test-cases"
        filename = parts[-1]
        cat_dir = brain_dir / category
        cat_dir.mkdir(parents=True, exist_ok=True)
        # newline='\n' 保证跨平台统一使用 LF，避免 Windows 默认写入 CRLF 造成与草稿缓冲层内容(SCF)不一致
        (cat_dir / f"{filename}.md").write_text(content, encoding="utf-8", newline="\n")
        return True
    except Exception as e:
        print(f"[batch-commit] 写入 {slug} 失败: {e}", file=sys.stderr)
        return False


def _build_page_content(draft: dict[str, Any]) -> str:
    """将草稿构建为 Markdown 页面内容。"""
    title = draft.get("title", "")
    content = draft.get("content", "")
    draft_type = draft.get("type", "")
    metadata = draft.get("metadata") or {}

    # 构建 frontmatter
    frontmatter_lines = ["---"]
    frontmatter_lines.append(f'title: "{title}"')
    frontmatter_lines.append(f'type: {draft_type}')
    frontmatter_lines.append(f'source: {draft.get("source", "unknown")}')
    if metadata:
        for key, value in metadata.items():
            if isinstance(value, str):
                frontmatter_lines.append(f'{key}: "{value}"')
            else:
                frontmatter_lines.append(f'{key}: {json.dumps(value, ensure_ascii=False)}')
    frontmatter_lines.append("---")
    frontmatter_lines.append("")

    return "\n".join(frontmatter_lines) + content


def batch_commit(
    draft_ids: Optional[list[str]] = None,
    db_path: Optional[str] = None,
    operator: str = "system",
    skip_conflict_check: bool = False,
    skip_quality_gate: bool = False,
    project: str = "default",
) -> dict[str, Any]:
    """批量入库。

    Args:
        draft_ids: 指定草稿 ID 列表，None 则处理所有 pending 草稿
        db_path: 数据库路径
        operator: 操作人
        skip_conflict_check: 调试用，跳过冲突检测
        skip_quality_gate: 调试用，跳过质量门控

    Returns:
        入库结果 { processedDrafts, committed, conflicts, rejected, committedPages }
    """
    db_path = db_path or DB_PATH
    brain_dir = _resolve_brain_dir(project)
    draft_cache = DraftCache(db_path)
    audit_log = AuditLog(db_path)

    try:
        # 1. 读取待入库草稿
        if draft_ids:
            drafts = []
            for did in draft_ids:
                d = draft_cache.get_draft_by_id(did)
                if d and d.get("status") in ("pending", "approved"):
                    drafts.append(d)
        else:
            cursor = draft_cache._conn.execute(
                "SELECT * FROM drafts WHERE status IN ('pending', 'approved') AND project_id = ? ORDER BY created_at DESC",
                (project,)
            )
            drafts = [draft_cache._row_to_draft(row) for row in cursor.fetchall()]

        if not drafts:
            return {
                "processedDrafts": 0,
                "committed": [],
                "conflicts": [],
                "rejected": [],
                "committedPages": [],
            }

        draft_ids_list = [d["id"] for d in drafts]

        # 2. 冲突检测（前置）
        if not skip_conflict_check:
            conflict_result = detect_conflicts(
                draft_ids=draft_ids_list, db_path=db_path, operator=operator, project=project
            )
            conflict_draft_ids = {c["draftId"] for c in conflict_result.get("conflicts", [])}
            # 过滤掉有冲突的草稿
            drafts = [d for d in drafts if d["id"] not in conflict_draft_ids]
        else:
            conflict_result = {"conflicts": []}

        # 3. 质量门控（前置）
        if not skip_quality_gate:
            need_qg = [d for d in drafts if d.get("status") in ("pending", "conflict")]
            already_approved = [d for d in drafts if d.get("status") == "approved"]
            if need_qg:
                quality_result = run_quality_gate(
                    draft_ids=[d["id"] for d in need_qg],
                    db_path=db_path,
                    operator=operator,
                    project=project,
                )
                passed_ids = {p["draftId"] for p in quality_result.get("passed", [])}
                drafts = [d for d in need_qg if d["id"] in passed_ids] + already_approved
                rejected_list = quality_result.get("rejected", [])
            else:
                drafts = already_approved
                rejected_list = []
        else:
            rejected_list = []

        # 4. 写入 Brain
        committed = []
        committed_pages = []
        failed = []

        for draft in drafts:
            draft_id = draft["id"]
            draft_type = draft.get("type", "")
            metadata = draft.get("metadata") or {}

            if draft_type == "knowledge_edit":
                # 人工编辑优化（链路 3a）：写回原知识库页面，而非生成新文件
                category = metadata.get("category") or ""
                page_id = metadata.get("pageId") or draft_id
                repo = metadata.get("repo") or ""
                # 校验路径安全，禁止越界
                if (not category or ".." in category or "/" in category or "\\" in category
                        or ".." in page_id or "/" in page_id or "\\" in page_id):
                    failed.append(draft_id)
                    continue
                # 决定写回目录：repo 命中共享库则写共享库，否则写项目私有库
                if repo and os.path.basename(str(_shared_brain_path())) == repo:
                    brain_dir_edit = _shared_brain_path()
                else:
                    brain_dir_edit = _resolve_brain_dir(project)
                slug = f"{category}/{page_id}"
                # 所见即所得：直接写用户编辑内容（不包裹 frontmatter）
                page_content = draft.get("content", "")
                success = _write_to_brain(brain_dir_edit, slug, page_content)
            else:
                brain_type = BRAIN_TYPE_MAP.get(draft_type, draft_type)
                slug = f"{brain_type}/{draft_id}"
                page_content = _build_page_content(draft)
                success = _write_to_brain(brain_dir, slug, page_content)

            if success:
                draft_cache.update_draft_status(draft_id, "merged")
                committed.append(draft_id)
                committed_pages.append(slug)
            else:
                failed.append(draft_id)

        # 5. 记录审计日志
        audit_log.log(
            action="commit",
            operator=operator,
            target="drafts",
            detail={
                "mode": "batch",
                "processedCount": len(draft_ids_list),
                "committedCount": len(committed),
                "conflictCount": len(conflict_result.get("conflicts", [])),
                "rejectedCount": len(rejected_list),
                "failedCount": len(failed),
                "committedPages": committed_pages,
            },
            project=project,
        )

        return {
            "processedDrafts": len(draft_ids_list),
            "committed": committed,
            "conflicts": [c["id"] for c in conflict_result.get("conflicts", [])],
            "rejected": [r["draftId"] for r in rejected_list],
            "committedPages": committed_pages,
            "failed": failed,
        }

    finally:
        draft_cache.close()
        audit_log.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="批量入库")
    parser.add_argument("--draft-ids", nargs="*", help="指定草稿 ID 列表")
    parser.add_argument("--db-path", help="数据库路径")
    parser.add_argument("--operator", default="system", help="操作人")
    parser.add_argument("--skip-conflict-check", action="store_true", help="跳过冲突检测")
    parser.add_argument("--skip-quality-gate", action="store_true", help="跳过质量门控")
    parser.add_argument("--project", default="default", help="所属项目 ID")
    args = parser.parse_args()

    result = batch_commit(
        draft_ids=args.draft_ids,
        db_path=args.db_path,
        operator=args.operator,
        skip_conflict_check=args.skip_conflict_check,
        skip_quality_gate=args.skip_quality_gate,
        project=args.project,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
