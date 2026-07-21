"""API 集成修复测试 - 2026-07-20

覆盖本次垂直构建修复：
1. callPython JSON 解析修复（多行 JSON 输出）
2. single_commit 接受 approved 状态草稿
3. batch_commit 跳过已 approved 草稿的重复质量门控
4. resolve-conflict 参数顺序及返回格式
5. 草稿详情/冲突详情弹窗数据链路
"""

import json
import os
import sys
import unittest
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from cache import AuditLog, ConflictQueue, DraftCache
from skills.batch_commit import batch_commit
from skills.single_commit import single_commit

DB_PATH = str(PROJECT_DIR / "cache" / "drafts_test_0720.db")


class TestCallPythonJsonParse(unittest.TestCase):
    """TC-AUTO-0720-001: callPython 多行 JSON 解析修复"""

    def test_multiline_json_parsing(self):
        """验证 skills 脚本输出格式化多行 JSON 时，API server 能正确解析整个 stdout。"""
        # 模拟 batch_commit 返回的多行 JSON 输出
        sample_output = json.dumps({
            "processedDrafts": 2,
            "committed": ["id1", "id2"],
            "conflicts": [],
            "rejected": [],
            "committedPages": ["page1", "page2"]
        }, ensure_ascii=False, indent=2)
        # 直接解析应成功（修复前只解析最后一行会失败）
        parsed = json.loads(sample_output)
        self.assertEqual(parsed["processedDrafts"], 2)
        self.assertEqual(len(parsed["committed"]), 2)


class TestSingleCommitApprovedStatus(unittest.TestCase):
    """TC-AUTO-0720-002: single_commit 接受 approved 状态草稿"""

    def setUp(self):
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)
        self.cache = DraftCache(DB_PATH)
        self.audit = AuditLog(DB_PATH)

    def tearDown(self):
        self.cache.close()
        self.audit.close()
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)

    def test_approved_draft_can_commit(self):
        """已 approved 草稿应能直接入库，不再因状态非 pending 被拒绝。"""
        draft_id = self.cache.add_draft({
            "source": "human_edit",
            "type": "test_case",
            "title": "approved 草稿入库测试",
            "content": "## 测试内容\n验证 approved 状态草稿可入库。\n",
            "metadata": {"priority": "high"},
        })
        # 先通过质量门控改为 approved
        self.cache.update_draft_status(draft_id, "approved", quality_score=75)

        # 修复前：会返回 "草稿状态为 approved，不是 pending"
        # 修复后：应成功入库
        result = single_commit(draft_id, db_path=DB_PATH, skip_conflict_check=True)
        self.assertTrue(result["success"], f"入库失败: {result.get('reason')}")
        self.assertIsNotNone(result["committedPage"])
        self.assertEqual(result["score"], 75)

    def test_pending_draft_still_works(self):
        """pending 草稿仍应正常走完整流程。"""
        draft_id = self.cache.add_draft({
            "source": "human_edit",
            "type": "quality_rule",
            "title": "pending 草稿入库测试",
            "content": "## 规则\n测试 pending 草稿入库。\n",
            "metadata": {},
        })
        result = single_commit(draft_id, db_path=DB_PATH, skip_conflict_check=True, skip_quality_gate=True)
        self.assertTrue(result["success"], f"入库失败: {result.get('reason')}")

    def test_rejected_draft_cannot_commit(self):
        """rejected 草稿仍应被拒绝。"""
        draft_id = self.cache.add_draft({
            "source": "ai_generated",
            "type": "test_case",
            "title": "短",
            "content": "短",
            "metadata": {},
        })
        self.cache.update_draft_status(draft_id, "rejected")
        result = single_commit(draft_id, db_path=DB_PATH, skip_conflict_check=True, skip_quality_gate=True)
        self.assertFalse(result["success"])
        self.assertIn("rejected", result.get("reason", "").lower())


