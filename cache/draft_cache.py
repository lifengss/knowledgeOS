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
