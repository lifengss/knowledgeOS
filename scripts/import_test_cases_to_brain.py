#!/usr/bin/env python3
"""将 tests/V1.0-测试用例全集.md 中的测试用例导入 Brain 仓库。

输出格式: brain/test-cases/TC-xxx.md
页面结构: frontmatter + Compiled Truth + Timeline
"""

import re
import sys
from datetime import datetime
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
SOURCE_FILE = PROJECT_DIR / "tests" / "V1.0-测试用例全集.md"
OUTPUT_DIR = PROJECT_DIR / "brain" / "test-cases"


def parse_test_cases(content: str) -> list[dict]:
    """解析 Markdown 内容，提取测试用例。"""
    cases = []

    # 匹配 TC-XXX-NN 格式的用例标题
    # 格式: ### TC-L2-01 SQLite 三表初始化
    pattern = re.compile(r"### (TC-[A-Z0-9-]+)\s+(.*?)\n(.*?)(?=\n### TC-|\n---|\Z)", re.DOTALL)

    for match in pattern.finditer(content):
        case_id = match.group(1).strip()
        title = match.group(2).strip()
        body = match.group(3).strip()

        # 提取属性表格
        props = {}
        table_pattern = re.compile(r"\|\s*(\w+)\s*\|\s*(.*?)\s*\|\s*\n")
        for row in table_pattern.finditer(body):
            key = row.group(1).strip()
            val = row.group(2).strip()
            props[key] = val

        # 提取正常流/异常流
        normal_flow = props.get("正常流", "")
        error_flow = props.get("异常流", "")
        priority = props.get("优先级", "P2")
        auto_script = props.get("自动化脚本", "")

        cases.append(
            {
                "id": case_id,
                "title": title,
                "priority": priority,
                "precondition": props.get("前置条件", ""),
                "steps": props.get("测试步骤", ""),
                "expected": props.get("期望结果", ""),
                "acceptance": props.get("验收标准", ""),
                "auto_script": auto_script,
                "normal_flow": normal_flow,
                "error_flow": error_flow,
                "body": body,
            }
        )

    return cases


def generate_brain_page(case: dict) -> str:
    """生成 Brain 页面 Markdown。"""
    case_id = case["id"]
    title = case["title"]
    priority = case["priority"]
    auto_script = case["auto_script"]
    normal_flow = case["normal_flow"]
    error_flow = case["error_flow"]
    precondition = case["precondition"]
    steps = case["steps"]
    expected = case["expected"]
    acceptance = case["acceptance"]

    # 清理步骤中的 <br>
    steps_clean = steps.replace("<br>", "\n- ")

    # 自动化脚本引用
    auto_ref = f"`{auto_script}`" if auto_script else "无"

    md = f"""---
type: test-case
case_id: {case_id}
status: active
priority: {priority}
auto_script: {auto_script or ""}
created: 2026-07-21
updated: 2026-07-21
---

# 测试用例：{title}

## Compiled Truth（当前最佳理解）

**前置条件**: {precondition or "无"}

**测试步骤**:
- {steps_clean or "见下方详细步骤"}

**期望结果**: {expected or "见下方验收标准"}

**验收标准**: {acceptance or "无"}

**自动化脚本**: {auto_ref}

## Timeline（历史证据，只追加）

- 2026-07-21: 从 V1.0-测试用例全集导入 Brain 仓库
"""
    return md


def main():
    if not SOURCE_FILE.exists():
        print(f"[ERR] 源文件不存在: {SOURCE_FILE}")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    content = SOURCE_FILE.read_text(encoding="utf-8")
    cases = parse_test_cases(content)

    print(f"[INFO] 解析到 {len(cases)} 个测试用例")

    for case in cases:
        case_id = case["id"]
        # 文件名: TC-L2-01.md
        file_name = f"{case_id}.md"
        file_path = OUTPUT_DIR / file_name

        md = generate_brain_page(case)
        file_path.write_text(md, encoding="utf-8")
        print(f"  [WRITE] {file_path.name} — {case['title']}")

    print(f"[DONE] 共导入 {len(cases)} 个测试用例到 {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
