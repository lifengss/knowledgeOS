"""L2 缓冲层扩展测试。

覆盖测试大纲中的 TC-L2-03/11/13/14/15。
与 test_cache.py 互补，形成缓冲层完整测试覆盖。
"""

import os
import sqlite3
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from cache import AuditLog, ConflictQueue, DraftCache


@pytest.fixture
def db_path():
    """创建临时数据库文件。"""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    yield path
    os.unlink(path)


@pytest.fixture
def draft_cache(db_path):
    cache = DraftCache(db_path)
    yield cache
    cache.close()


@pytest.fixture
def conflict_queue(db_path):
    queue = ConflictQueue(db_path)
    yield queue
    queue.close()


@pytest.fixture
def audit_log(db_path):
    log = AuditLog(db_path)
    yield log
    log.close()


class TestDraftSource:
    """TC-L2-02/03: 草稿来源验证。"""

    def test_human_edit_source(self, draft_cache):
        """TC-L2-02: 人工编辑来源草稿写入。"""
        draft_id = draft_cache.add_draft(
            {
                "source": "human_edit",
                "type": "quality_rule",
                "title": "人工编辑：密码复杂度规则",
                "content": "# 密码复杂度\n\n密码必须包含大小写字母、数字和特殊字符，长度不少于 8 位。",
                "metadata": {"editor": "user-1", "related_cases": ["TC-001"]},
            }
        )
        draft = draft_cache.get_draft_by_id(draft_id)
        assert draft["source"] == "human_edit"
        assert draft["type"] == "quality_rule"
        assert draft["status"] == "pending"

    def test_execution_feedback_source(self, draft_cache):
        """TC-L2-03: 执行回流来源草稿写入。"""
        draft_id = draft_cache.add_draft(
            {
                "source": "execution_feedback",
                "type": "defect_experience",
                "title": "执行回流：订单数量为 0 时的处理",
                "content": "# 边界值缺陷\n\n订单数量为 0 时应返回参数错误，而非 500 内部错误。",
                "metadata": {"report_id": "RPT-20260715", "failure_count": 3},
            }
        )
        draft = draft_cache.get_draft_by_id(draft_id)
        assert draft["source"] == "execution_feedback"
        assert draft["type"] == "defect_experience"
        assert draft["metadata"]["failure_count"] == 3

    def test_ai_generated_source(self, draft_cache):
        """AI 生成来源草稿写入。"""
        draft_id = draft_cache.add_draft(
            {
                "source": "ai_generated",
                "type": "test_case",
                "title": "AI 生成：用户登录功能测试",
                "content": "# 用户登录测试\n\n## Compiled Truth\n\n验证用户登录功能正常。\n\n## Timeline\n\n- 2026-07-15: 初始生成",
                "metadata": {"generator": "case-generator-v1"},
            }
        )
        draft = draft_cache.get_draft_by_id(draft_id)
        assert draft["source"] == "ai_generated"


class TestPersistence:
    """TC-L2-11: 缓冲层持久化（重启不丢失）。"""

    def test_data_survives_reconnect(self, db_path):
        """关闭连接后重新打开，数据应完整保留。"""
        # 第一阶段：写入数据
        cache1 = DraftCache(db_path)
        id1 = cache1.add_draft(
            {
                "source": "human_edit",
                "type": "quality_rule",
                "title": "持久化测试规则",
                "content": "测试内容",
            }
        )
        cache1.close()

        # 第二阶段：重新连接查询
        cache2 = DraftCache(db_path)
        draft = cache2.get_draft_by_id(id1)
        assert draft is not None
        assert draft["title"] == "持久化测试规则"

        pending = cache2.get_drafts_by_status("pending")
        assert len(pending) >= 1
        cache2.close()

    def test_multiple_tables_persist(self, db_path):
        """多表数据持久化验证。"""
        cache = DraftCache(db_path)
        queue = ConflictQueue(db_path)
        log = AuditLog(db_path)

        draft_id = cache.add_draft(
            {"source": "human_edit", "type": "quality_rule", "title": "多表持久化", "content": "内容"}
        )
        conflict_id = queue.add_conflict(
            {
                "draftId": draft_id,
                "existingRule": "已有规则",
                "newRule": "新规则",
                "conflictType": "overlap",
            }
        )
        log_id = log.log("generate", "system", draft_id, {"test": True})

        cache.close()
        queue.close()
        log.close()

        # 重新连接验证
        cache2 = DraftCache(db_path)
        queue2 = ConflictQueue(db_path)
        log2 = AuditLog(db_path)

        assert cache2.get_draft_by_id(draft_id) is not None
        assert queue2.get_conflict_by_id(conflict_id) is not None
        result = log2.query({"action": "generate"})
        assert result["total"] >= 1

        cache2.close()
        queue2.close()
        log2.close()


