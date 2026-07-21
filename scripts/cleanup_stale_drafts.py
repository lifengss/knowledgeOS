#!/usr/bin/env python3
"""过期草稿定时清理脚本。

扫描超过阈值的 pending 草稿，标记为 expired，并写入 audit_log。
可通过 `python scripts/cleanup_stale_drafts.py` 独立执行。
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from cache.draft_cache import DraftCache
from cache.audit_log import AuditLog

DB_PATH = os.environ.get("CACHE_DB_PATH", str(PROJECT_DIR / "cache" / "drafts.db"))
DEFAULT_STALE_DAYS = int(os.environ.get("STALE_DRAFT_DAYS", "30"))


def cleanup_stale_drafts(db_path: str = DB_PATH, days: int = DEFAULT_STALE_DAYS) -> dict:
    """清理过期草稿。

    Args:
        db_path: SQLite 数据库路径
        days: 过期天数阈值

    Returns:
        清理结果统计
    """
    cache = DraftCache(db_path)
    audit = AuditLog(db_path)

    try:
        # 查询即将过期的草稿（用于日志）
        cursor = cache._conn.execute(
            """
            SELECT id, title, created_at FROM drafts
            WHERE status = 'pending' AND created_at < datetime('now', '-{} days')
            """.format(days)
        )
        stale_drafts = [
            {"id": row[0], "title": row[1], "createdAt": row[2]}
            for row in cursor.fetchall()
        ]

        # 执行清理：标记为 expired
        count = cache.cleanup_stale_drafts(days)

        # 写入审计日志
        if count > 0:
            audit.log(
                action="cleanup",
                operator="system",
                target="drafts",
                detail={
                    "staleDays": days,
                    "expiredCount": count,
                    "expiredDrafts": stale_drafts,
                },
            )

        result = {
            "success": True,
            "expiredCount": count,
            "staleDays": days,
            "expiredDrafts": stale_drafts,
            "timestamp": datetime.now().isoformat(),
        }
        print(json.dumps(result, ensure_ascii=False))
        return result
    finally:
        cache.close()
        audit.close()


def main():
    parser = argparse.ArgumentParser(description="过期草稿清理脚本")
    parser.add_argument("--db", default=DB_PATH, help="SQLite 数据库路径")
    parser.add_argument(
        "--days",
        type=int,
        default=DEFAULT_STALE_DAYS,
        help="过期天数阈值（默认 30 天）",
    )
    parser.add_argument("--dry-run", action="store_true", help="仅预览，不实际清理")
    args = parser.parse_args()

    if args.dry_run:
        cache = DraftCache(args.db)
        try:
            cursor = cache._conn.execute(
                """
                SELECT id, title, created_at FROM drafts
                WHERE status = 'pending' AND created_at < datetime('now', '-{} days')
                """.format(args.days)
            )
            stale = [
                {"id": row[0], "title": row[1], "createdAt": row[2]}
                for row in cursor.fetchall()
            ]
            print(
                json.dumps(
                    {
                        "dryRun": True,
                        "wouldExpire": len(stale),
                        "staleDays": args.days,
                        "drafts": stale,
                    },
                    ensure_ascii=False,
                )
            )
        finally:
            cache.close()
        return

    cleanup_stale_drafts(args.db, args.days)


if __name__ == "__main__":
    main()
