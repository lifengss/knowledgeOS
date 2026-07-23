"""草稿缓存管理器，负责 drafts 表的增删改查。"""

import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

DB_PATH = Path(__file__).parent.parent / "cache" / "drafts.db"


class DraftCache:
    """草稿缓存管理器。"""

    def __init__(self, db_path: Optional[str] = None):
        """创建 DraftCache 实例。

        Args:
            db_path: SQLite 数据库文件路径，默认使用 cache/drafts.db
        """
        self.db_path = Path(db_path) if db_path else DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self.db_path))
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        """初始化数据库表结构。"""
        # 兼容已存在的表：先确保 project_id 列存在（旧行归为 default 项目）
        try:
            self._conn.execute(
                "ALTER TABLE drafts ADD COLUMN project_id TEXT DEFAULT 'default'"
            )
            self._conn.commit()
        except Exception:
            pass
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS drafts (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT,
                status TEXT DEFAULT 'pending',
                quality_score INTEGER,
                project_id TEXT DEFAULT 'default',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
            CREATE INDEX IF NOT EXISTS idx_drafts_type ON drafts(type);
            CREATE INDEX IF NOT EXISTS idx_drafts_source ON drafts(source);
            CREATE INDEX IF NOT EXISTS idx_drafts_project ON drafts(project_id);
            CREATE INDEX IF NOT EXISTS idx_drafts_created ON drafts(created_at);
            """
        )
        self._conn.commit()

    def close(self) -> None:
        """关闭数据库连接。"""
        self._conn.close()

    def add_draft(self, draft: dict[str, Any], project_id: str = "default") -> str:
        """添加草稿。

        Args:
            draft: 草稿对象，包含 source/type/title/content/metadata/status 等字段
            project_id: 所属项目 ID（用于多项目隔离）

        Returns:
            新增草稿的 ID
        """
        draft_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        self._conn.execute(
            """
            INSERT INTO drafts (id, source, type, title, content, metadata, status, project_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                draft_id,
                draft["source"],
                draft["type"],
                draft["title"],
                draft["content"],
                json.dumps(draft["metadata"]) if draft.get("metadata") else None,
                draft.get("status", "pending"),
                project_id,
                now,
                now,
            ),
        )
        self._conn.commit()
        return draft_id

    def get_drafts_by_status(
        self, status: str = "pending", filters: Optional[dict[str, str]] = None, project_id: str = "default"
    ) -> list[dict[str, Any]]:
        """获取指定状态的草稿列表。

        Args:
            status: 草稿状态
            filters: 额外过滤条件，支持 source/type
            project_id: 所属项目 ID（多项目隔离）

        Returns:
            草稿列表
        """
        filters = filters or {}
        where_clauses = ["status = ?", "project_id = ?"]
        params: list[Any] = [status, project_id]

        if "source" in filters:
            where_clauses.append("source = ?")
            params.append(filters["source"])
        if "type" in filters:
            where_clauses.append("type = ?")
            params.append(filters["type"])

        sql = f"SELECT * FROM drafts WHERE {' AND '.join(where_clauses)} ORDER BY created_at DESC"
        cursor = self._conn.execute(sql, params)
        return [self._row_to_draft(row) for row in cursor.fetchall()]

    def get_draft_by_id(self, draft_id: str) -> Optional[dict[str, Any]]:
        """根据 ID 获取草稿。

        Args:
            draft_id: 草稿 ID

        Returns:
            草稿对象，不存在返回 None
        """
        cursor = self._conn.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,))
        row = cursor.fetchone()
        return self._row_to_draft(row) if row else None

    def update_draft_status(
        self, draft_id: str, status: str, quality_score: Optional[int] = None
    ) -> bool:
        """更新草稿状态。

        Args:
            draft_id: 草稿 ID
            status: 新状态
            quality_score: 可选的质量评分

        Returns:
            是否更新成功
        """
        fields = ["status = ?", "updated_at = ?"]
        params: list[Any] = [status, datetime.now().isoformat()]

        if quality_score is not None:
            fields.append("quality_score = ?")
            params.append(quality_score)

        params.append(draft_id)
        sql = f"UPDATE drafts SET {', '.join(fields)} WHERE id = ?"
        cursor = self._conn.execute(sql, params)
        self._conn.commit()
        return cursor.rowcount > 0

    def update_draft(
        self,
        draft_id: str,
        title: Optional[str] = None,
        content: Optional[str] = None,
        draft_type: Optional[str] = None,
    ) -> bool:
        """更新草稿的标题/正文/类型（人工编辑知识条目）。

        Args:
            draft_id: 草稿 ID
            title: 新标题（可选）
            content: 新正文（可选）
            draft_type: 新类型（可选）

        Returns:
            是否更新成功（无变化字段时返回 False）
        """
        fields: list[str] = []
        params: list[Any] = []
        if title is not None:
            fields.append("title = ?")
            params.append(title)
        if content is not None:
            fields.append("content = ?")
            params.append(content)
        if draft_type is not None:
            fields.append("type = ?")
            params.append(draft_type)
        if not fields:
            return False
        fields.append("updated_at = ?")
        params.append(datetime.now().isoformat())
        params.append(draft_id)
        sql = f"UPDATE drafts SET {', '.join(fields)} WHERE id = ?"
        cursor = self._conn.execute(sql, params)
        self._conn.commit()
        return cursor.rowcount > 0

    def update_drafts_status(self, draft_ids: list[str], status: str) -> int:
        """批量更新草稿状态。

        Args:
            draft_ids: 草稿 ID 列表
            status: 新状态

        Returns:
            更新数量
        """
        if not draft_ids:
            return 0
        placeholders = ", ".join("?" * len(draft_ids))
        sql = f"""
            UPDATE drafts SET status = ?, updated_at = ?
            WHERE id IN ({placeholders})
        """
        params = [status, datetime.now().isoformat(), *draft_ids]
        cursor = self._conn.execute(sql, params)
        self._conn.commit()
        return cursor.rowcount

    def cleanup_stale_drafts(self, days: int = 30) -> int:
        """清理过期草稿。

        Args:
            days: 过期天数阈值

        Returns:
            清理数量
        """
        cursor = self._conn.execute(
            """
            UPDATE drafts
            SET status = 'expired', updated_at = ?
            WHERE status = 'pending' AND created_at < datetime('now', '-{} days')
            """.format(days),
            (datetime.now().isoformat(),),
        )
        self._conn.commit()
        return cursor.rowcount

    def delete_draft(self, draft_id: str) -> dict[str, Any]:
        """删除指定草稿及其分解出的子页面缓存。

        Args:
            draft_id: 草稿 ID

        Returns:
            包含删除行数的字典
        """
        cursor = self._conn.cursor()
        # 同步清理关联的分解子页面（若表存在）
        try:
            cursor.execute(
                "DELETE FROM draft_sub_pages WHERE parent_draft_id = ?", (draft_id,)
            )
        except sqlite3.OperationalError:
            pass
        cursor.execute("DELETE FROM drafts WHERE id = ?", (draft_id,))
        affected = cursor.rowcount
        self._conn.commit()
        return {"deleted": affected, "id": draft_id}

    def _row_to_draft(self, row: sqlite3.Row) -> dict[str, Any]:
        """将数据库行转换为草稿对象。"""
        return {
            "id": row["id"],
            "source": row["source"],
            "type": row["type"],
            "title": row["title"],
            "content": row["content"],
            "metadata": json.loads(row["metadata"]) if row["metadata"] else None,
            "status": row["status"],
            "qualityScore": row["quality_score"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "projectId": row["project_id"] if "project_id" in (row.keys() if hasattr(row, "keys") else []) else "default",
        }


# ---------------------------------------------------------------------------
# 命令行接口（供 REST API 调用）
# ---------------------------------------------------------------------------

def cli():
    import argparse
    parser = argparse.ArgumentParser(description="DraftCache CLI")
    parser.add_argument("--db", default=None, help="数据库路径")
    sub = parser.add_subparsers(dest="cmd")

    # list
    p_list = sub.add_parser("list", help="列出草稿")
    p_list.add_argument("--status", default=None)
    p_list.add_argument("--source", default=None)
    p_list.add_argument("--type", default=None)
    p_list.add_argument("--project", default="default")
    p_list.add_argument("--limit", type=int, default=100)
    p_list.add_argument("--offset", type=int, default=0)

    # get
    p_get = sub.add_parser("get", help="获取单个草稿")
    p_get.add_argument("--id", required=True)

    # add
    p_add = sub.add_parser("add", help="添加草稿")
    p_add.add_argument("--source", default="human_edit")
    p_add.add_argument("--type", default="quality_rule")
    p_add.add_argument("--title", default="未命名草稿")
    p_add.add_argument("--content", default="")
    p_add.add_argument("--metadata", default="{}")
    p_add.add_argument("--project", default="default")

    # update-status
    p_up = sub.add_parser("update-status", help="更新草稿状态")
    p_up.add_argument("--id", required=True)
    p_up.add_argument("--status", required=True)
    p_up.add_argument("--score", type=int, default=None)

    # update-draft
    p_update = sub.add_parser("update-draft", help="更新草稿内容（人工编辑）")
    p_update.add_argument("--id", required=True)
    p_update.add_argument("--title", default=None)
    p_update.add_argument("--content", default=None)
    p_update.add_argument("--type", default=None)

    # delete-draft
    p_del = sub.add_parser("delete-draft", help="删除草稿（可批量）")
    p_del.add_argument("--id", nargs="+", required=True, help="草稿ID，可指定多个")
    p_del.add_argument("--project", default="default")

    # list-audit
    p_audit = sub.add_parser("list-audit", help="列出审计日志")
    p_audit.add_argument("--action", default=None)
    p_audit.add_argument("--operator", default=None)
    p_audit.add_argument("--target", default=None)
    p_audit.add_argument("--start-time", default=None)
    p_audit.add_argument("--end-time", default=None)
    p_audit.add_argument("--page", type=int, default=1)
    p_audit.add_argument("--page-size", type=int, default=20)

    # log-audit
    p_log = sub.add_parser("log-audit", help="记录审计日志")
    p_log.add_argument("--action", required=True)
    p_log.add_argument("--operator", default="system")
    p_log.add_argument("--target", default=None)
    p_log.add_argument("--detail", default="{}")
    p_log.add_argument("--project", default=None)

    # list-conflicts
    p_conflicts = sub.add_parser("list-conflicts", help="列出冲突")
    p_conflicts.add_argument("--status", default=None)
    p_conflicts.add_argument("--project", default="default")
    p_conflicts.add_argument("--limit", type=int, default=100)

    # resolve-conflict
    p_resolve = sub.add_parser("resolve-conflict", help="处理冲突")
    p_resolve.add_argument("--id", required=True)
    p_resolve.add_argument("--resolution", required=True)

    # resolve-conflicts (批量)
    p_resolve_batch = sub.add_parser("resolve-conflicts", help="批量处理冲突")
    p_resolve_batch.add_argument("--ids", required=True, help="逗号分隔的冲突ID列表")
    p_resolve_batch.add_argument("--resolution", required=True)

    # stats
    p_stats = sub.add_parser("stats", help="获取统计")
    p_stats.add_argument("--project", default="default")

    args = parser.parse_args()
    cache = DraftCache(args.db)

    if args.cmd == "list":
        filters = {}
        if args.source:
            filters["source"] = args.source
        if args.type:
            filters["type"] = args.type
        if args.status:
            drafts = cache.get_drafts_by_status(args.status, filters, args.project)
        else:
            # 获取全部草稿（按项目隔离）
            cursor = cache._conn.execute(
                "SELECT * FROM drafts WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (args.project, args.limit, args.offset)
            )
            drafts = [cache._row_to_draft(row) for row in cursor.fetchall()]
        print(json.dumps(drafts, ensure_ascii=False))

    elif args.cmd == "get":
        draft = cache.get_draft_by_id(args.id)
        print(json.dumps(draft, ensure_ascii=False))

    elif args.cmd == "add":
        draft_id = cache.add_draft({
            "source": args.source,
            "type": args.type,
            "title": args.title,
            "content": args.content,
            "metadata": json.loads(args.metadata),
        }, project_id=args.project)
        print(json.dumps({"id": draft_id}, ensure_ascii=False))

    elif args.cmd == "update-status":
        ok = cache.update_draft_status(args.id, args.status, args.score)
        print(json.dumps({"success": ok}, ensure_ascii=False))

    elif args.cmd == "update-draft":
        ok = cache.update_draft(args.id, title=args.title, content=args.content, draft_type=args.type)
        print(json.dumps({"success": ok}, ensure_ascii=False))

    elif args.cmd == "delete-draft":
        total = 0
        deleted_ids = []
        for did in args.id:
            r = cache.delete_draft(did)
            total += r.get("deleted", 0)
            if r.get("deleted"):
                deleted_ids.append(did)
        print(json.dumps({"success": True, "deleted": total, "ids": deleted_ids},
                         ensure_ascii=False))

    elif args.cmd == "list-audit":
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from cache.audit_log import AuditLog
        audit = AuditLog(args.db)
        filters = {
            "page": args.page,
            "pageSize": args.page_size,
        }
        if args.action:
            filters["action"] = args.action
        if args.operator:
            filters["operator"] = args.operator
        if args.target:
            filters["target"] = args.target
        if args.start_time:
            filters["startTime"] = args.start_time
        if args.end_time:
            filters["endTime"] = args.end_time
        result = audit.query(
            action=filters.get("action"),
            operator=filters.get("operator"),
            limit=int(filters.get("pageSize") or 50),
            offset=(int(filters.get("page") or 1) - 1) * int(filters.get("pageSize") or 50),
        )
        audit.close()
        print(json.dumps(result, ensure_ascii=False))

    elif args.cmd == "log-audit":
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from cache.audit_log import AuditLog
        audit = AuditLog(args.db)
        log_id = audit.log(
            action=args.action,
            operator=args.operator,
            target=args.target,
            detail=json.loads(args.detail) if args.detail else None,
            project=args.project,
        )
        audit.close()
        print(json.dumps({"id": log_id}, ensure_ascii=False))

    elif args.cmd == "list-conflicts":
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from cache.conflict_queue import ConflictQueue
        cq = ConflictQueue(args.db)
        filters = {}
        if args.status:
            filters["type"] = args.status
        conflicts = cq.get_pending_conflicts(filters)
        cq.close()
        print(json.dumps(conflicts, ensure_ascii=False))

    elif args.cmd == "resolve-conflict":
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from cache.conflict_queue import ConflictQueue
        cq = ConflictQueue(args.db)
        conflict = cq.get_conflict_by_id(args.id)
        ok = cq.resolve_conflict(args.id, args.resolution, "system") if conflict else False
        # 闭环：把冲突处理决策落到草稿上，避免 conflict 草稿悬挂/卡死
        draft_result = None
        if ok and conflict:
            draft_id = conflict.get("draftId")
            project = conflict.get("project") or "default"
            if args.resolution in ("merge", "overwrite"):
                # 先解除 conflict 卡死，再真正入库（保留质量门控，跳过冲突检测）
                cache.update_draft_status(draft_id, "pending")
                try:
                    from skills.single_commit import single_commit
                    draft_result = single_commit(
                        draft_id, db_path=args.db, operator="web",
                        skip_conflict_check=True, project=project
                    )
                except Exception as e:
                    draft_result = {"success": False, "reason": str(e)}
            elif args.resolution == "discard":
                cache.update_draft_status(draft_id, "discarded")
                draft_result = {"success": True, "status": "discarded"}
        cq.close()
        print(json.dumps({
            "success": ok,
            "resolution": args.resolution if ok else None,
            "resolvedBy": "system" if ok else None,
            "conflict": conflict,
            "draftResult": draft_result
        }, ensure_ascii=False))

    elif args.cmd == "resolve-conflicts":
        import sys as _sys
        _sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from cache.conflict_queue import ConflictQueue
        cq = ConflictQueue(args.db)
        ids = [x.strip() for x in args.ids.split(",") if x.strip()]
        resolved = []
        failed = []
        draft_results = {}
        for cid in ids:
            conflict = cq.get_conflict_by_id(cid)
            if not conflict:
                failed.append(cid)
                continue
            if not cq.resolve_conflict(cid, args.resolution, "system"):
                failed.append(cid)
                continue
            resolved.append(cid)
            draft_id = conflict.get("draftId")
            project = conflict.get("project") or "default"
            if args.resolution in ("merge", "overwrite"):
                # 先解除 conflict 卡死，再真正入库（保留质量门控，跳过冲突检测）
                cache.update_draft_status(draft_id, "pending")
                try:
                    from skills.single_commit import single_commit
                    draft_results[draft_id] = single_commit(
                        draft_id, db_path=args.db, operator="web",
                        skip_conflict_check=True, project=project
                    )
                except Exception as e:
                    draft_results[draft_id] = {"success": False, "reason": str(e)}
            elif args.resolution == "discard":
                cache.update_draft_status(draft_id, "discarded")
                draft_results[draft_id] = {"success": True, "status": "discarded"}
        cq.close()
        print(json.dumps({
            "success": True,
            "total": len(ids),
            "resolvedCount": len(resolved),
            "resolved": resolved,
            "failedCount": len(failed),
            "failed": failed,
            "draftResults": draft_results
        }, ensure_ascii=False))

    elif args.cmd == "stats":
        import sys as _sys
        import json as _json
        _sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from cache.audit_log import AuditLog
        from cache.conflict_queue import ConflictQueue

        # 该项目草稿统计（按 project_id 隔离）
        cursor = cache._conn.execute(
            "SELECT status, COUNT(*) FROM drafts WHERE project_id = ? GROUP BY status",
            (args.project,),
        )
        draft_stats = {row[0]: row[1] for row in cursor.fetchall()}
        cursor = cache._conn.execute(
            "SELECT COUNT(*) FROM drafts WHERE project_id = ?", (args.project,)
        )
        total_drafts = cursor.fetchone()[0]

        cq = ConflictQueue(args.db)
        pending_conflicts = len(cq.get_pending_conflicts(project=args.project))
        cq.close()

        audit = AuditLog(args.db)
        dashboard_stats = audit.get_stats(args.project)
        audit.close()

        # 知识库页面统计：项目私有目录 + 共享目录
        root = Path(__file__).resolve().parent.parent
        brain_dirs = []
        pcfg_path = root / "config" / "projects.json"
        if pcfg_path.exists():
            pcfg = _json.loads(pcfg_path.read_text(encoding="utf-8"))
            proj = next((p for p in pcfg["projects"] if p["id"] == args.project), pcfg["projects"][0])
            brain_dirs.append(root / proj["brainPath"])
            if pcfg.get("sharedBrain"):
                brain_dirs.append(root / pcfg["sharedBrain"])
        else:
            brain_dirs.append(root / "brain")

        total_pages = 0
        total_rules = 0
        total_cases = 0
        total_defects = 0
        for bd in brain_dirs:
            if not bd.exists():
                continue
            for cat_dir in bd.iterdir():
                if not cat_dir.is_dir():
                    continue
                count = len(list(cat_dir.glob("*.md")))
                total_pages += count
                if cat_dir.name == "quality-rules":
                    total_rules += count
                elif cat_dir.name == "test-cases":
                    total_cases += count
                elif cat_dir.name == "defect-experience":
                    total_defects += count

        print(json.dumps({
            "project": args.project,
            "totalDrafts": total_drafts,
            "pendingDrafts": draft_stats.get("pending", 0),
            "approvedDrafts": draft_stats.get("approved", 0),
            "mergedDrafts": draft_stats.get("merged", 0),
            "discardedDrafts": draft_stats.get("discarded", 0),
            "rejectedDrafts": draft_stats.get("rejected", 0),
            "conflictDrafts": draft_stats.get("conflict", 0),
            "totalPages": total_pages,
            "totalRules": total_rules,
            "totalCases": total_cases,
            "totalDefects": total_defects,
            "totalCommits": dashboard_stats.get("commitCount", draft_stats.get("merged", 0)),
            "todayCommits": dashboard_stats.get("today", {}).get("commitCount", 0),
            "weekCommits": dashboard_stats.get("thisWeek", {}).get("commitCount", 0),
            "totalSearches": dashboard_stats.get("searchCount", 0),
            "todaySearches": dashboard_stats.get("today", {}).get("searchCount", 0),
            "weekSearches": dashboard_stats.get("thisWeek", {}).get("searchCount", 0),
            "qualityScoreAvg": dashboard_stats.get("qualityScoreAvg", 0),
            "totalConflicts": pending_conflicts,
        }, ensure_ascii=False))

    cache.close()


if __name__ == "__main__":
    cli()
