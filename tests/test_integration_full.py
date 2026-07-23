# -*- coding: utf-8 -*-
"""
全量集成测试套件（V1.1）
=======================
覆盖知识管理系统后端全部 HTTP 接口 + 关键 Python 模块。

设计依据（项目 wiki 中保存的函数调用关系）：
- 项目维度 / 生命周期：brain/project-wiki/api-projects.md
- 草稿与入库：api-server.md / api-single-commit.md / api-batch-commit.md
- 冲突与质量门控：api-conflict-detector.md / api-quality-gate.md
- 用例生成：api-case-generator.md
- 审计 / 统计 / 图谱：api-server.md

运行方式（由 tests/run_integration_report.py 逐用例执行并采集 stdout/stderr）：
    python -m pytest tests/test_integration_full.py -s -q

也可整体运行：
    python -m pytest tests/test_integration_full.py
"""

import io
import json
import os
import sys
import unittest
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_BASE = os.environ.get("KB_API_BASE", "http://localhost:3000/api")
PROJECT_DIR = ROOT  # 进程侧可访问文件系统的根（用于清理 brain 文件）


def req(method, path, body=None, raw=None, headers=None, timeout=30):
    """发起 HTTP 请求，返回 (status_code, json_or_text)。"""
    url = API_BASE + path
    data = None
    hdrs = {"Accept": "application/json"}
    if raw is not None:
        data = raw
        hdrs["Content-Type"] = headers.get("Content-Type") if headers else "application/octet-stream"
    elif body is not None:
        data = json.dumps(body).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    if headers:
        hdrs.update(headers)
    r = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            payload = resp.read().decode("utf-8", "replace")
            status = resp.status
    except urllib.error.HTTPError as e:
        payload = e.read().decode("utf-8", "replace")
        status = e.code
    try:
        return status, json.loads(payload)
    except Exception:
        return status, payload


def multipart(path, fields, timeout=30):
    """发送 multipart/form-data 请求（用于 source-upload）。"""
    boundary = "----kbtestboundary"
    parts = []
    for k, v in fields.items():
        parts.append(("--" + boundary).encode())
        parts.append(('Content-Disposition: form-data; name="%s"\r\n\r\n' % k).encode())
        parts.append(v.encode("utf-8") if isinstance(v, str) else v)
        parts.append(b"\r\n")
    parts.append(("--" + boundary + "--\r\n").encode())
    body = b"".join(parts)
    hdrs = {"Content-Type": "multipart/form-data; boundary=" + boundary}
    url = API_BASE + path
    r = urllib.request.Request(url, data=body, method="POST", headers=hdrs)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            payload = resp.read().decode("utf-8", "replace")
            status = resp.status
    except urllib.error.HTTPError as e:
        payload = e.read().decode("utf-8", "replace")
        status = e.code
    try:
        return status, json.loads(payload)
    except Exception:
        return status, payload


class BaseIntegration(unittest.TestCase):
    def setUp(self):
        self.tmp_project = None

    def tearDown(self):
        # 清理可能遗留的临时项目
        if self.tmp_project:
            req("DELETE", "/projects/" + self.tmp_project)
            self.tmp_project = None

    def _ensure_tmp_project(self, pid="itg_tmp"):
        self.tmp_project = pid
        st, j = req("POST", "/projects", {"id": pid, "name": "集成测试临时项目", "description": "auto"})
        self.assertEqual(st, 200, msg="创建临时项目失败: %s" % j)
        self.assertTrue(j.get("success"))
        return j["data"]


class TestHealth(BaseIntegration):
    def test_health_ok(self):
        """GET /api/health 健康检查应返回 status=ok。"""
        st, j = req("GET", "/health")
        self.assertEqual(st, 200)
        self.assertEqual(j.get("status"), "ok")
        self.assertIn("version", j)


