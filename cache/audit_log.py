"""审计日志模块：记录系统关键操作（提交、搜索、冲突、删除等）。

存储于独立数据库 cache/audit_log.db（实际与草稿库同库），与草稿缓存分离。
按 project 隔离：每条审计记录归属一个项目（历史记录默认归属 default 项目）。
"""
import json
from datetime import datetime
from sqlite3 import Row
from typing import Optional

try:
    from .beijing_time import BeijingTime
except Exception:  # pragma: no cover
    try:
        from beijing_time import BeijingTime
    except Exception:
        BeijingTime = datetime


class AuditLog:
    """审计日志管理类。"""

    def __init__(self, db_path: str = "cache/audit_log.db"):
        self.db_path = db_path
        self._conn = None
        self._init_schema()

    def _connect(self):
        import sqlite3

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_log (
                    id TEXT PRIMARY KEY,
                    action TEXT NOT NULL,
                    operator TEXT,
                    target TEXT,
                    detail TEXT,
                    created_at TEXT DEFAULT (datetime('now')),
                    project TEXT
                )
                """
            )
            # 项目隔离：审计表增加 project 列（历史记录默认归属 default 项目）
            _cols = [r[1] for r in conn.execute("PRAGMA table_info(audit_log)").fetchall()]
            if "project" not in _cols:
                conn.execute("ALTER TABLE audit_log ADD COLUMN project TEXT")
                conn.execute("UPDATE audit_log SET project='default' WHERE project IS NULL")
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_audit_project ON audit_log(project)"
            )

    def log(
        self,
        action: str,
        operator: str = None,
        target: str = None,
        detail: dict = None,
        timestamp: str = None,
        project: str = None,
    ) -> int:
        record = {
            "action": action,
            "operator": operator,
            "target": target,
            "detail": json.dumps(detail, ensure_ascii=False) if detail is not None else None,
            "created_at": timestamp or datetime.now(BeijingTime()).isoformat(),
            "project": project,
        }
        with self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO audit_log (action, operator, target, detail, created_at, project)
                VALUES (:action, :operator, :target, :detail, :created_at, :project)
                """,
                record,
            )
            return cur.lastrowid

    def query(
        self,
        action: str = None,
        limit: int = 50,
        offset: int = 0,
        operator: str = None,
        project: str = None,
    ) -> list:
        query = "SELECT * FROM audit_log WHERE 1=1"
        params = []
        if action:
            query += " AND action = ?"
            params.append(action)
        if operator:
            query += " AND operator = ?"
            params.append(operator)
        if project:
            query += " AND project = ?"
            params.append(project)
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        with self._connect() as conn:
            cur = conn.cursor()
            cur.execute(query, params)
            rows = cur.fetchall()
            return [dict(r) for r in rows]

    def get_stats(self, project: str = None) -> dict:
        with self._connect() as conn:
            cur = conn.cursor()
            pf = "AND project = ? " if project else ""
            p = (project,) if project else ()

            cur.execute(
                f"SELECT COUNT(*) FROM audit_log WHERE action='commit' {pf}",
                p,
            )
            commit_count = cur.fetchone()[0]
            cur.execute(
                f"SELECT COUNT(*) FROM audit_log WHERE action='search' {pf}",
                p,
            )
            search_count = cur.fetchone()[0]
            cur.execute(
                f"SELECT COUNT(*) FROM audit_log WHERE action='commit' AND created_at >= date('now') {pf}",
                p,
            )
            today_commits = cur.fetchone()[0]
            cur.execute(
                f"SELECT COUNT(*) FROM audit_log WHERE action='commit' AND created_at >= date('now','-7 days') {pf}",
                p,
            )
            week_commits = cur.fetchone()[0]
            cur.execute(
                f"SELECT COUNT(*) FROM audit_log WHERE action='search' AND created_at >= date('now') {pf}",
                p,
            )
            today_searches = cur.fetchone()[0]
            cur.execute(
                f"SELECT COUNT(*) FROM audit_log WHERE action='search' AND created_at >= date('now','-7 days') {pf}",
                p,
            )
            week_searches = cur.fetchone()[0]
            # 质量分来自同库的 drafts 表（按项目隔离）
            quality_score_avg = 0
            try:
                if project:
                    cur.execute(
                        "SELECT AVG(quality_score) FROM drafts WHERE quality_score IS NOT NULL AND project_id = ?",
                        (project,),
                    )
                else:
                    cur.execute("SELECT AVG(quality_score) FROM drafts WHERE quality_score IS NOT NULL")
                row = cur.fetchone()
                if row and row[0] is not None:
                    quality_score_avg = round(row[0], 1)
            except Exception:
                quality_score_avg = 0
            return {
                "commitCount": commit_count,
                "searchCount": search_count,
                "today": {"commitCount": today_commits, "searchCount": today_searches},
                "thisWeek": {"commitCount": week_commits, "searchCount": week_searches},
                "qualityScoreAvg": quality_score_avg,
            }

    def close(self):
        if self._conn is not None:
            self._conn.close()
            self._conn = None
