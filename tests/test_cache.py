"""缓冲层单元测试，覆盖 DraftCache / ConflictQueue / AuditLog 核心操作。"""

import os
import sqlite3
import tempfile
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
    """创建 DraftCache 实例。"""
    cache = DraftCache(db_path)
    yield cache
    cache.close()


@pytest.fixture
def conflict_queue(db_path):
    """创建 ConflictQueue 实例。"""
    queue = ConflictQueue(db_path)
    yield queue
    queue.close()


@pytest.fixture
def audit_log(db_path):
    """创建 AuditLog 实例。"""
    log = AuditLog(db_path)
    yield log
    log.close()


class TestDraftCache:
    """DraftCache 测试。"""

    def test_add_and_get_draft(self, draft_cache):
        """应能添加并查询草稿。"""
        draft_id = draft_cache.add_draft(
            {
                "source": "human_edit",
                "type": "quality_rule",
                "title": "新增：密码复杂度校验规则",
                "content": "# 密码复杂度\n\n密码必须包含大小写字母、数字和特殊字符。",
                "metadata": {"related_cases": ["TC-001"]},
            }
        )
        assert draft_id

        draft = draft_cache.get_draft_by_id(draft_id)
        assert draft["title"] == "新增：密码复杂度校验规则"
        assert draft["status"] == "pending"
        assert draft["metadata"]["related_cases"] == ["TC-001"]

    def test_get_drafts_by_status(self, draft_cache):
        """应能按状态获取草稿列表。"""
        draft_cache.add_draft(
            {
                "source": "execution_feedback",
                "type": "defect_experience",
                "title": "边界值：订单数量为 0 时的处理",
                "content": "# 边界值缺陷\n\n订单数量为 0 时应返回错误。",
            }
        )

        pending_drafts = draft_cache.get_drafts_by_status("pending")
        assert len(pending_drafts) >= 1

    def test_update_draft_status(self, draft_cache):
        """应能更新草稿状态。"""
        draft_id = draft_cache.add_draft(
            {
                "source": "human_edit",
                "type": "test_case",
                "title": "补充：账号锁定场景用例",
                "content": "# 账号锁定\n\n连续失败 5 次后账号锁定 30 分钟。",
            }
        )

        updated = draft_cache.update_draft_status(draft_id, "conflict", 78)
        assert updated is True

        draft = draft_cache.get_draft_by_id(draft_id)
        assert draft["status"] == "conflict"
        assert draft["qualityScore"] == 78

    def test_update_drafts_status(self, draft_cache):
        """应能批量更新草稿状态。"""
        id1 = draft_cache.add_draft(
            {"source": "human_edit", "type": "quality_rule", "title": "规则1", "content": "内容1"}
        )
        id2 = draft_cache.add_draft(
            {"source": "human_edit", "type": "quality_rule", "title": "规则2", "content": "内容2"}
        )

        count = draft_cache.update_drafts_status([id1, id2], "merged")
        assert count == 2

        draft1 = draft_cache.get_draft_by_id(id1)
        assert draft1["status"] == "merged"


class TestConflictQueue:
    """ConflictQueue 测试。"""

    def test_add_and_get_conflict(self, draft_cache, conflict_queue):
        """应能添加并查询冲突。"""
        draft_id = draft_cache.add_draft(
            {
                "source": "human_edit",
                "type": "quality_rule",
                "title": "密码复杂度规则",
                "content": "密码必须 8 位以上。",
            }
        )

        conflict_id = conflict_queue.add_conflict(
            {
                "draftId": draft_id,
                "existingRule": "QR-008 密码长度不得小于 8 位",
                "newRule": "新增密码复杂度校验规则",
                "conflictType": "overlap",
            }
        )
        assert conflict_id

        conflicts = conflict_queue.get_pending_conflicts()
        assert len(conflicts) >= 1

    def test_resolve_conflict(self, draft_cache, conflict_queue):
        """应能处理冲突。"""
        draft_id = draft_cache.add_draft(
            {
                "source": "human_edit",
                "type": "quality_rule",
                "title": "冲突测试规则",
                "content": "测试内容。",
            }
        )

        conflict_id = conflict_queue.add_conflict(
            {
                "draftId": draft_id,
                "existingRule": "已有规则",
                "newRule": "新规则",
                "conflictType": "duplicate",
            }
        )

        resolved = conflict_queue.resolve_conflict(conflict_id, "merge", "user-1")
        assert resolved is True

        conflict = conflict_queue.get_conflict_by_id(conflict_id)
        assert conflict["resolution"] == "merge"
        assert conflict["resolvedBy"] == "user-1"


class TestAuditLog:
    """AuditLog 测试。"""

    def test_log_and_query(self, audit_log):
        """应能记录并查询日志。"""
        log_id = audit_log.log(
            "commit", "user-1", "QR-012", {"message": "批量入库质量规则"}
        )
        assert log_id

        result = audit_log.query({"action": "commit"})
        assert result["total"] >= 1
        assert result["items"][0]["action"] == "commit"
        assert result["items"][0]["operator"] == "user-1"

    def test_get_stats(self, db_path, audit_log):
        """应能返回统计面板数据。"""
        # 初始化 DraftCache 和 ConflictQueue，确保 drafts/conflicts 表存在
        from cache import ConflictQueue, DraftCache

        draft_cache = DraftCache(db_path)
        conflict_queue = ConflictQueue(db_path)

        audit_log.log("search", "web-ui", None, {"query": "用户登录"})
        stats = audit_log.get_stats()

        assert isinstance(stats["commitCount"], int)
        assert isinstance(stats["searchCount"], int)
        assert isinstance(stats["pendingDraftCount"], int)
        assert isinstance(stats["pendingConflictCount"], int)

        draft_cache.close()
        conflict_queue.close()
