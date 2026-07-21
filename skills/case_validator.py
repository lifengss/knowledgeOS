#!/usr/bin/env python3
"""case-validator: MCP 知识校验接口。

供 AI 平台在校验用例、执行入库时调用。
可读 Brain 仓库、SQLite 缓存，可写入正式知识库。
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from cache import AuditLog, ConflictQueue, DraftCache
from skills.batch_commit import batch_commit
from skills.conflict_detector import detect_conflicts
from skills.single_commit import single_commit

DB_PATH = os.environ.get("CACHE_DB_PATH", str(PROJECT_DIR / "cache" / "drafts.db"))


def _gbrain_list(page_type: str, limit: int = 100) -> list[dict[str, Any]]:
    """调用 gbrain list 获取页面列表。"""
    try:
        result = subprocess.run(
            ["gbrain", "list", "--type", page_type, "-n", str(limit)],
            capture_output=True,
            text=True,
            check=True,
            encoding="utf-8",
        )
        pages = []
        for line in result.stdout.strip().split("\n"):
            line = line.strip()
            if "\t" in line:
                parts = line.split("\t")
                if len(parts) >= 4:
                    pages.append(
                        {
                            "slug": parts[0],
                            "type": parts[1],
                            "date": parts[2],
                            "title": parts[3],
                        }
                    )
        return pages
    except subprocess.CalledProcessError as e:
        print(f"[case-validator] gbrain list 失败: {e.stderr}", file=sys.stderr)
        return []


def _gbrain_get(slug: str) -> dict[str, Any]:
    """调用 gbrain get 获取页面内容。"""
    try:
        result = subprocess.run(
            ["gbrain", "get", slug],
            capture_output=True,
            text=True,
            check=True,
            encoding="utf-8",
        )
        return {"slug": slug, "content": result.stdout}
    except subprocess.CalledProcessError as e:
        print(f"[case-validator] gbrain get {slug} 失败: {e.stderr}", file=sys.stderr)
        return {"slug": slug, "content": ""}


def validate(
    query: Optional[str] = None,
    limit: int = 50,
) -> dict[str, Any]:
    """校验用例：返回质量规则 + API 图谱 + 历史用例。

    Args:
        query: 可选的过滤关键词
        limit: 每类返回数量

    Returns:
        { qualityRules, apiGraph, testCases }
    """
    # 读取质量规则
    quality_rules = _gbrain_list("quality-rule", limit)
    quality_rules_detail = []
    for rule in quality_rules:
        page = _gbrain_get(rule["slug"])
        quality_rules_detail.append(
            {
                "id": rule["slug"],
                "title": rule["title"],
                "content": page["content"][:1500] if page["content"] else "",
            }
        )

    # 读取 API 图谱
    api_pages = _gbrain_list("project-wiki", limit)
    api_graph = []
    for api in api_pages:
        page = _gbrain_get(api["slug"])
        api_graph.append(
            {
                "id": api["slug"],
                "title": api["title"],
                "content": page["content"][:1500] if page["content"] else "",
            }
        )

    # 读取历史用例
    test_cases = _gbrain_list("test-case", limit)
    test_cases_detail = []
    for tc in test_cases:
        page = _gbrain_get(tc["slug"])
        test_cases_detail.append(
            {
                "id": tc["slug"],
                "title": tc["title"],
                "content": page["content"][:1500] if page["content"] else "",
            }
        )

    # 如果有过滤关键词，简单过滤
    if query:
        query_lower = query.lower()
        quality_rules_detail = [
            r for r in quality_rules_detail if query_lower in r["title"].lower() or query_lower in r["content"].lower()
        ]
        api_graph = [
            a for a in api_graph if query_lower in a["title"].lower() or query_lower in a["content"].lower()
        ]
        test_cases_detail = [
            t for t in test_cases_detail if query_lower in t["title"].lower() or query_lower in t["content"].lower()
        ]

    return {
        "qualityRules": quality_rules_detail,
        "apiGraph": api_graph,
        "testCases": test_cases_detail,
    }


def commit(
    draft_ids: Optional[list[str]] = None,
    mode: str = "batch",
    db_path: Optional[str] = None,
    operator: str = "system",
) -> dict[str, Any]:
    """执行入库。

    Args:
        draft_ids: 草稿 ID 列表
        mode: batch / single
        db_path: 数据库路径
        operator: 操作人

    Returns:
        入库结果
    """
    db_path = db_path or DB_PATH

    if mode == "batch":
        return batch_commit(draft_ids=draft_ids, db_path=db_path, operator=operator)
    elif mode == "single":
        if not draft_ids:
            return {"success": False, "reason": "单条入库需要提供 draft_id"}
        return single_commit(draft_id=draft_ids[0], db_path=db_path, operator=operator)
    else:
        return {"success": False, "reason": f"不支持的入库模式: {mode}"}


def detect_conflicts_op(
    draft_ids: Optional[list[str]] = None,
    db_path: Optional[str] = None,
    operator: str = "system",
) -> dict[str, Any]:
    """执行冲突检测操作。

    Args:
        draft_ids: 草稿 ID 列表
        db_path: 数据库路径
        operator: 操作人

    Returns:
        冲突检测结果
    """
    return detect_conflicts(draft_ids=draft_ids, db_path=db_path, operator=operator)


def run_validator(
    operation: str,
    payload: dict[str, Any],
    db_path: Optional[str] = None,
    operator: str = "system",
) -> dict[str, Any]:
    """case-validator 主入口。

    Args:
        operation: validate / commit / detect-conflicts
        payload: 操作参数
        db_path: 数据库路径
        operator: 操作人

    Returns:
        操作结果
    """
    if operation == "validate":
        return validate(
            query=payload.get("query"),
            limit=payload.get("limit", 50),
        )
    elif operation == "commit":
        return commit(
            draft_ids=payload.get("draftIds"),
            mode=payload.get("mode", "batch"),
            db_path=db_path,
            operator=operator,
        )
    elif operation == "detect-conflicts":
        return detect_conflicts_op(
            draft_ids=payload.get("draftIds"),
            db_path=db_path,
            operator=operator,
        )
    else:
        return {"success": False, "reason": f"不支持的操作: {operation}"}


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="知识校验接口")
    parser.add_argument(
        "operation",
        choices=["validate", "commit", "detect-conflicts"],
        help="操作类型",
    )
    parser.add_argument("--payload", default="{}", help="JSON 格式参数")
    parser.add_argument("--db-path", help="数据库路径")
    parser.add_argument("--operator", default="system", help="操作人")
    args = parser.parse_args()

    payload = json.loads(args.payload)
    result = run_validator(args.operation, payload, args.db_path, args.operator)
    print(json.dumps(result, ensure_ascii=False, indent=2))
