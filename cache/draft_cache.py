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
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
            CREATE INDEX IF NOT EXISTS idx_drafts_type ON drafts(type);
            CREATE INDEX IF NOT EXISTS idx_drafts_source ON drafts(source);
            CREATE INDEX IF NOT EXISTS idx_drafts_created ON drafts(created_at);
            """
        )
        self._conn.commit()

    def close(self) -> None:
        """关闭数据库连接。"""
        self._conn.close()

    def add_draft(self, draft: dict[str, Any]) -> str:
        """添加草稿。

        Args:
            draft: 草稿对象，包含 source/type/title/content/metadata/status 等字段

        Returns:
            新增草稿的 ID
        """
        draft_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        self._conn.execute(
            """
            INSERT INTO drafts (id, source, type, title, content, metadata, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                draft_id,
                draft["source"],
                draft["type"],
                draft["title"],
                draft["content"],
                json.dumps(draft["metadata"]) if draft.get("metadata") else None,
                draft.get("status", "pending"),
                now,
                now,
            ),
        )
        self._conn.commit()
        return draft_id

    def get_drafts_by_status(
        self, status: str = "pending", filters: Optional[dict[str, str]] = None
    ) -> list[dict[str, Any]]:
        """获取指定状态的草稿列表。

        Args:
            status: 草稿状态
            filters: 额外过滤条件，支持 source/type

        Returns:
            草稿列表
        """
        filters = filters or {}
        where_clauses = ["status = ?"]
        params: list[Any] = [status]

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

    # update-status
    p_up = sub.add_parser("update-status", help="更新草稿状态")
    p_up.add_argument("--id", required=True)
    p_up.add_argument("--status", required=True)
    p_up.add_argument("--score", type=int, default=None)

    # list-audit
    p_audit = sub.add_parser("list-audit", help="列出审计日志")
    p_audit.add_argument("--action", default=None)
    p_audit.add_argument("--operator", default=None)
    p_audit.add_argument("--target", default=None)
    p_audit.add_argument("--start-time", default=None)
    p_audit.add_argument("--end-time", default=None)
    p_audit.add_argument("--page", type=int, default=1)
    p_audit.add_argument("--page-size", type=int, default=20)

    # list-conflicts
    p_conflicts = sub.add_parser("list-conflicts", help="列出冲突")
    p_conflicts.add_argument("--status", default=None)
    p_conflicts.add_argument("--limit", type=int, default=100)

    # resolve-conflict
    p_resolve = sub.add_parser("resolve-conflict", help="处理冲突")
    p_resolve.add_argument("--id", required=True)
    p_resolve.add_argument("--resolution", required=True)

    # stats
    p_stats = sub.add_parser("stats", help="获取统计")

    args = parser.parse_args()
    cache = DraftCache(args.db)

    if args.cmd == "list":
        filters = {}
        if args.source:
            filters["source"] = args.source
        if args.type:
            filters["type"] = args.type
        if args.status:
            drafts = cache.get_drafts_by_status(args.status, filters)
        else:
            # 获取全部草稿
            cursor = cache._conn.execute(
                "SELECT * FROM drafts ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (args.limit, args.offset)
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
        })
        print(json.dumps({"id": draft_id}, ensure_ascii=False))

    elif args.cmd == "update-status":
        ok = cache.update_draft_status(args.id, args.status, args.score)
        print(json.dumps({"success": ok}, ensure_ascii=False))

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
        result = audit.query(filters)
        audit.close()
        print(json.dumps(result, ensure_ascii=False))

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
        ok = cq.resolve_conflict(args.id, args.resolution, "system")
        # 返回处理后的冲突详情
        conflict = cq.get_conflict_by_id(args.id) if ok else None
        cq.close()
        print(json.dumps({
            "success": ok,
            "resolution": args.resolution if ok else None,
            "resolvedBy": "system" if ok else None,
            "conflict": conflict
        }, ensure_ascii=False))

    elif args.cmd == "stats":
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from cache.audit_log import AuditLog
        from cache.conflict_queue import ConflictQueue

        cursor = cache._conn.execute("SELECT status, COUNT(*) FROM drafts GROUP BY status")
        draft_stats = {row[0]: row[1] for row in cursor.fetchall()}
        cursor = cache._conn.execute("SELECT COUNT(*) FROM drafts")
        total_drafts = cursor.fetchone()[0]

        cq = ConflictQueue(args.db)
        pending_conflicts = len(cq.get_pending_conflicts())
        cq.close()

        audit = AuditLog(args.db)
        dashboard_stats = audit.get_stats()
        audit.close()

        # 统计 brain 目录页面数量
        brain_repo = Path(args.db).parent.parent / "brain" if args.db else Path(__file__).parent.parent / "brain"
        total_pages = 0
        total_rules = 0
        total_cases = 0
        total_defects = 0
        if brain_repo.exists():
            for cat_dir in brain_repo.iterdir():
                if not cat_dir.is_dir():
                    continue
                md_files = list(cat_dir.glob("*.md"))
                count = len(md_files)
                total_pages += count
                if cat_dir.name == "quality-rules":
                    total_rules = count
                elif cat_dir.name == "test-cases":
                    total_cases = count
                elif cat_dir.name == "defect-experience":
                    total_defects = count

        print(json.dumps({
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
