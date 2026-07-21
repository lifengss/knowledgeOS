"""生成 Demo 测试数据。

用法:
    python tests/generate_demo_data.py

功能:
    1. 在 drafts.db 中插入 Demo 草稿、冲突、审计日志数据
    2. 数据可用于系统测试和演示
    3. 执行后打印数据摘要

覆盖测试大纲中的 Demo 数据场景。
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# 将项目根目录加入路径
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from cache import AuditLog, ConflictQueue, DraftCache

DEMO_DB = PROJECT_ROOT / "cache" / "drafts.db"


def ensure_db():
    """确保数据库已初始化。"""
    if not DEMO_DB.exists():
        print("[Demo] 数据库不存在，先执行初始化...")
        init_script = PROJECT_ROOT / "scripts" / "init_cache.py"
        if init_script.exists():
            os.system(f"python {init_script}")
        else:
            print("[Demo] 错误: 找不到 init_cache.py")
            sys.exit(1)


def generate_draft_data(cache: DraftCache):
    """生成 Demo 草稿数据。"""
    drafts = [
        {
            "source": "human_edit",
            "type": "quality_rule",
            "title": "密码复杂度校验规则",
            "content": (
                "# 密码复杂度\n\n"
                "## Compiled Truth\n\n"
                "密码必须包含大小写字母、数字和特殊字符，长度不少于 8 位。\n\n"
                "## Timeline\n\n"
                "- 2026-07-15: 首次定义\n"
                "- 2026-07-16: 补充特殊字符要求"
            ),
            "metadata": {"priority": "high", "category": "security"},
        },
        {
            "source": "execution_feedback",
            "type": "defect_experience",
            "title": "空指针异常处理规范",
            "content": (
                "# 空指针异常\n\n"
                "## Compiled Truth\n\n"
                "所有可能为 null 的对象在使用前必须进行非空校验。\n\n"
                "## Timeline\n\n"
                "- 2026-07-10: 线上出现 NPE\n"
                "- 2026-07-11: 制定校验规范"
            ),
            "metadata": {"severity": "critical", "report_id": "RPT-20260710"},
        },
        {
            "source": "ai_generated",
            "type": "test_case",
            "title": "用户登录功能测试用例",
            "content": (
                "# 用户登录测试\n\n"
                "## Compiled Truth\n\n"
                "验证用户登录功能在各种场景下的正确性。\n\n"
                "## Timeline\n\n"
                "- 2026-07-15: AI 初始生成\n"
                "- 2026-07-15: 用户补充边界场景"
            ),
            "metadata": {"generator": "case-generator-v1", "related_api": "UserService.login"},
        },
        {
            "source": "human_edit",
            "type": "quality_rule",
            "title": "API 响应时间限制",
            "content": (
                "# API 性能规范\n\n"
                "## Compiled Truth\n\n"
                "所有 API 接口响应时间不得超过 500ms（P99）。\n\n"
                "## Timeline\n\n"
                "- 2026-07-01: 性能基线设定"
            ),
            "metadata": {"priority": "medium", "category": "performance"},
        },
        {
            "source": "execution_feedback",
            "type": "defect_experience",
            "title": "订单数量为 0 边界值",
            "content": (
                "# 边界值缺陷\n\n"
                "## Compiled Truth\n\n"
                "订单数量为 0 时应返回参数错误（400），而非 500 内部错误。\n\n"
                "## Timeline\n\n"
                "- 2026-07-12: 测试发现 500 错误\n"
                "- 2026-07-13: 修复并沉淀规则"
            ),
            "metadata": {"severity": "high", "report_id": "RPT-20260712"},
        },
    ]

    ids = []
    for d in drafts:
        draft_id = cache.add_draft(d)
        ids.append(draft_id)
        print(f"[Demo] 草稿已创建: {draft_id} - {d['title']}")

    return ids


def generate_conflict_data(queue: ConflictQueue, draft_ids: list[str]):
    """生成 Demo 冲突数据。"""
    conflicts = [
        {
            "draftId": draft_ids[3],  # API 响应时间限制
            "existingRule": "QR-001 接口性能规范（P99 < 300ms）",
            "newRule": "API 响应时间限制（P99 < 500ms）",
            "conflictType": "overlap",
        },
        {
            "draftId": draft_ids[0],  # 密码复杂度
            "existingRule": "QR-008 密码长度不得小于 8 位",
            "newRule": "密码复杂度校验规则",
            "conflictType": "duplicate",
        },
    ]

    ids = []
    for c in conflicts:
        conflict_id = queue.add_conflict(c)
        ids.append(conflict_id)
        print(f"[Demo] 冲突已创建: {conflict_id} - {c['conflictType']}")

    return ids


def generate_audit_log(log: AuditLog, draft_ids: list[str], conflict_ids: list[str]):
    """生成 Demo 审计日志数据。"""
    logs = [
        ("generate", "ai-platform", draft_ids[2], {"source": "case-generator", "mode": "keyword"}),
        ("edit", "user-1", draft_ids[0], {"field": "content", "reason": "补充特殊字符说明"}),
        ("conflict_detect", "system", conflict_ids[0], {"type": "overlap", "severity": "medium"}),
        ("quality_check", "system", draft_ids[2], {"score": 75, "decision": "pass"}),
        ("commit", "user-1", draft_ids[2], {"pages": ["tc-user-login"], "method": "single-commit"}),
        ("search", "web-ui", None, {"query": "密码复杂度", "mode": "rrf", "results": 5}),
        ("reject", "system", draft_ids[4], {"score": 35, "reason": "内容不完整，缺少 Timeline"}),
    ]

    for action, operator, target_id, details in logs:
        log_id = log.log(action, operator, target_id, details)
        print(f"[Demo] 审计日志已创建: {log_id} - {action}")


def set_draft_statuses(cache: DraftCache, draft_ids: list[str]):
    """设置草稿状态以匹配 Demo 场景。"""
    # demo-003 (用户登录) -> approved (已质量检查)
    cache.update_draft_status(draft_ids[2], "approved", 75)
    print(f"[Demo] 草稿 {draft_ids[2]} 状态更新为 approved")

    # demo-004 (API 响应时间) -> conflict (有冲突)
    cache.update_draft_status(draft_ids[3], "conflict", 0)
    print(f"[Demo] 草稿 {draft_ids[3]} 状态更新为 conflict")

    # demo-005 (订单数量) -> rejected (质量评分低)
    cache.update_draft_status(draft_ids[4], "rejected", 35)
    print(f"[Demo] 草稿 {draft_ids[4]} 状态更新为 rejected")


def print_summary(cache: DraftCache, queue: ConflictQueue, log: AuditLog):
    """打印数据摘要。"""
    print("\n" + "=" * 50)
    print("Demo 数据生成完成")
    print("=" * 50)

    pending = cache.get_drafts_by_status("pending")
    approved = cache.get_drafts_by_status("approved")
    conflict = cache.get_drafts_by_status("conflict")
    rejected = cache.get_drafts_by_status("rejected")

    print(f"\n草稿统计:")
    print(f"  pending:   {len(pending)}")
    print(f"  approved:  {len(approved)}")
    print(f"  conflict:  {len(conflict)}")
    print(f"  rejected:  {len(rejected)}")

    pending_conflicts = queue.get_pending_conflicts()
    print(f"\n冲突统计:")
    print(f"  pending:   {len(pending_conflicts)}")

    stats = log.get_stats()
    print(f"\n审计日志统计:")
    print(f"  commitCount:         {stats['commitCount']}")
    print(f"  searchCount:         {stats['searchCount']}")
    print(f"  pendingDraftCount:   {stats['pendingDraftCount']}")
    print(f"  pendingConflictCount:{stats['pendingConflictCount']}")

    print(f"\n数据库文件: {DEMO_DB}")
    print("=" * 50)


def main():
    """主入口。"""
    print("[Demo] 开始生成 Demo 测试数据...")
    ensure_db()

    cache = DraftCache(str(DEMO_DB))
    queue = ConflictQueue(str(DEMO_DB))
    log = AuditLog(str(DEMO_DB))

    try:
        draft_ids = generate_draft_data(cache)
        conflict_ids = generate_conflict_data(queue, draft_ids)
        generate_audit_log(log, draft_ids, conflict_ids)
        set_draft_statuses(cache, draft_ids)
        print_summary(cache, queue, log)
    finally:
        cache.close()
        queue.close()
        log.close()

    print("\n[Demo] 数据生成完成！可用于系统测试和演示。")


if __name__ == "__main__":
    main()
