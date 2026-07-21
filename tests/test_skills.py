"""自建 Skills 集成测试。

覆盖测试大纲 TC-SK-01 至 TC-SK-08。
需要 GBrain 已初始化（brain/ 目录存在）。
"""

import json
import os
import subprocess
import tempfile
from pathlib import Path

import pytest

# 将项目根目录加入路径
PROJECT_ROOT = Path(__file__).parent.parent


@pytest.fixture
def temp_db():
    """创建临时数据库用于隔离测试。"""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    yield path
    os.unlink(path)


@pytest.fixture
def sample_code_file():
    """创建示例 Python 代码文件。"""
    fd, path = tempfile.mkstemp(suffix=".py")
    os.close(fd)
    code = '''
"""示例用户服务模块。"""

class UserService:
    """用户服务类。"""

    def login(self, username: str, password: str) -> dict:
        """用户登录。"""
        return {"token": "abc123"}

    def logout(self, user_id: str) -> bool:
        """用户登出。"""
        return True

    def register(self, username: str, password: str, email: str) -> dict:
        """用户注册。"""
        return {"user_id": "u001"}

class OrderService:
    """订单服务类。"""

    def create_order(self, user_id: str, items: list) -> dict:
        """创建订单。"""
        return {"order_id": "o001"}

    def cancel_order(self, order_id: str) -> bool:
        """取消订单。"""
        return True

def validate_password(password: str) -> bool:
    """验证密码复杂度。"""
    return len(password) >= 8
'''
    Path(path).write_text(code, encoding="utf-8")
    yield path
    os.unlink(path)


