"""冲突队列管理器，负责 conflicts 表的增删改查。"""

import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

DB_PATH = Path(__file__).parent.parent / "cache" / "drafts.db"


class ConflictQueue:
    """冲突队列管理器。"""

    def __init__(self, db_path: Optional[str] = None):
        """创建 ConflictQueue 实例。

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
            CREATE TABLE IF NOT EXISTS conflicts (
                id TEXT PRIMARY KEY,
                draft_id TEXT NOT NULL,
                existing_rule TEXT NOT NULL,
                new_rule TEXT NOT NULL,
                conflict_type TEXT NOT NULL,
                resolution TEXT,
                resolved_by TEXT,
                resolved_at TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (draft_id) REFERENCES drafts(id)
            );

            CREATE INDEX IF NOT EXISTS idx_conflicts_draft ON conflicts(draft_id);
            CREATE INDEX IF NOT EXISTS idx_conflicts_resolution ON conflicts(resolution);
            CREATE INDEX IF NOT EXISTS idx_conflicts_created ON conflicts(created_at);
            """
        )
        self._conn.commit()
        # 项目隔离：conflicts 增加 project 列（历史记录默认归属 default 项目）
        _cols = [r[1] for r in self._conn.execute("PRAGMA table_info(conflicts)").fetchall()]
        if "project" not in _cols:
            self._conn.execute("ALTER TABLE conflicts ADD COLUMN project TEXT")
            self._conn.execute("UPDATE conflicts SET project='default' WHERE project IS NULL")
            self._conn.commit()

    def close(self) -> None:
        """关闭数据库连接。"""
        self._conn.close()

    def add_conflict(self, conflict: dict[str, Any], project: str = None) -> str:
        """添加冲突记录。

        Args:
            conflict: 冲突对象，包含 draftId/existingRule/newRule/conflictType
            project: 所属项目 ID（用于隔离）

        Returns:
            冲突记录 ID
        """
        conflict_id = str(uuid.uuid4())
        self._conn.execute(
            """
            INSERT INTO conflicts (id, draft_id, existing_rule, new_rule, conflict_type, created_at, project)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                conflict_id,
                conflict["draftId"],
                conflict["existingRule"],
                conflict["newRule"],
                conflict["conflictType"],
                datetime.now().isoformat(),
                project,
            ),
        )
        self._conn.commit()
        return conflict_id

    def get_pending_conflicts(
        self, filters: Optional[dict[str, str]] = None, project: str = None
    ) -> list[dict[str, Any]]:
        """获取未处理冲突列表。

        Args:
            filters: 过滤条件，支持 type
            project: 项目 ID（按项目隔离；None 表示全部）

        Returns:
            冲突列表
        """
        filters = filters or {}
        where_clauses = ["resolution IS NULL"]
        params: list[Any] = []

        if "type" in filters:
            where_clauses.append("conflict_type = ?")
            params.append(filters["type"])
        if project:
            where_clauses.append("project = ?")
            params.append(project)

        sql = f"SELECT * FROM conflicts WHERE {' AND '.join(where_clauses)} ORDER BY created_at DESC"
        cursor = self._conn.execute(sql, params)
        return [self._row_to_conflict(row) for row in cursor.fetchall()]

    def get_conflict_by_id(self, conflict_id: str) -> Optional[dict[str, Any]]:
        """根据 ID 获取冲突。

        Args:
            conflict_id: 冲突 ID

        Returns:
            冲突对象，不存在返回 None
        """
        cursor = self._conn.execute(
            "SELECT * FROM conflicts WHERE id = ?", (conflict_id,)
        )
        row = cursor.fetchone()
        return self._row_to_conflict(row) if row else None

    def resolve_conflict(
        self, conflict_id: str, resolution: str, operator: str
    ) -> bool:
        """处理冲突。

        Args:
            conflict_id: 冲突 ID
            resolution: 处理方式 merge/overwrite/discard
            operator: 处理人

        Returns:
            是否处理成功
        """
        cursor = self._conn.execute(
            """
            UPDATE conflicts
            SET resolution = ?, resolved_by = ?, resolved_at = ?
            WHERE id = ? AND resolution IS NULL
            """,
            (resolution, operator, datetime.now().isoformat(), conflict_id),
        )
        self._conn.commit()
        return cursor.rowcount > 0

    def get_conflicts_by_draft_id(self, draft_id: str) -> list[dict[str, Any]]:
        """根据草稿 ID 获取关联冲突。

        Args:
            draft_id: 草稿 ID

        Returns:
            冲突列表
        """
        cursor = self._conn.execute(
            "SELECT * FROM conflicts WHERE draft_id = ? ORDER BY created_at DESC",
            (draft_id,),
        )
        return [self._row_to_conflict(row) for row in cursor.fetchall()]

    def _row_to_conflict(self, row: sqlite3.Row) -> dict[str, Any]:
        """将数据库行转换为冲突对象。"""
        return {
            "id": row["id"],
            "draftId": row["draft_id"],
            "existingRule": row["existing_rule"],
            "newRule": row["new_rule"],
            "conflictType": row["conflict_type"],
            "resolution": row["resolution"],
            "resolvedBy": row["resolved_by"],
            "resolvedAt": row["resolved_at"],
            "createdAt": row["created_at"],
            "project": row["project"],
        }