class TestProjectsCRUD(BaseIntegration):
    def test_list_projects(self):
        """GET /api/projects 应返回 default/demo 等。"""
        st, j = req("GET", "/projects")
        self.assertEqual(st, 200)
        self.assertTrue(j.get("success"))
        data = j["data"]
        ids = [p["id"] for p in data["projects"]]
        self.assertIn("default", ids)
        self.assertIn("sharedBrain", data)

    def test_create_and_delete_project(self):
        """POST /api/projects 创建 + DELETE /api/projects/:id 删除。"""
        pid = "itg_create"
        st, j = req("POST", "/projects", {"id": pid, "name": "集成创建", "description": "x"})
        self.assertEqual(st, 200)
        self.assertEqual(j["data"]["brainPath"], "brains/" + pid)
        # 列表中应包含
        st2, j2 = req("GET", "/projects")
        self.assertIn(pid, [p["id"] for p in j2["data"]["projects"]])
        # 删除
        st3, j3 = req("DELETE", "/projects/" + pid)
        self.assertEqual(st3, 200)
        self.assertTrue(j3.get("success"))
        # 删除后不存在
        st4, j4 = req("GET", "/projects")
        self.assertNotIn(pid, [p["id"] for p in j4["data"]["projects"]])

    def test_delete_default_forbidden(self):
        """DELETE /api/projects/default 应被拒绝（400）。"""
        st, j = req("DELETE", "/projects/default")
        self.assertEqual(st, 400)
        self.assertFalse(j.get("success"))

    def test_delete_nonexistent(self):
        """DELETE /api/projects/不存在 应 400。"""
        st, j = req("DELETE", "/projects/no_such_project_xyz")
        self.assertEqual(st, 400)
        self.assertFalse(j.get("success"))


class TestDrafts(BaseIntegration):
    def test_draft_crud(self):
        """草稿创建/查询/列表/改状态全链路。"""
        body = {"project": "default", "category": "quality-rules",
                "title": "集成测试草稿", "content": "# 标题\n- 条目\n```js\ncode\n```",
                "source": "integration-test"}
        st, j = req("POST", "/drafts", body)
        self.assertEqual(st, 200)
        self.assertTrue(j.get("success"))
        did = j["data"]["id"]
        try:
            # 列表
            st2, j2 = req("GET", "/drafts")
            self.assertEqual(st2, 200)
            ids = [d["id"] for d in (j2.get("data") or [])]
            self.assertIn(did, ids)
            # 单条
            st3, j3 = req("GET", "/drafts/" + did)
            self.assertEqual(st3, 200)
            self.assertEqual(j3["data"]["id"], did)
            # 改状态
            st4, j4 = req("PUT", "/drafts/" + did + "/status", {"status": "approved"})
            self.assertEqual(st4, 200)
            self.assertTrue(j4.get("success"))
        finally:
            # 清理：删除草稿本身无接口，尝试 commit 后清理 brain 文件
            try:
                stc, jc = req("POST", "/drafts/" + did + "/commit")
                if stc == 200 and isinstance(jc, dict):
                    p = jc.get("data", {}).get("path") or jc.get("data", {}).get("brainPath")
                    if p:
                        fp = os.path.join(PROJECT_DIR, p)
                        if os.path.exists(fp):
                            os.remove(fp)
            except Exception:
                pass

    def test_batch_commit(self):
        """批量入库：先建草稿再 batch-commit。"""
        body = {"project": "default", "category": "quality-rules",
                "title": "批量集成草稿", "content": "# 批量\n- a\n- b",
                "source": "integration-test"}
        st, j = req("POST", "/drafts", body)
        self.assertEqual(st, 200)
        did = j["data"]["id"]
        st2, j2 = req("POST", "/drafts/batch-commit", {"draftIds": [did], "category": "quality-rules"})
        self.assertEqual(st2, 200)
        self.assertTrue(j2.get("success"))
        # 清理 brain 文件
        try:
            p = j2.get("data", {}).get("results", [{}])[0].get("path") if isinstance(j2.get("data"), dict) else None
            if p:
                fp = os.path.join(PROJECT_DIR, p)
                if os.path.exists(fp):
                    os.remove(fp)
        except Exception:
            pass


