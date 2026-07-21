#!/usr/bin/env python3
"""缓冲层数据库初始化脚本。

创建 drafts / conflicts / audit_log 三表及索引，
可通过 `python scripts/init_cache.py` 独立执行。
"""

import os
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from cache import AuditLog, ConflictQueue, DraftCache

DB_PATH = os.environ.get("CACHE_DB_PATH", str(PROJECT_DIR / "cache" / "drafts.db"))


def init_cache():
    """初始化三表，验证表结构。"""
    print(f"[init-cache] 初始化数据库: {DB_PATH}")

    draft_cache = DraftCache(DB_PATH)
    conflict_queue = ConflictQueue(DB_PATH)
    audit_log = AuditLog(DB_PATH)

    try:
        # 验证三表存在
        import sqlite3

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = [row[0] for row in cursor.fetchall()]
        conn.close()

        expected = {"drafts", "conflicts", "audit_log"}
        actual = set(tables)
        missing = expected - actual
        if missing:
            print(f"[init-cache] 错误：缺少表 {missing}")
            sys.exit(1)

        print(f"[init-cache] 三表创建成功: {', '.join(sorted(actual))}")

        # 验证索引
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
        indexes = [row[0] for row in cursor.fetchall()]
        conn.close()
        print(f"[init-cache] 索引创建成功: {', '.join(indexes)}")
        print("[init-cache] 初始化完成")
    finally:
        draft_cache.close()
        conflict_queue.close()
        audit_log.close()


if __name__ == "__main__":
    init_cache()
