#!/usr/bin/env python3
"""异常告警监控脚本。

监控冲突堆积、入库失败、向量嵌入异常，输出到告警日志文件。
"""

import json
import os
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

DB_PATH = os.environ.get("CACHE_DB_PATH", str(PROJECT_DIR / "cache" / "drafts.db"))
ALERT_LOG_PATH = os.environ.get("ALERT_LOG_PATH", str(PROJECT_DIR / "cache" / "alerts.log"))

CONFLICT_THRESHOLD = int(os.environ.get("CONFLICT_ALERT_THRESHOLD", "10"))
COMMIT_FAIL_THRESHOLD = int(os.environ.get("COMMIT_FAIL_ALERT_THRESHOLD", "5"))
EMBED_FAIL_THRESHOLD = int(os.environ.get("EMBED_FAIL_ALERT_THRESHOLD", "3"))


def write_alert(level: str, category: str, message: str, detail: dict):
    """写入告警日志。"""
    timestamp = datetime.now().isoformat()
    line = f"[{timestamp}] [{level}] [{category}] {message} | {json.dumps(detail, ensure_ascii=False)}\n"
    with open(ALERT_LOG_PATH, "a", encoding="utf-8") as f:
        f.write(line)
    print(f"[alert-monitor] {line.strip()}")


def check_conflicts(conn: sqlite3.Connection):
    """检查未处理冲突堆积。"""
    cursor = conn.execute("SELECT COUNT(*) as count FROM conflicts WHERE resolution IS NULL")
    count = cursor.fetchone()["count"]
    if count >= CONFLICT_THRESHOLD:
        write_alert(
            "WARNING",
            "conflict_pileup",
            f"未处理冲突数量 {count}，超过阈值 {CONFLICT_THRESHOLD}",
            {"count": count},
        )


def check_commit_failures(conn: sqlite3.Connection):
    """检查近 1 小时入库失败次数。"""
    one_hour_ago = (datetime.now() - timedelta(hours=1)).isoformat()
    cursor = conn.execute(
        "SELECT COUNT(*) as count FROM audit_log "
        "WHERE action = 'commit' AND detail LIKE '%failed%' AND created_at > ?",
        (one_hour_ago,),
    )
    count = cursor.fetchone()["count"]
    if count >= COMMIT_FAIL_THRESHOLD:
        write_alert(
            "ERROR",
            "commit_failure",
            f"近 1 小时入库失败 {count} 次，超过阈值 {COMMIT_FAIL_THRESHOLD}",
            {"count": count},
        )


def check_embed_failures():
    """检查向量嵌入失败次数（简化为环境变量模拟）。"""
    embed_fail_count = int(os.environ.get("EMBED_FAIL_COUNT", "0"))
    if embed_fail_count >= EMBED_FAIL_THRESHOLD:
        write_alert(
            "ERROR",
            "embed_failure",
            f"向量嵌入失败 {embed_fail_count} 次，超过阈值 {EMBED_FAIL_THRESHOLD}",
            {"count": embed_fail_count},
        )


def run_alert_monitor():
    """执行告警监控检查。"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        check_conflicts(conn)
        check_commit_failures(conn)
        check_embed_failures()
        print("[alert-monitor] 监控检查完成")
    finally:
        conn.close()


if __name__ == "__main__":
    run_alert_monitor()