class TestConflicts(BaseIntegration):
    def test_conflicts_list_and_detect(self):
        """冲突列表 + 触发检测。"""
        st, j = req("GET", "/conflicts")
        self.assertEqual(st, 200)
        self.assertTrue(j.get("success"))
        st2, j2 = req("POST", "/conflicts/detect", {"project": "default", "category": "quality-rules"})
        self.assertEqual(st2, 200)
        self.assertTrue(j2.get("success"))

    def test_conflict_resolve(self):
        """检测后对首个冲突标记解决。"""
        req("POST", "/conflicts/detect", {"project": "default", "category": "quality-rules"})
        st, j = req("GET", "/conflicts")
        data = j.get("data")
        conflicts = data if isinstance(data, list) else (data.get("list") or data.get("conflicts") or [])
        if conflicts:
            cid = conflicts[0].get("id") or conflicts[0].get("conflict_id")
            st2, j2 = req("PUT", "/conflicts/" + str(cid) + "/resolve",
                          {"resolution": "keep_both", "operator": "itg", "mode": "auto"})
            self.assertEqual(st2, 200)
            self.assertTrue(j2.get("success"))


class TestQualityGate(BaseIntegration):
    def _make_draft(self, content):
        body = {"project": "default", "category": "quality-rules",
                "title": "质量门禁草稿", "content": content, "source": "integration-test"}
        st, j = req("POST", "/drafts", body)
        self.assertEqual(st, 200)
        return j["data"]["id"]

    def test_quality_gate_pass(self):
        """结构化内容应通过质量门禁（出现在 passed）。"""
        did = self._make_draft("# 标题\n## 章节\n- 列表项1\n- 列表项2\n```python\nprint(1)\n```\n正文说明。")
        st, j = req("POST", "/quality-gate/check", {"draft_ids": did, "project": "default"})
        self.assertEqual(st, 200)
        self.assertTrue(j.get("success"))
        self.assertEqual(j["data"]["checkedDrafts"], 1)
        passed_ids = [x.get("draftId") for x in j["data"]["passed"]]
        self.assertIn(did, passed_ids)

    def test_quality_gate_low(self):
        """无结构内容应被质量门禁拒绝（出现在 rejected）。"""
        did = self._make_draft("随便写点东西没有结构")
        st, j = req("POST", "/quality-gate/check", {"draft_ids": did, "project": "default"})
        self.assertEqual(st, 200)
        self.assertTrue(j.get("success"))
        self.assertEqual(j["data"]["checkedDrafts"], 1)
        rejected_ids = [x.get("draftId") for x in j["data"]["rejected"]]
        self.assertIn(did, rejected_ids)


class TestAuditLog(BaseIntegration):
    def test_audit_log_list(self):
        """审计日志可查询。"""
        st, j = req("GET", "/audit-log")
        self.assertEqual(st, 200)
        self.assertTrue(j.get("success"))


class TestStats(BaseIntegration):
    def test_stats(self):
        """统计接口可返回数据。"""
        st, j = req("GET", "/stats")
        self.assertEqual(st, 200)
        self.assertTrue(j.get("success"))
        self.assertIn("data", j)


class TestSearch(BaseIntegration):
    def test_search(self):
        """检索接口可返回结果。"""
        st, j = req("POST", "/search", {"query": "测试", "project": "default", "limit": 10})
        self.assertEqual(st, 200)
        self.assertTrue(j.get("success"))


class TestGenerateCases(BaseIntegration):
    def test_generate_cases(self):
        """用例生成接口按 query 检索并返回 results 列表。"""
        body = {"query": "登录 测试", "limit": 5}
        st, j = req("POST", "/generate-cases", body)
        self.assertEqual(st, 200)
        self.assertTrue(j.get("success"))
        self.assertIn("results", j["data"])
        self.assertIsInstance(j["data"]["results"], list)


class TestSourceUpload(BaseIntegration):
    def test_source_upload_content(self):
        """source-upload（content 路径）应入库并回显。"""
        st, j = multipart("/source-upload",
                          {"project": "default", "content": "# 上传源码\n```js\nfunction a(){}\n```"})
        self.assertEqual(st, 200)
        self.assertTrue(j.get("success"))


