# -*- coding: utf-8 -*-
"""
全量集成测试逐用例运行器（V1.1）
================================
对 tests/test_integration_full.py 中的每个测试方法单独以 pytest 子进程运行，
独立捕获其 stdout / stderr / 结果 / 时长，并生成：
  - tests/integration_report.json   （机器可读）
  - brain/test-cases/IT-INTEGRATION-REPORT-<date>.md  （知识库报告，含每次测试结果）

用法：
    python tests/run_integration_report.py
"""

import datetime
import json
import os
import re
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEST_FILE = os.path.join(ROOT, "tests", "test_integration_full.py")
REPORT_JSON = os.path.join(ROOT, "tests", "integration_report.json")
TODAY = datetime.date.today().isoformat()
REPORT_MD = os.path.join(ROOT, "brain", "test-cases",
                         "IT-INTEGRATION-REPORT-%s.md" % TODAY)

NODE_RE = re.compile(r"^(.*)::(\w+)::(\w+)\s+(PASSED|FAILED|ERROR|SKIPPED)", re.M)
SUMMARY_RE = re.compile(r"=+ (.*?) =+\s*(.*?)(?==+|\Z)", re.S)


def collect_nodes():
    """返回 [ (class, method) ] 列表。"""
    import importlib.util
    spec = importlib.util.spec_from_file_location("test_integration_full", TEST_FILE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    loader = unittest.TestLoader()
    nodes = []
    for cls_name in dir(mod):
        cls = getattr(mod, cls_name)
        if isinstance(cls, type) and issubclass(cls, unittest.TestCase) and cls is not unittest.TestCase:
            # 跳过基类
            if cls_name == "BaseIntegration":
                continue
            for m in loader.getTestCaseNames(cls):
                nodes.append((cls_name, m))
    return nodes


def run_one(class_name, method):
    node = "tests/test_integration_full.py::%s::%s" % (class_name, method)
    cmd = [sys.executable, "-m", "pytest", node, "-s", "-q", "--no-header",
           "-p", "no:cacheprovider"]
    t0 = datetime.datetime.now()
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT, timeout=120)
    t1 = datetime.datetime.now()
    duration = (t1 - t0).total_seconds()
    combined = (proc.stdout or "") + (proc.stderr or "")
    # 判定结果
    m = NODE_RE.search(combined)
    if m:
        outcome = m.group(4).lower()
    elif proc.returncode == 0:
        outcome = "passed"
    elif proc.returncode == 1:
        outcome = "failed"
    else:
        outcome = "could_not_run"
    # 抽取简短错误信息（最后一段 traceback / assert）
    err_excerpt = ""
    if outcome in ("failed", "error", "could_not_run"):
        lines = [l for l in combined.splitlines() if l.strip()]
        err_excerpt = "\n".join(lines[-25:])
    return {
        "class": class_name,
        "method": method,
        "node": node,
        "outcome": outcome,
        "returncode": proc.returncode,
        "duration_s": round(duration, 3),
        "stdout": proc.stdout or "",
        "stderr": proc.stderr or "",
        "error_excerpt": err_excerpt,
    }


def build_markdown(results, summary):
    lines = []
    lines.append("---")
    lines.append("type: test-report")
    lines.append("case_id: IT-INTEGRATION-REPORT-%s" % TODAY)
    lines.append("title: 全量集成测试报告 %s" % TODAY)
    lines.append("source: ai_generated")
    lines.append("created: %s" % TODAY)
    lines.append("---")
    lines.append("")
    lines.append("# 全量集成测试报告（%s）" % TODAY)
    lines.append("")
    lines.append("## 汇总")
    lines.append("")
    lines.append("- 总用例数：%d" % summary["total"])
    lines.append("- 通过：%d" % summary["passed"])
    lines.append("- 失败：%d" % summary["failed"])
    lines.append("- 错误：%d" % summary["error"])
    lines.append("- 跳过：%d" % summary["skipped"])
    lines.append("- 无法运行：%d" % summary["could_not_run"])
    lines.append("- 通过率：%.1f%%" % (summary["passed"] / summary["total"] * 100 if summary["total"] else 0))
    lines.append("")
    lines.append("## 每用例结果（含 stdout / stderr）")
    lines.append("")
    for r in results:
        lines.append("### %s::%s — %s" % (r["class"], r["method"], r["outcome"].upper()))
        lines.append("")
        lines.append("- 节点：`%s`" % r["node"])
        lines.append("- 结果：**%s**" % r["outcome"])
        lines.append("- 退出码：%d" % r["returncode"])
        lines.append("- 耗时：%ss" % r["duration_s"])
        lines.append("")
        lines.append("**stdout：**")
        lines.append("")
        lines.append("```text")
        lines.append((r["stdout"] or "(无)").rstrip())
        lines.append("```")
        lines.append("")
        lines.append("**stderr：**")
        lines.append("")
        lines.append("```text")
        lines.append((r["stderr"] or "(无)").rstrip())
        lines.append("```")
        lines.append("")
        if r["error_excerpt"]:
            lines.append("**错误摘要：**")
            lines.append("")
            lines.append("```text")
            lines.append(r["error_excerpt"].rstrip())
            lines.append("```")
            lines.append("")
    return "\n".join(lines)


def main():
    nodes = collect_nodes()
    print("收集到 %d 个测试方法，开始逐用例运行..." % len(nodes))
    results = []
    for cls, meth in nodes:
        r = run_one(cls, meth)
        results.append(r)
        print("  [%s] %s::%s (%.2fs)" % (r["outcome"].upper(), cls, meth, r["duration_s"]))
    summary = {"total": len(results), "passed": 0, "failed": 0,
               "error": 0, "skipped": 0, "could_not_run": 0}
    for r in results:
        o = r["outcome"]
        if o in summary:
            summary[o] += 1
    with open(REPORT_JSON, "w", encoding="utf-8") as f:
        json.dump({"summary": summary, "results": results}, f, ensure_ascii=False, indent=2)
    md = build_markdown(results, summary)
    os.makedirs(os.path.dirname(REPORT_MD), exist_ok=True)
    with open(REPORT_MD, "w", encoding="utf-8") as f:
        f.write(md)
    print("\n汇总：", summary)
    print("JSON 报告：", REPORT_JSON)
    print("知识库报告：", REPORT_MD)
    # 非 0 退出便于 CI 识别（但本脚本主要产出报告）
    if summary["failed"] or summary["error"] or summary["could_not_run"]:
        sys.exit(2)


if __name__ == "__main__":
    main()