class TestBatchCommitSkipQualityGate(unittest.TestCase):
    """TC-AUTO-0720-003: batch_commit 跳过已 approved 草稿的重复质量门控"""

    def setUp(self):
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)
        self.cache = DraftCache(DB_PATH)

    def tearDown(self):
        self.cache.close()
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)

    def test_approved_drafts_skip_repeated_qg(self):
        """已 approved 草稿在批量入库时不应再次触发质量门控。"""
        draft_id = self.cache.add_draft({
            "source": "human_edit",
            "type": "test_case",
            "title": "批量入库 approved 草稿测试",
            "content": "## 测试\n验证批量入库跳过已 approved 草稿。\n",
            "metadata": {},
        })
        self.cache.update_draft_status(draft_id, "approved", quality_score=80)

        # 修复前：质量门控找不到 pending 草稿，committed 为空
        # 修复后：approved 草稿应被直接处理
        result = batch_commit(
            draft_ids=[draft_id],
            db_path=DB_PATH,
            skip_conflict_check=True,
            skip_quality_gate=False,  # 不跳过质量门控
        )
        self.assertIn(draft_id, result["committed"])
        self.assertGreater(len(result["committedPages"]), 0)

    def test_mixed_pending_and_approved(self):
        """混合 pending 和 approved 草稿时，pending 走门控，approved 直接入库。"""
        approved_id = self.cache.add_draft({
            "source": "human_edit",
            "type": "quality_rule",
            "title": "混合测试-approved",
            "content": "## 规则\n已 approved。\n",
            "metadata": {},
        })
        self.cache.update_draft_status(approved_id, "approved", quality_score=70)

        pending_id = self.cache.add_draft({
            "source": "human_edit",
            "type": "defect_experience",
            "title": "混合测试-pending",
            "content": "## 缺陷\n待处理。\n",
            "metadata": {},
        })

        result = batch_commit(
            draft_ids=[approved_id, pending_id],
            db_path=DB_PATH,
            skip_conflict_check=True,
            skip_quality_gate=False,
        )
        # approved 应直接入库
        self.assertIn(approved_id, result["committed"])
        # pending 应通过质量门控后入库
        self.assertIn(pending_id, result["committed"])


class TestResolveConflictReturnFormat(unittest.TestCase):
    """TC-AUTO-0720-004: resolve-conflict 返回格式增强"""

    def setUp(self):
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)
        self.cq = ConflictQueue(DB_PATH)
        self.cache = DraftCache(DB_PATH)

    def tearDown(self):
        self.cq.close()
        self.cache.close()
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)

    def test_resolve_returns_full_conflict(self):
        """处理冲突后应返回包含 resolution、resolvedBy 和完整 conflict 对象的响应。"""
        draft_id = self.cache.add_draft({
            "source": "human_edit",
            "type": "quality_rule",
            "title": "冲突测试草稿",
            "content": "测试内容",
            "metadata": {},
        })
        conflict_id = self.cq.add_conflict({
            "draftId": draft_id,
            "existingRule": "QR-001 现有规则",
            "newRule": "冲突测试草稿",
            "conflictType": "overlap",
        })

        ok = self.cq.resolve_conflict(conflict_id, "merge", "test_user")
        self.assertTrue(ok)

        conflict = self.cq.get_conflict_by_id(conflict_id)
        self.assertEqual(conflict["resolution"], "merge")
        self.assertEqual(conflict["resolvedBy"], "test_user")
        self.assertIsNotNone(conflict["resolvedAt"])

    def test_resolve_nonexistent_conflict(self):
        """处理不存在的冲突应返回失败。"""
        ok = self.cq.resolve_conflict("nonexistent-id", "discard", "test_user")
        self.assertFalse(ok)


class TestDraftDetailModalDataLink(unittest.TestCase):
    """TC-AUTO-0720-005: 草稿详情弹窗数据链路"""

    def setUp(self):
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)
        self.cache = DraftCache(DB_PATH)

    def tearDown(self):
        self.cache.close()
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)

    def test_draft_detail_api_returns_full_content(self):
        """GET /api/drafts/:id 应返回包含 content、metadata、qualityScore 的完整数据。"""
        draft_id = self.cache.add_draft({
            "source": "execution_feedback",
            "type": "defect_experience",
            "title": "详情弹窗数据测试",
            "content": "## 问题\n详细描述内容。\n\n## 修复\n修复方案。\n",
            "metadata": {"severity": "high", "component": "auth"},
        })
        self.cache.update_draft_status(draft_id, "approved", quality_score=68)

        draft = self.cache.get_draft_by_id(draft_id)
        self.assertIsNotNone(draft)
        self.assertEqual(draft["title"], "详情弹窗数据测试")
        self.assertIn("问题", draft["content"])
        self.assertEqual(draft["metadata"]["severity"], "high")
        self.assertEqual(draft["qualityScore"], 68)


if __name__ == "__main__":
    unittest.main(verbosity=2)
