#!/usr/bin/env python3
"""
Auto Test Runner & Archiver
===========================
后续生成代码时，若同步生成了测试用例，自动触发测试并归档到测试用例集。

用法:
    python scripts/auto_test_runner.py              # 全量检测并归档
    python scripts/auto_test_runner.py --watch      # 监听模式（轮询）
    python scripts/auto_test_runner.py --file tests/test_new.py  # 指定文件

机制:
    1. 扫描 tests/ 目录，对比 .test_registry.json 记录，发现新增测试文件
    2. 对新增/指定文件运行 pytest，收集测试结果
    3. 解析测试函数中的 docstring / 命名约定，提取用例描述
    4. 自动追加到 tests/V1.0-测试用例全集.md 的「自动化归档区」
    5. 更新 .test_registry.json
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

# 项目根目录（脚本位于 scripts/ 下）
PROJECT_ROOT = Path(__file__).resolve().parent.parent
TESTS_DIR = PROJECT_ROOT / "tests"
REGISTRY_FILE = PROJECT_ROOT / ".test_registry.json"
CASE_DOC = TESTS_DIR / "V1.0-测试用例全集.md"

# 已知的基准测试文件（首次运行前已存在）
BASELINE_TESTS = {
    "test_cache.py",
    "test_cache_extended.py",
    "test_skills.py",
    "test_system.py",
    "generate_demo_data.py",
}


def load_registry() -> dict:
    """加载测试注册表。"""
    if REGISTRY_FILE.exists():
        with open(REGISTRY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "version": "1.0",
        "last_run": None,
        "known_files": list(BASELINE_TESTS),
        "archived_cases": [],
    }


def save_registry(registry: dict) -> None:
    """保存测试注册表。"""
    with open(REGISTRY_FILE, "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)


def discover_new_tests(registry: dict) -> list[Path]:
    """发现新增的测试文件。"""
    known = set(registry.get("known_files", []))
    new_files = []
    if TESTS_DIR.exists():
        for f in TESTS_DIR.iterdir():
            if f.is_file() and f.name.startswith("test_") and f.suffix == ".py":
                if f.name not in known:
                    new_files.append(f)
    return new_files


def run_pytest(test_file: Path) -> dict:
    """对指定测试文件运行 pytest，返回解析后的结果。"""
    # 先尝试标准 -v 输出（不依赖 pytest-json-report）
    cmd = [
        sys.executable,
        "-m",
        "pytest",
        str(test_file.relative_to(PROJECT_ROOT)),
        "-v",
        "--tb=short",
    ]
    try:
        result = subprocess.run(
            cmd,
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except Exception as e:
        return {"success": False, "error": str(e), "cases": []}

    # 解析 pytest -v 输出
    cases = _parse_pytest_output(result.stdout, result.stderr, test_file)
    return {
        "success": result.returncode == 0,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "cases": cases,
    }


def _parse_pytest_output(stdout: str, stderr: str, test_file: Path) -> list[dict]:
    """解析 pytest 输出，提取每个测试用例的信息。"""
    cases = []
    # 尝试从 stdout 提取 JSON report（最后一行可能是 JSON）
    lines = stdout.strip().splitlines()
    for line in reversed(lines):
        line = line.strip()
        if line.startswith("{"):
            try:
                report = json.loads(line)
                for test in report.get("tests", []):
                    cases.append(_extract_case_from_report(test, test_file))
                if cases:
                    return cases
            except json.JSONDecodeError:
                continue

    # 回退：正则解析 pytest -v 输出
    # 格式示例: tests/test_new.py::TestClass::test_method PASSED [ 50%]
    pattern = re.compile(
        r"^(?P<file>.+?)::(?P<case>.+?)\s+(?P<status>PASSED|FAILED|ERROR|SKIPPED)"
    )
    for line in lines:
        m = pattern.match(line)
        if m:
            cases.append(
                {
                    "file": test_file.name,
                    "nodeid": f"{test_file.name}::{m.group('case')}",
                    "name": m.group("case").split("::")[-1],
                    "status": m.group("status").lower(),
                    "doc": "",
                }
            )
    return cases


def _extract_case_from_report(test: dict, test_file: Path) -> dict:
    """从 pytest-json-report 的 test 对象提取用例信息。"""
    nodeid: str = test.get("nodeid", "")
    # nodeid 格式: tests/test_new.py::TestClass::test_method
    parts = nodeid.split("::")
    name = parts[-1] if parts else "unknown"
    # 尝试读取源码中的 docstring
    doc = test.get("doc", "") or ""
    return {
        "file": test_file.name,
        "nodeid": nodeid.replace("tests/", ""),
        "name": name,
        "status": "passed" if test.get("outcome") == "passed" else test.get("outcome", "unknown"),
        "doc": doc.strip(),
        "duration": test.get("call", {}).get("duration", 0),
    }


def extract_docstring_from_source(test_file: Path, case_name: str) -> str:
    """从源码中读取测试函数的 docstring。"""
    try:
        content = test_file.read_text(encoding="utf-8")
    except Exception:
        return ""
    # 匹配 def case_name(...): 后的 docstring（支持有/无类型注解）
    pattern = re.compile(
        rf"def\s+{re.escape(case_name)}\s*\([^)]*\)(?:\s*->\s*[^:]+)?\s*:\s*\n\s*\"\"\"(.*?)\"\"\"",
        re.DOTALL,
    )
    m = pattern.search(content)
    if m:
        return m.group(1).strip()
    # 尝试单引号
    pattern2 = re.compile(
        rf"def\s+{re.escape(case_name)}\s*\([^)]*\)(?:\s*->\s*[^:]+)?\s*:\s*\n\s*'''(.*?)'''",
        re.DOTALL,
    )
    m2 = pattern2.search(content)
    if m2:
        return m2.group(1).strip()
    return ""


def generate_case_markdown(case: dict, module_name: str, index: int) -> str:
    """为单个测试用例生成 Markdown 归档段落。"""
    name = case["name"]
    doc = case["doc"] or extract_docstring_from_source(
        TESTS_DIR / case["file"], name
    )
    status = case["status"]
    nodeid = case["nodeid"]

    # 从 docstring 提取关键信息
    priority = "P1"
    if "p0" in doc.lower() or "priority 0" in doc.lower():
        priority = "P0"
    elif "p2" in doc.lower() or "priority 2" in doc.lower():
        priority = "P2"

    # 生成用例编号（基于当前时间）
    ts = datetime.now().strftime("%m%d")
    case_id = f"TC-AUTO-{ts}-{index:03d}"

    # 正常流 / 异常流（从 docstring 推断）
    normal_flow = "执行测试函数，断言通过"
    error_flow = "断言失败或抛出异常"
    if doc:
        lines = [l.strip() for l in doc.splitlines() if l.strip()]
        if lines:
            normal_flow = lines[0]
        if len(lines) > 1:
            error_flow = lines[1]

    md = f"""### {case_id} {name}

