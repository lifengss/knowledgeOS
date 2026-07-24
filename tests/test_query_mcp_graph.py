"""
MCP 查询服务单元测试（隔离、无需启动 REST / MCP server）。

覆盖：
  - get_knowledge_graph 透传 mode=api|entity 到 kb.graph_data
  - get_knowledge_page / search_knowledge / tfidf_code_slicer 对隔离 raw 溯源区与
    源文档全文页(prd-/req-/tr-)的过滤（安全约束）

若运行环境未安装 mcp 包，则整文件 skip。
"""
import os
import sys
import json
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_MCP_DIR = os.path.abspath(os.path.join(_HERE, "..", "mcp_connector"))

try:
    sys.path.insert(0, _MCP_DIR)
    import importlib.util
    _spec = importlib.util.spec_from_file_location(
        "qs_graph_test_mod", os.path.join(_MCP_DIR, "query_server.py")
    )
    qs = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(qs)
    _HAVE_QS = True
    _IMPORT_ERR = ""
except Exception as _e:  # pragma: no cover
    _HAVE_QS = False
    _IMPORT_ERR = str(_e)


@unittest.skipUnless(_HAVE_QS, "mcp 包 / query_server 不可用，跳过 MCP 图谱测试（%s）" % _IMPORT_ERR)
class TestQueryMcpGraph(unittest.TestCase):

    def test_graph_data_mode_forwards_to_kb(self):
        import kb_client
        captured = {}
        orig = kb_client._request

        def fake_request(method, path, **kw):
            captured["path"] = path
            captured["project"] = kw.get("project")
            captured["params"] = dict(kw.get("params") or {})
            return {"success": True, "data": {}}

        kb_client._request = fake_request
        try:
            qs.kb.graph_data(project="default", mode="entity")
        finally:
            kb_client._request = orig
        self.assertEqual(captured["params"].get("mode"), "entity")
        self.assertEqual(captured["project"], "default")

    def test_get_knowledge_graph_entity_mode(self):
        calls = {}

        def fake_graph(project=None, mode="api"):
            calls["mode"] = mode
            if mode == "entity":
                return {"success": True, "data": {
                    "nodes": [{"id": "e:user", "label": "用户模块", "type": "entity"}],
                    "edges": [{"source": "e:user", "target": "e:order", "type": "depends"}],
                }}
            return {"success": True, "data": {"nodes": [{"id": "m:auth", "type": "module"}], "edges": []}}

        orig = qs.kb.graph_data
        qs.kb.graph_data = fake_graph
        try:
            api_out = json.loads(qs.get_knowledge_graph(project="default", mode="api"))
            ent_out = json.loads(qs.get_knowledge_graph(project="default", mode="entity"))
        finally:
            qs.kb.graph_data = orig
        self.assertEqual(calls["mode"], "entity")  # 最近一次调用
        self.assertIn("nodes", api_out["data"])
        self.assertEqual(ent_out["data"]["nodes"][0]["type"], "entity")
        self.assertEqual(len(ent_out["data"]["edges"]), 1)

    def test_mcp_tools_filter_raw_and_source_pages(self):
        # get_knowledge_page 对 raw / 源文档全文页应拒绝暴露
        raw_resp = json.loads(qs.get_knowledge_page("project-wiki", "raw/secret"))
        self.assertFalse(raw_resp.get("success"))
        prd_resp = json.loads(qs.get_knowledge_page("project-wiki", "prd-V1-0-x"))
        self.assertFalse(prd_resp.get("success"))
        tr_resp = json.loads(qs.get_knowledge_page("project-wiki", "tr-foo"))
        self.assertFalse(tr_resp.get("success"))

        # 正常实体页应可读取（mock get_page）
        orig_get = qs.kb.get_page
        qs.kb.get_page = lambda c, i, project="default": {"success": True, "data": {"content": "实体内容", "frontmatter": {}}}
        try:
            ent_resp = json.loads(qs.get_knowledge_page("project-wiki", "entity-user"))
            self.assertTrue(ent_resp.get("success"))
        finally:
            qs.kb.get_page = orig_get

        # search_knowledge 结果应剔除源文档页，保留实体页
        orig_search = qs.kb.search
        qs.kb.search = lambda *a, **k: {"success": True, "data": [
            {"id": "entity-user", "category": "project-wiki", "content": "x"},
            {"id": "prd-V1-0-x", "category": "project-wiki", "content": "长文"},
            {"id": "req-y", "category": "project-wiki", "content": "长文2"},
        ]}
        try:
            s = json.loads(qs.search_knowledge("用户", project="default"))
        finally:
            qs.kb.search = orig_search
        ids = [x["id"] for x in s["data"]]
        self.assertIn("entity-user", ids)
        self.assertNotIn("prd-V1-0-x", ids)
        self.assertNotIn("req-y", ids)

        # tfidf_code_slicer 应跳过源文档全文页
        orig_list = qs.kb.list_pages
        orig_get2 = qs.kb.get_page
        qs.kb.list_pages = lambda **k: {"success": True, "data": [
            {"id": "entity-user", "category": "project-wiki"},
            {"id": "prd-V1-0-x", "category": "project-wiki"},
        ]}
        qs.kb.get_page = lambda c, i, project="default": {"success": True, "data": {"content": "c"}}
        try:
            t = json.loads(qs.tfidf_code_slicer(project="default", category="project-wiki", top_n=5, max_pages=10))
        finally:
            qs.kb.list_pages = orig_list
            qs.kb.get_page = orig_get2
        matched_ids = [m["id"] for m in t["data"]["documents"] and t["data"].get("per_document", [])]
        # per_document 仅含 entity-user
        self.assertTrue(all(m["id"] == "entity-user" for m in t["data"].get("per_document", [])))


if __name__ == "__main__":
    unittest.main()