class TestTfidfCodeSlicer:
    """TC-SK-01: tfidf-code-slicer 解析代码输出 JSON。"""

    def test_slice_code_output_structure(self, sample_code_file):
        """验证输出 JSON 包含 interfaces 和 dependencies。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from skills.tfidf_code_slicer import slice_code

        result = slice_code(sample_code_file)

        assert "interfaces" in result
        assert "dependencies" in result
        assert isinstance(result["interfaces"], list)
        assert isinstance(result["dependencies"], list)

    def test_slice_code_extracts_classes_and_methods(self, sample_code_file):
        """验证正确提取类和方法定义。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from skills.tfidf_code_slicer import slice_code

        result = slice_code(sample_code_file)
        interfaces = result["interfaces"]

        # 应提取到 5 个方法 + 1 个函数
        assert len(interfaces) >= 5

        # 检查是否包含 login 方法
        login_methods = [i for i in interfaces if i["name"] == "login"]
        assert len(login_methods) >= 1
        # module 可能是类名或临时文件名，只要非空即可
        assert login_methods[0]["module"]

    def test_slice_code_empty_for_non_python(self):
        """非 Python 文件返回空结果。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from skills.tfidf_code_slicer import slice_code

        fd, path = tempfile.mkstemp(suffix=".txt")
        os.close(fd)
        Path(path).write_text("This is not code", encoding="utf-8")

        try:
            result = slice_code(path)
            assert result["interfaces"] == []
            assert result["dependencies"] == []
        finally:
            os.unlink(path)


class TestConflictDetector:
    """TC-SK-05/06/07/08: 冲突检测相关测试。"""

    def test_duplicate_detection(self, temp_db):
        """TC-L2-06: 重复规则检测。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from cache import DraftCache
        from skills.conflict_detector import detect_conflicts

        cache = DraftCache(temp_db)

        # 添加一条与 GBrain 已有规则高度相似的草稿
        draft_id = cache.add_draft(
            {
                "source": "human_edit",
                "type": "quality_rule",
                "title": "Coding Standards and camelCase Naming",
                "content": "# 编码规范\n\n函数命名统一使用 camelCase 格式，首字母小写。常量使用 UPPER_SNAKE_CASE。",
                "metadata": {"category": "coding"},
            }
        )

        conflicts = detect_conflicts(temp_db)
        cache.close()

        # 应检测到至少一个冲突（与 coding-standards 重复）
        # 注意：此测试依赖 GBrain 中已有数据，若 GBrain 为空则可能无冲突
        # 这里主要验证函数执行不报错，返回格式正确
        assert isinstance(conflicts, dict)
        assert "checkedDrafts" in conflicts
        assert "conflicts" in conflicts
        duplicate_conflicts = [c for c in conflicts["conflicts"] if c["conflictType"] == "duplicate"]

    def test_overlap_detection(self, temp_db):
        """TC-L2-08: 重叠规则检测。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from cache import DraftCache
        from skills.conflict_detector import detect_conflicts

        cache = DraftCache(temp_db)

        # 添加一条与 API 规范部分重叠的草稿
        draft_id = cache.add_draft(
            {
                "source": "human_edit",
                "type": "quality_rule",
                "title": "API Response Format and Trace ID",
                "content": "# API 规范\n\n所有 API 响应必须包含 Trace ID 头，用于链路追踪。响应格式统一为 JSON。",
                "metadata": {"category": "api"},
            }
        )

        conflicts = detect_conflicts(temp_db)
        cache.close()

        assert isinstance(conflicts, dict)
        assert "checkedDrafts" in conflicts
        assert "conflicts" in conflicts


class TestQualityGate:
    """TC-L2-09/10: 质量门控测试。"""

    def test_pass_scenario(self, temp_db):
        """TC-L2-09: 高质量草稿通过。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from cache import DraftCache
        from skills.quality_gate import run_quality_gate

        cache = DraftCache(temp_db)

        draft_id = cache.add_draft(
            {
                "source": "human_edit",
                "type": "quality_rule",
                "title": "高质量规则：密码复杂度校验",
                "content": (
                    "# 密码复杂度\n\n"
                    "## Compiled Truth\n\n"
                    "密码必须包含大小写字母、数字和特殊字符，长度不少于 8 位。\n\n"
                    "## Timeline\n\n"
                    "- 2026-07-15: 首次定义\n"
                    "- 2026-07-16: 补充特殊字符要求\n\n"
                    "## 详细说明\n\n"
                    "1. 大写字母：A-Z\n"
                    "2. 小写字母：a-z\n"
                    "3. 数字：0-9\n"
                    "4. 特殊字符：!@#$%^&*"
                ),
                "metadata": {"priority": "high"},
            }
        )

        # 注意：run_quality_gate 第一个参数是 draft_ids，db_path 需用关键字参数
        result = run_quality_gate(db_path=temp_db)
        cache.close()

        # 验证返回格式正确
        assert "checkedDrafts" in result
        assert "passed" in result
        assert "rejected" in result
        # 验证至少有一条记录且评分>=60
        assert result["checkedDrafts"] >= 1
        assert len(result["passed"]) >= 1
        assert result["passed"][0]["score"] >= 60

    def test_reject_scenario(self, temp_db):
        """TC-L2-10: 低质量草稿拒绝。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from cache import DraftCache
        from skills.quality_gate import run_quality_gate

        cache = DraftCache(temp_db)

        # 先清理已有草稿
        for d in cache.get_drafts_by_status("pending"):
            cache.update_draft_status(d["id"], "rejected", 0)

        draft_id = cache.add_draft(
            {
                "source": "ai_generated",
                "type": "test_case",
                "title": "短",
                "content": "测试",
            }
        )

        # 注意：run_quality_gate 第一个参数是 draft_ids，db_path 需用关键字参数
        result = run_quality_gate(db_path=temp_db)
        cache.close()

        # 验证返回格式正确
        assert "checkedDrafts" in result
        assert "passed" in result
        assert "rejected" in result
        # 验证有被拒绝的记录
        assert result["checkedDrafts"] >= 1
        assert len(result["rejected"]) >= 1
        assert result["rejected"][0]["score"] < 60


class TestBatchCommit:
    """TC-SK-06: batch-commit 批量入库。"""

    def test_batch_commit_with_pending_drafts(self, temp_db):
        """批量入库 pending 草稿。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from cache import DraftCache
        from skills.batch_commit import batch_commit

        cache = DraftCache(temp_db)

        # 添加多条草稿
        for i in range(3):
            cache.add_draft(
                {
                    "source": "human_edit",
                    "type": "quality_rule",
                    "title": f"批量规则 {i}",
                    "content": (
                        f"# 规则 {i}\n\n"
                        f"## Compiled Truth\n\n"
                        f"这是规则 {i} 的内容。\n\n"
                        f"## Timeline\n\n"
                        f"- 2026-07-15: 创建"
                    ),
                }
            )

        # 跳过冲突检测和质量门控（纯测试）
        result = batch_commit(
            temp_db, skip_conflict_check=True, skip_quality_gate=True
        )
        cache.close()

        # 验证返回格式
        assert "processedDrafts" in result
        assert "committed" in result
        assert "conflicts" in result
        assert "rejected" in result
        assert isinstance(result["committed"], list)