| 属性 | 内容 |
|------|------|
| 优先级 | {priority} |
| 来源 | 自动生成（代码同步产出） |
| 测试文件 | `{nodeid}` |
| 执行状态 | {status.upper()} |
| 归档时间 | {datetime.now().isoformat()} |
| 自动化脚本 | `{nodeid}` |
| 正常流 | {normal_flow} |
| 异常流 | {error_flow} |

> **Docstring**: {doc or '（无）'}

"""
    return md


def append_to_case_doc(markdown_blocks: list[str]) -> None:
    """将新的用例 Markdown 追加到测试用例全集文档。"""
    if not CASE_DOC.exists():
        # 若文档不存在，创建基础结构
        header = "# V1.0 测试用例全集\n\n> 自动归档区\n\n"
        CASE_DOC.write_text(header, encoding="utf-8")

    content = CASE_DOC.read_text(encoding="utf-8")

    # 确保有「自动化归档区」标题
    archive_header = "\n---\n\n## 自动化归档区（Auto-Generated）\n\n"
    if "## 自动化归档区" not in content:
        content += archive_header
    else:
        # 在归档区末尾追加
        pass

    # 追加新块
    new_section = f"\n### 归档批次 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
    new_section += "\n".join(markdown_blocks)

    # 插入到文档末尾
    with open(CASE_DOC, "a", encoding="utf-8") as f:
        f.write(new_section)


def print_summary(results: list[dict]) -> None:
    """打印执行摘要。"""
    print("\n" + "=" * 60)
    print("自动测试归档摘要")
    print("=" * 60)
    total_cases = 0
    for r in results:
        file_name = r.get("file", "unknown")
        success = r.get("success", False)
        cases = r.get("cases", [])
        status_icon = "[PASS]" if success else "[FAIL]"
        print(f"\n{status_icon} {file_name} — {len(cases)} 个用例")
        for c in cases:
            icon = "[OK]" if c["status"] == "passed" else "[NG]"
            print(f"   {icon} {c['name']} ({c['status']})")
        total_cases += len(cases)
    print(f"\n总计: {total_cases} 个用例已归档到 {CASE_DOC.name}")
    print("=" * 60)


def run_single_file(test_file: Path, registry: dict) -> dict:
    """运行单个测试文件并返回结果。"""
    print(f"\n[DETECT] 检测到新增/指定测试文件: {test_file.name}")
    print(f"   运行: pytest {test_file.name} ...")
    result = run_pytest(test_file)
    result["file"] = test_file.name
    result["path"] = str(test_file)

    # 补充 docstring
    for c in result.get("cases", []):
        if not c.get("doc"):
            c["doc"] = extract_docstring_from_source(test_file, c["name"])

    # 归档
    if result["cases"]:
        blocks = [
            generate_case_markdown(c, test_file.stem, i + 1)
            for i, c in enumerate(result["cases"])
        ]
        append_to_case_doc(blocks)

    # 更新注册表
    if test_file.name not in registry["known_files"]:
        registry["known_files"].append(test_file.name)
    registry["last_run"] = datetime.now().isoformat()
    save_registry(registry)

    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="自动测试运行与归档工具")
    parser.add_argument("--watch", action="store_true", help="监听模式，轮询检测新测试")
    parser.add_argument("--interval", type=int, default=10, help="监听轮询间隔（秒）")
    parser.add_argument("--file", type=str, help="指定单个测试文件")
    args = parser.parse_args()

    registry = load_registry()

    if args.file:
        target = Path(args.file)
        if not target.is_absolute():
            target = PROJECT_ROOT / target
        if not target.exists():
            print(f"[ERR] 文件不存在: {target}")
            return 1
        result = run_single_file(target, registry)
        print_summary([result])
        return 0 if result["success"] else 1

    if args.watch:
        print(f"[WATCH] 监听模式启动，轮询间隔 {args.interval}s，按 Ctrl+C 停止...")
        try:
            while True:
                new_files = discover_new_tests(registry)
                if new_files:
                    results = []
                    for f in new_files:
                        r = run_single_file(f, registry)
                        results.append(r)
                    print_summary(results)
                else:
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] 无新增测试文件")
                time.sleep(args.interval)
                registry = load_registry()  # 重新加载
        except KeyboardInterrupt:
            print("\n[STOP] 监听已停止")
            return 0

    # 默认：一次性全量检测
    new_files = discover_new_tests(registry)
    if not new_files:
        print("[INFO] 未发现新增测试文件（所有已知测试已归档）")
        print(f"   已知文件: {registry['known_files']}")
        return 0

    results = []
    for f in new_files:
        r = run_single_file(f, registry)
        results.append(r)
    print_summary(results)

    # 若有失败，返回非零退出码
    return 0 if all(r["success"] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
