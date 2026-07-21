"""审计日志与监控大盘测试 - 2026-07-21

覆盖垂直模块7：
1. 审计日志分页查询
2. 审计日志按 action/operator/target 过滤
3. 监控大盘统计指标聚合
4. API 返回结构与前端展示字段一致性
"""

import os
import sys
import unittest
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from cache import AuditLog, ConflictQueue, DraftCache

DB_PATH = str(PROJECT_DIR / "cache" / "drafts_audit_test_0721.db")


class TestAuditLogQuery(unittest.TestCase):
    """TC-AUTO-0721-001: 审计日志查询与过滤"""

    def setUp(self):
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)
        self.audit = AuditLog(DB_PATH)
        self.cache = DraftCache(DB_PATH)

    def tearDown(self):
        self.audit.close()
        self.cache.close()
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)

    def _seed_logs(self):
        for i in range(5):
            self.audit.log("commit", "system", f"draft-{i}", {"mode": "single"})
        for i in range(3):
            self.audit.log("search", "user-1", "brain", {"query": f"q{i}"})
        self.audit.log("conflict_detect", "system", "drafts", {"checkedCount": 5})

    def test_pagination(self):
        """审计日志应支持分页返回 total/page/pageSize/items。"""
        self._seed_logs()
        result = self.audit.query({"page": 1, "pageSize": 3})
        self.assertEqual(result["total"], 9)
        self.assertEqual(result["page"], 1)
        self.assertEqual(result["pageSize"], 3)
        self.assertEqual(len(result["items"]), 3)

    def test_filter_by_action(self):
        """按 action 过滤应只返回匹配日志。"""
        self._seed_logs()
        result = self.audit.query({"action": "commit"})
        self.assertEqual(result["total"], 5)
        for item in result["items"]:
            self.assertEqual(item["action"], "commit")

    def test_filter_by_operator(self):
        """按 operator 过滤应只返回匹配日志。"""
        self._seed_logs()
        result = self.audit.query({"operator": "user-1"})
        self.assertEqual(result["total"], 3)

    def test_filter_by_target(self):
        """按 target 过滤应只返回匹配日志。"""
        self._seed_logs()
        result = self.audit.query({"target": "draft-2"})
        self.assertEqual(result["total"], 1)


class TestDashboardStats(unittest.TestCase):
    """TC-AUTO-0721-002: 监控大盘统计聚合"""

    def setUp(self):
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)
        self.audit = AuditLog(DB_PATH)
        self.cache = DraftCache(DB_PATH)
        self.conflict = ConflictQueue(DB_PATH)

    def tearDown(self):
        self.audit.close()
        self.cache.close()
        self.conflict.close()
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)

    def test_dashboard_stats(self):
        """get_stats 应聚合 commit/search 次数、平均质量分、待处理数量。"""
        # 写入不同状态草稿
        d1 = self.cache.add_draft({
            "source": "human_edit", "type": "test_case",
            "title": "高质量草稿", "content": "# 标题\n内容足够长，满足格式要求。",
            "metadata": {}
        })
        self.cache.update_draft_status(d1, "approved", quality_score=80)

        d2 = self.cache.add_draft({
            "source": "ai_generated", "type": "test_case",
            "title": "低质量草稿", "content": "短",
            "metadata": {}
        })
        self.cache.update_draft_status(d2, "rejected", quality_score=30)

        # 写入审计日志
        self.audit.log("commit", "system", d1, {"mode": "single"})
        self.audit.log("commit", "system", d2, {"mode": "single"})
        self.audit.log("search", "user-1", "brain", {"query": "登录"})

        stats = self.audit.get_stats()
        self.assertEqual(stats["commitCount"], 2)
        self.assertEqual(stats["searchCount"], 1)
        self.assertEqual(stats["pendingDraftCount"], 0)
        self.assertEqual(stats["qualityScoreAvg"], 55)  # (80+30)/2 = 55


class TestAuditApiResponseStructure(unittest.TestCase):
    """TC-AUTO-0721-003: 审计日志 API 返回结构"""

    def test_required_fields(self):
        """审计日志条目应包含 id/action/operator/target/detail/createdAt。"""
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)
        audit = AuditLog(DB_PATH)
        log_id = audit.log("commit", "system", "draft-1", {"mode": "single"})
        result = audit.query({})
        audit.close()
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)

        self.assertEqual(result["total"], 1)
        item = result["items"][0]
        self.assertIn("id", item)
        self.assertIn("action", item)
        self.assertIn("operator", item)
        self.assertIn("target", item)
        self.assertIn("detail", item)
        self.assertIn("createdAt", item)


if __name__ == "__main__":
    unittest.main(verbosity=2)