class TestStaleCleanup:
    """TC-L2-13: 过期草稿定时清理。"""

    def test_cleanup_stale_drafts(self, db_path):
        """超过阈值的 pending 草稿应被标记为 expired。"""
        cache = DraftCache(db_path)

        # 添加一条正常草稿
        id1 = cache.add_draft(
            {"source": "human_edit", "type": "quality_rule", "title": "正常草稿", "content": "内容"}
        )

        # 手动修改创建时间为 40 天前（模拟过期）
        conn = sqlite3.connect(db_path)
        conn.execute(
            "UPDATE drafts SET created_at = ? WHERE id = ?",
            ((datetime.now() - timedelta(days=40)).isoformat(), id1),
        )
        conn.commit()
        conn.close()

        # 执行清理
        count = cache.cleanup_stale_drafts(days=30)
        assert count >= 1

        # 验证状态变为 expired
        draft = cache.get_draft_by_id(id1)
        assert draft["status"] == "expired"
        cache.close()

    def test_cleanup_respects_threshold(self, db_path):
        """未超过阈值的草稿不应被清理。"""
        cache = DraftCache(db_path)

        id1 = cache.add_draft(
            {"source": "human_edit", "type": "quality_rule", "title": "新鲜草稿", "content": "内容"}
        )

        # 执行清理（默认 30 天）
        count = cache.cleanup_stale_drafts(days=30)
        # 刚创建的草稿不应被清理
        draft = cache.get_draft_by_id(id1)
        assert draft["status"] == "pending"
        cache.close()


class TestAlertMonitor:
    """TC-L2-14/15: 异常告警。"""

    def test_conflict_pileup_alert(self, db_path, draft_cache, conflict_queue):
        """TC-L2-14: 冲突堆积告警。"""
        # 制造 5 条 pending 冲突
        for i in range(5):
            draft_id = draft_cache.add_draft(
                {
                    "source": "human_edit",
                    "type": "quality_rule",
                    "title": f"冲突草稿 {i}",
                    "content": "内容",
                }
            )
            conflict_queue.add_conflict(
                {
                    "draftId": draft_id,
                    "existingRule": f"规则 {i}",
                    "newRule": f"新规则 {i}",
                    "conflictType": "overlap",
                }
            )

        # 查询 pending 冲突数
        pending = conflict_queue.get_pending_conflicts()
        assert len(pending) >= 5

    def test_failed_commit_alert(self, db_path, draft_cache):
        """TC-L2-15: 入库失败告警。"""
        # 添加 failed 状态草稿
        draft_id = draft_cache.add_draft(
            {
                "source": "human_edit",
                "type": "quality_rule",
                "title": "入库失败测试",
                "content": "内容",
            }
        )
        draft_cache.update_draft_status(draft_id, "failed", 0)

        failed_drafts = draft_cache.get_drafts_by_status("failed")
        assert len(failed_drafts) >= 1
        assert failed_drafts[0]["title"] == "入库失败测试"


class TestDraftLifecycle:
    """草稿完整生命周期测试。"""

    def test_full_lifecycle(self, db_path):
        """草稿从生成到入库的完整流程。"""
        cache = DraftCache(db_path)
        queue = ConflictQueue(db_path)
        log = AuditLog(db_path)

        # 1. 生成草稿
        draft_id = cache.add_draft(
            {
                "source": "ai_generated",
                "type": "test_case",
                "title": "生命周期测试用例",
                "content": "# 测试用例\n\n## Compiled Truth\n\n验证登录功能。\n\n## Timeline\n\n- 2026-07-15: 生成",
                "metadata": {"priority": "high"},
            }
        )
        log.log("generate", "ai-platform", draft_id, {"source": "case-generator"})

        # 2. 用户编辑
        log.log("edit", "user-1", draft_id, {"field": "content"})

        # 3. 冲突检测（模拟检测到冲突）
        conflict_id = queue.add_conflict(
            {
                "draftId": draft_id,
                "existingRule": "已有登录规则",
                "newRule": "生命周期测试用例",
                "conflictType": "overlap",
            }
        )
        log.log("conflict_detect", "system", conflict_id, {"type": "overlap"})

        # 4. 解决冲突
        queue.resolve_conflict(conflict_id, "merge", "user-1")
        cache.update_draft_status(draft_id, "approved", 75)
        log.log("conflict_resolve", "user-1", conflict_id, {"resolution": "merge"})

        # 5. 质量评分
        log.log("quality_check", "system", draft_id, {"score": 75})

        # 6. 入库
        cache.update_draft_status(draft_id, "merged", 75)
        log.log("commit", "user-1", draft_id, {"pages": ["tc-lifecycle-test"]})

        # 验证最终状态
        draft = cache.get_draft_by_id(draft_id)
        assert draft["status"] == "merged"
        assert draft["qualityScore"] == 75

        conflict = queue.get_conflict_by_id(conflict_id)
        assert conflict["resolution"] == "merge"

        stats = log.get_stats()
        assert stats["commitCount"] >= 1

        cache.close()
        queue.close()
        log.close()