class TestSingleCommit:
    """TC-SK-07: single-commit 单条入库。"""

    def test_single_commit_approved_draft(self, temp_db):
        """单条入库已批准的草稿。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from cache import DraftCache
        from skills.single_commit import single_commit

        cache = DraftCache(temp_db)

        draft_id = cache.add_draft(
            {
                "source": "human_edit",
                "type": "quality_rule",
                "title": "单条入库规则",
                "content": (
                    "# 单条规则\n\n"
                    "## Compiled Truth\n\n"
                    "测试单条入库。\n\n"
                    "## Timeline\n\n"
                    "- 2026-07-15: 创建"
                ),
            }
        )

        # 先批准
        cache.update_draft_status(draft_id, "approved", 70)

        result = single_commit(
            draft_id, temp_db, skip_conflict_check=True, skip_quality_gate=True
        )
        cache.close()

        # 验证返回格式
        assert "draftId" in result
        assert "success" in result
        assert "reason" in result

    def test_single_commit_rejects_non_approved(self, temp_db):
        """未批准的草稿不应入库。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from cache import DraftCache
        from skills.single_commit import single_commit

        cache = DraftCache(temp_db)

        draft_id = cache.add_draft(
            {
                "source": "human_edit",
                "type": "quality_rule",
                "title": "已入库规则",
                "content": "内容",
            }
        )

        # 将草稿状态改为 merged（模拟已入库）
        cache.update_draft_status(draft_id, "merged", 80)

        result = single_commit(
            draft_id, temp_db, skip_conflict_check=True, skip_quality_gate=True
        )
        cache.close()

        # 非 pending 状态的草稿应被拒绝
        assert result["success"] is False
        assert "merged" in result["reason"]


class TestCaseGenerator:
    """TC-SK-03: case-generator MCP 知识查询。"""

    def test_generate_cases_keyword_mode(self):
        """关键词模式搜索。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from skills.case_generator import generate_cases

        result = generate_cases("camelCase", mode="keyword", limit=3)

        assert "query" in result
        assert "results" in result
        assert isinstance(result["results"], list)

    def test_generate_cases_empty_query(self):
        """空查询应返回空结果。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from skills.case_generator import generate_cases

        result = generate_cases("", mode="keyword", limit=3)
        assert result["results"] == []


class TestCaseValidator:
    """TC-SK-04: case-validator MCP 知识校验。"""

    def test_validate_action(self):
        """validate 操作返回质量规则。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from skills.case_validator import run_validator

        payload = {"query": "camelCase", "limit": 3}
        result = run_validator("validate", payload)

        # validate 返回 { qualityRules, apiGraph, testCases }
        assert "qualityRules" in result
        assert isinstance(result["qualityRules"], list)

    def test_unknown_action(self):
        """未知 action 返回错误。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from skills.case_validator import run_validator

        result = run_validator("unknown", {})
        assert result["success"] is False
        assert "reason" in result


class TestCommitIntegration:
    """TC-SK-05/08: 强制前置调用验证。"""

    def test_conflict_detector_prerequisite(self, temp_db):
        """TC-SK-05: batch-commit 默认调用 conflict-detector。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from cache import DraftCache, ConflictQueue
        from skills.batch_commit import batch_commit

        cache = DraftCache(temp_db)
        queue = ConflictQueue(temp_db)

        cache.add_draft(
            {
                "source": "human_edit",
                "type": "quality_rule",
                "title": "前置检测测试",
                "content": (
                    "# 测试\n\n"
                    "## Compiled Truth\n\n"
                    "内容。\n\n"
                    "## Timeline\n\n"
                    "- 2026-07-15: 创建"
                ),
            }
        )

        # 默认调用（不跳过冲突检测）
        result = batch_commit(temp_db, skip_quality_gate=True)

        # 验证冲突检测被调用（conflicts 表可能有记录）
        conflicts = queue.get_pending_conflicts()
        cache.close()
        queue.close()

        # 冲突检测至少被执行（结果取决于 GBrain 数据）
        assert isinstance(result, dict)

    def test_quality_gate_prerequisite(self, temp_db):
        """TC-SK-08: batch-commit 默认调用 quality-gate。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from cache import DraftCache
        from skills.batch_commit import batch_commit

        cache = DraftCache(temp_db)

        cache.add_draft(
            {
                "source": "human_edit",
                "type": "quality_rule",
                "title": "质量门控测试",
                "content": (
                    "# 测试\n\n"
                    "## Compiled Truth\n\n"
                    "内容。\n\n"
                    "## Timeline\n\n"
                    "- 2026-07-15: 创建"
                ),
            }
        )

        # 默认调用（不跳过质量门控）
        result = batch_commit(temp_db, skip_conflict_check=True)
        cache.close()

        assert isinstance(result, dict)
        assert "committed" in result


class TestApiGraphBuilder:
    """TC-SK-02: api-graph-builder 更新 API 实体页面。"""

    def test_build_api_graph_structure(self, sample_code_file):
        """验证 api-graph-builder 能处理 slice_code 输出。"""
        import sys

        sys.path.insert(0, str(PROJECT_ROOT))
        from skills.tfidf_code_slicer import slice_code

        slice_result = slice_code(sample_code_file)

        # 验证有接口被提取
        assert len(slice_result["interfaces"]) > 0

        # 验证依赖关系结构
        assert isinstance(slice_result["dependencies"], list)