class TestBrainPages(BaseIntegration):
    def test_brain_pages_all(self):
        """GET /api/brain/pages?category=all 应返回全部分类页面。"""
        st, j = req("GET", "/brain/pages?project=default&category=all&pageSize=5")
        self.assertEqual(st, 200)
        self.assertTrue(j.get("success"))
        pages = j.get("data") or []
        self.assertIsInstance(pages, list)

    def test_brain_page_detail(self):
        """GET /api/brain/pages/:category/:id 应返回单页内容。"""
        # 先取一个页面
        st, j = req("GET", "/brain/pages?project=default&category=all&pageSize=200")
        pages = j.get("data") or []
        self.assertTrue(len(pages) > 0, "default 库应至少有页面用于详情测试")
        page = pages[0]
        cat = page.get("category")
        pid = page.get("id") or page.get("filename", "").replace(".md", "")
        st2, j2 = req("GET", "/brain/pages/%s/%s?project=default" % (cat, pid))
        self.assertEqual(st2, 200)
        self.assertTrue(j2.get("success"))


class TestDraftAndBrainDelete(BaseIntegration):
    def _make_draft(self, title, content):
        st, j = req("POST", "/drafts", {"project": "default", "category": "quality-rules",
                                        "title": title, "content": content, "source": "integration-test"})
        self.assertEqual(st, 200)
        return j["data"]["id"]

    def test_draft_single_delete(self):
        """DELETE /api/drafts/:id 可删除单条草稿。"""
        did = self._make_draft("删除测试草稿单条", "# 标题\n- 项1\n```python\nprint(1)\n```")
        st, j = req("DELETE", "/drafts/%s?project=default" % did)
        self.assertEqual(st, 200)
        self.assertTrue(j.get("success"))

    def test_draft_batch_delete(self):
        """DELETE /api/drafts 可按 ids 批量删除草稿。"""
        d1 = self._make_draft("删除测试草稿批量A", "# A\n- x\n```py\n1\n```")
        d2 = self._make_draft("删除测试草稿批量B", "# B\n- y\n```py\n2\n```")
        st, j = req("DELETE", "/drafts?project=default", {"ids": [d1, d2]})
        self.assertEqual(st, 200)
        self.assertTrue(j.get("success"))

    def test_brain_single_and_batch_delete(self):
        """DELETE /api/brain/pages 单条/批量删除知识库页面（含路径越界拒绝）。"""
        # 提交结构化草稿（跳过冲突检测以保证落库），得到真实知识库页面
        did = self._make_draft("删除测试知识页",
                               "# 删除测试知识页\n## 章节\n- 列表\n```python\nprint(1)\n```\n正文。")
        st, j = req("POST", "/drafts/batch-commit", {"ids": [did], "skip_conflict_check": True, "skip_quality_gate": True})
        self.assertEqual(st, 200)
        pages = (j.get("data") or {}).get("committedPages") or []
        self.assertTrue(len(pages) > 0, "提交后应产生知识库页面")
        cat, fname = pages[0].split("/", 1)
        bid = fname[:-3] if fname.endswith(".md") else fname
        # 单条删除
        st2, j2 = req("DELETE", "/brain/pages/%s/%s?project=default" % (cat, bid))
        self.assertEqual(st2, 200)
        self.assertTrue(j2.get("success"))
        # 路径越界拒绝（Express 会归一化 URL 中的 ..，返回非 200 而非落库）
        st3, j3 = req("DELETE", "/brain/pages/%s/%s?project=default" % (cat, "../" + bid))
        self.assertNotEqual(st3, 200)
        if isinstance(j3, dict):
            self.assertFalse(j3.get("success"))
        # 再造一个，批量删除
        did2 = self._make_draft("删除测试知识页2",
                                "# 删除测试知识页2\n## 节\n- 项\n```py\nx\n```")
        st, j = req("POST", "/drafts/batch-commit", {"ids": [did2], "skip_conflict_check": True, "skip_quality_gate": True})
        pages2 = (j.get("data") or {}).get("committedPages") or []
        self.assertTrue(len(pages2) > 0)
        cat2, fname2 = pages2[0].split("/", 1)
        bid2 = fname2[:-3] if fname2.endswith(".md") else fname2
        st4, j4 = req("DELETE", "/brain/pages?project=default",
                      {"items": [{"category": cat2, "id": bid2}]})
        self.assertEqual(st4, 200)
        self.assertTrue(j4.get("success"))
        self.assertEqual(j4.get("data", {}).get("count"), 1)


