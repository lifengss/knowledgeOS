#!/usr/bin/env python3
"""测试过期草稿清理脚本 cleanup_stale_drafts.py。

覆盖场景：
- 正常清理：超过阈值的 pending 草稿被标记为 expired
- 无过期草稿：无数据变更
- dry-run 模式：仅预览不清理
- 审计日志：清理后写入 audit_log
"""

import json
import sqlite3
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from cache.draft_cache import DraftCache
from cache.audit_log import AuditLog
from scripts.cleanup_stale_drafts import cleanup_stale_drafts


class TestCleanupStaleDrafts:
    def setup_method(self):
        self.db_fd, self.db_path = tempfile.mkstemp(suffix=".db")
        self.cache = DraftCache(self.db_path)
        self.audit = AuditLog(self.db_path)

    def teardown_method(self):
        self.cache.close()
        self.audit.close()
        import os

        os.close(self.db_fd)
        os.unlink(self.db_path)

    def _add_draft(self, status="pending", days_ago=0):
        """辅助方法：添加草稿。"""
        created = (datetime.now() - timedelta(days=days_ago)).isoformat()
        draft_id = self.cache.add_draft(
            {
                "source": "human_edit",
                "type": "quality_rule",
                "title": f"测试草稿-{days_ago}天前",
                "content": "测试内容",
                "metadata": {"test": True},
            }
        )
        # 手动修改 created_at
        self.cache._conn.execute(
            "UPDATE drafts SET created_at = ? WHERE id = ?", (created, draft_id)
        )
        self.cache._conn.commit()
        if status != "pending":
            self.cache.update_draft_status(draft_id, status)
        return draft_id

    def test_expires_old_pending_drafts(self):
        """超过 30 天的 pending 草稿应被标记为 expired。"""
        old_id = self._add_draft(status="pending", days_ago=31)
        fresh_id = self._add_draft(status="pending", days_ago=5)

        result = cleanup_stale_drafts(self.db_path, days=30)

        assert result["success"] is True
        assert result["expiredCount"] == 1
        assert any(d["id"] == old_id for d in result["expiredDrafts"])

        old = self.cache.get_draft_by_id(old_id)
        fresh = self.cache.get_draft_by_id(fresh_id)
        assert old["status"] == "expired"
        assert fresh["status"] == "pending"

    def test_no_expiry_when_none_stale(self):
        """无过期草稿时不应产生变更。"""
        self._add_draft(status="pending", days_ago=5)

        result = cleanup_stale_drafts(self.db_path, days=30)

        assert result["expiredCount"] == 0
        assert result["expiredDrafts"] == []

    def test_does_not_touch_non_pending(self):
        """非 pending 状态的草稿不应被清理。"""
        approved_id = self._add_draft(status="approved", days_ago=31)
        merged_id = self._add_draft(status="merged", days_ago=31)

        result = cleanup_stale_drafts(self.db_path, days=30)

        assert result["expiredCount"] == 0
        assert self.cache.get_draft_by_id(approved_id)["status"] == "approved"
        assert self.cache.get_draft_by_id(merged_id)["status"] == "merged"

    def test_writes_audit_log(self):
        """清理后应写入 audit_log。"""
        self._add_draft(status="pending", days_ago=31)

        cleanup_stale_drafts(self.db_path, days=30)

        logs = self.audit.query({"action": "cleanup", "pageSize": 10})
        assert logs["total"] >= 1
        entry = logs["items"][0]
        assert entry["action"] == "cleanup"
        assert entry["operator"] == "system"
        assert entry["detail"]["staleDays"] == 30
        assert entry["detail"]["expiredCount"] == 1

    def test_dry_run_does_not_modify(self):
        """dry-run 模式不应修改数据。"""
        self._add_draft(status="pending", days_ago=31)

        # 直接调用 dry-run 逻辑
        import subprocess

        proc = subprocess.run(
            [sys.executable, str(PROJECT_DIR / "scripts" / "cleanup_stale_drafts.py"), "--db", self.db_path, "--days", "30", "--dry-run"],
            capture_output=True,
            text=True,
        )
        assert proc.returncode == 0
        output = json.loads(proc.stdout.strip().split("\n")[-1])
        assert output["dryRun"] is True
        assert output["wouldExpire"] == 1

        # 确认状态未变
        cursor = self.cache._conn.execute("SELECT status FROM drafts WHERE status = 'pending'")
        assert len(cursor.fetchall()) == 1
