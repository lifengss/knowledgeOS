"""审计日志管理器，负责 audit_log 表的写入与查询。"""

import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

DB_PATH = Path(__file__).parent.parent / "cache" / "drafts.db"


class AuditLog:
    """审计日志管理器。"""

    def __init__(self, db_path: Optional[str] = None):
        """创建 AuditLog 实例。

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
            CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                action TEXT NOT NULL,
                operator TEXT NOT NULL,
                target TEXT,
                detail TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
            CREATE INDEX IF NOT EXISTS idx_audit_operator ON audit_log(operator);
            CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
            """
        )
        self._conn.commit()

    def close(self) -> None:
        """关闭数据库连接。"""
        self._conn.close()

    def log(
        self,
        action: str,
        operator: str,
        target: Optional[str] = None,
        detail: Optional[dict[str, Any]] = None,
    ) -> str:
        """记录操作日志。

        Args:
            action: 操作类型
            operator: 操作者
            target: 操作对象
            detail: 详情 JSON

        Returns:
            日志 ID
        """
        log_id = str(uuid.uuid4())
        self._conn.execute(
            """
            INSERT INTO audit_log (id, action, operator, target, detail, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                log_id,
                action,
                operator,
                target,
                json.dumps(detail) if detail else None,
                datetime.now().isoformat(),
            ),
        )
        self._conn.commit()
        return log_id

    def query(self, filters: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        """查询日志。

        Args:
            filters: 过滤条件，支持 action/operator/target/startTime/endTime/page/pageSize

        Returns:
            { total, page, pageSize, items }
        """
        filters = filters or {}
        where_clauses: list[str] = []
        params: list[Any] = []

        if "action" in filters:
            where_clauses.append("action = ?")
            params.append(filters["action"])
        if "operator" in filters:
            where_clauses.append("operator = ?")
            params.append(filters["operator"])
        if "target" in filters:
            where_clauses.append("target = ?")
            params.append(filters["target"])
        if "startTime" in filters:
            where_clauses.append("created_at >= ?")
            params.append(filters["startTime"])
        if "endTime" in filters:
            where_clauses.append("created_at <= ?")
            params.append(filters["endTime"])

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        count_cursor = self._conn.execute(
            f"SELECT COUNT(*) as total FROM audit_log {where_sql}", params
        )
        total = count_cursor.fetchone()["total"]

        page = max(1, filters.get("page", 1))
        page_size = max(1, min(100, filters.get("pageSize", 20)))
        offset = (page - 1) * page_size

        cursor = self._conn.execute(
            f"""
            SELECT * FROM audit_log {where_sql}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            [*params, page_size, offset],
        )

        return {
            "total": total,
            "page": page,
            "pageSize": page_size,
            "items": [self._row_to_audit_entry(row) for row in cursor.fetchall()],
        }

    def get_stats(self) -> dict[str, Any]:
        """获取全局统计面板数据。

        Returns:
            统计指标
        """
        commit_count = self._conn.execute(
            "SELECT COUNT(*) as count FROM audit_log WHERE action = 'commit'"
        ).fetchone()["count"]

        today_commit = self._conn.execute(
            "SELECT COUNT(*) as count FROM audit_log WHERE action = 'commit' AND created_at >= date('now')"
        ).fetchone()["count"]

        week_commit = self._conn.execute(
            "SELECT COUNT(*) as count FROM audit_log WHERE action = 'commit' AND created_at >= date('now', '-7 days')"
        ).fetchone()["count"]

        search_count = self._conn.execute(
            "SELECT COUNT(*) as count FROM audit_log WHERE action = 'search'"
        ).fetchone()["count"]

        today_search = self._conn.execute(
            "SELECT COUNT(*) as count FROM audit_log WHERE action = 'search' AND created_at >= date('now')"
        ).fetchone()["count"]

        week_search = self._conn.execute(
            "SELECT COUNT(*) as count FROM audit_log WHERE action = 'search' AND created_at >= date('now', '-7 days')"
        ).fetchone()["count"]

        quality_avg = self._conn.execute(
            "SELECT AVG(quality_score) as avg FROM drafts WHERE quality_score IS NOT NULL"
        ).fetchone()["avg"]

        pending_drafts = self._conn.execute(
            "SELECT COUNT(*) as count FROM drafts WHERE status = 'pending'"
        ).fetchone()["count"]

        pending_conflicts = self._conn.execute(
            "SELECT COUNT(*) as count FROM conflicts WHERE resolution IS NULL"
        ).fetchone()["count"]

        return {
            "commitCount": commit_count,
            "today": {"commitCount": today_commit, "searchCount": today_search},
            "thisWeek": {"commitCount": week_commit, "searchCount": week_search},
            "searchCount": search_count,
            "qualityScoreAvg": round(quality_avg or 0),
            "pendingDraftCount": pending_drafts,
            "pendingConflictCount": pending_conflicts,
        }

    def _row_to_audit_entry(self, row: sqlite3.Row) -> dict[str, Any]:
        """将数据库行转换为审计日志对象。"""
        return {
            "id": row["id"],
            "action": row["action"],
            "operator": row["operator"],
            "target": row["target"],
            "detail": json.loads(row["detail"]) if row["detail"] else None,
            "createdAt": row["created_at"],
        }