class TestPrivatePromote(BaseIntegration):
    def test_private_pages_and_promote(self):
        """列出私有页面 + 晋升共享库（copy/move）+ 路径越界拒绝。"""
        pid = "itg_promote"
        self._ensure_tmp_project(pid)
        # 写一个私有页面
        priv_dir = os.path.join(PROJECT_DIR, "brains", pid, "quality-rules")
        os.makedirs(priv_dir, exist_ok=True)
        fname = "itg_private_rule.md"
        fpath = os.path.join(priv_dir, fname)
        with io.open(fpath, "w", encoding="utf-8") as f:
            f.write("# 私有规则\n- 一条经验\n")
        try:
            # 列出私有页面
            st, j = req("GET", "/brain/private-pages?project=" + pid)
            self.assertEqual(st, 200)
            self.assertTrue(j.get("success"))
            paths = [p["path"] for p in j["data"]["pages"]]
            self.assertIn("quality-rules/" + fname, paths)

            # 复制晋升
            st2, j2 = req("POST", "/brain/promote",
                          {"project": pid, "pagePath": "quality-rules/" + fname, "mode": "copy"})
            self.assertEqual(st2, 200)
            self.assertTrue(j2.get("success"))
            shared_path = os.path.join(PROJECT_DIR, "brains", "_shared", "quality-rules", fname)
            self.assertTrue(os.path.exists(shared_path), "复制晋升后共享库应存在该文件")

            # 移动晋升
            st3, j3 = req("POST", "/brain/promote",
                          {"project": pid, "pagePath": "quality-rules/" + fname, "mode": "move"})
            self.assertEqual(st3, 200)
            self.assertTrue(j3.get("success"))
            self.assertFalse(os.path.exists(fpath), "移动晋升后私有库原文件应被移除")
        finally:
            # 清理共享库副本
            shared_path = os.path.join(PROJECT_DIR, "brains", "_shared", "quality-rules", fname)
            if os.path.exists(shared_path):
                os.remove(shared_path)

    def test_promote_path_traversal_rejected(self):
        """晋升接口应拒绝路径穿越。"""
        pid = "itg_promote"
        self._ensure_tmp_project(pid)
        st, j = req("POST", "/brain/promote",
                    {"project": pid, "pagePath": "../secret.md", "mode": "copy"})
        self.assertEqual(st, 400)
        self.assertFalse(j.get("success"))

    def test_promote_invalid_category(self):
        """晋升接口应拒绝非法分类。"""
        pid = "itg_promote"
        self._ensure_tmp_project(pid)
        st, j = req("POST", "/brain/promote",
                    {"project": pid, "pagePath": "not-a-category/x.md", "mode": "copy"})
        self.assertEqual(st, 400)
        self.assertFalse(j.get("success"))


class TestGraphData(BaseIntegration):
    def test_graph_data(self):
        """图谱数据接口可返回模块/接口。"""
        st, j = req("GET", "/graph-data?project=default")
        self.assertEqual(st, 200)
        self.assertTrue(j.get("success"))
        self.assertIn("data", j)


class TestPythonModules(BaseIntegration):
    def test_quality_gate_evaluate(self):
        """Python 质量门禁 evaluate 可直接调用。"""
        sys.path.insert(0, PROJECT_DIR)
        try:
            from skills.quality_gate import evaluate
        except Exception as e:
            self.skipTest("quality_gate 导入失败: %s" % e)
            return
        res = evaluate("# 标题\n- 项\n```py\nx=1\n```", project="default")
        self.assertIsInstance(res, dict)
        self.assertIn("score", res)

    def test_draft_cache_log_audit(self):
        """draft_cache.py log-audit 子命令可写入审计。"""
        import subprocess
        db = os.path.join(PROJECT_DIR, "cache", "drafts.db")
        cmd = [sys.executable, os.path.join(PROJECT_DIR, "cache", "draft_cache.py"),
               "--db", db, "log-audit",
               "--action", "itg_test", "--operator", "itg",
               "--target", "itg", "--detail", "{}"]
        proc = subprocess.run(cmd, capture_output=True, text=True, cwd=PROJECT_DIR, timeout=30)
        self.assertEqual(proc.returncode, 0, msg="log-audit 失败: " + proc.stderr)
        out = json.loads(proc.stdout.strip())
        self.assertIn("id", out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
