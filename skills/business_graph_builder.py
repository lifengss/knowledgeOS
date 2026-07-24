"""业务知识图谱构建技能（test-knowledge-system 运行期功能模块）

两层能力：
  Layer 1 生成与入库：
    读「架构设计」+「API 接口文档」→ 产出 business-flows.json（结构化，含场景依赖全部信息）
    与 业务流程与依赖图谱.md（人类可读）→ 写入当前项目的 project-wiki（入库项目 Wiki）。
    - 主入口 generate：从 project-wiki 的「架构/PRD」+「API 文档」出发，优先调用统一 AI 通道
      （codebuddy/openai）做业务依赖分析；AI 不可用或输出不合法时回退到确定性骨架。
      可由 POST /api/business-graph 触发「从文档重新生成」。
  Layer 2 服务：
    由 api/server.js 的 GET /api/business-graph 读取，供网页端渲染力导向图，
    以及业务前端（如 testcase-gen-frontend）在生成测试用例时取上下文。

设计取舍：
  - 业务步骤的语义（节点/边/场景）需要结合文档分析，纯确定性代码无法凭空臆造。
    因此重建走「AI 业务依赖分析 + 确定性骨架兜底」两条路径：
      generate：AI 优先（codebuddy/openai/none），失败回退 scaffold；
      scaffold：纯确定性，由 API 文档端点生成节点骨架（语义字段留空，待补全）。
  - 本模块另负责「校验 / 由 JSON 生成 MD / 入库 / 读取」。
  - 落库直接写 brains/<pid>/project-wiki/（与 api/server.js 写 Wiki 的模式一致），
    不依赖已失效的 gbrain_client。
"""
import json
import os
import re
import sys
import datetime
import argparse

EDGE_TYPES = {"prereq", "sequence", "produces", "context"}


# ---------------------------------------------------------------
# 读取 / 校验
# ---------------------------------------------------------------
def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _iter_endpoints(api_doc_path):
    """从 API 接口文档逐个产出 (METHOD, /path)，兼容两种写法：
       - 标题式：  ### GET /api/health
       - 表格式：  | GET | /api/health |
    """
    if not api_doc_path or not os.path.exists(api_doc_path):
        return
    try:
        text = open(api_doc_path, "r", encoding="utf-8").read()
    except Exception:
        return
    pat = re.compile(
        r"^\s*#{2,4}\s*(GET|POST|PUT|DELETE|PATCH)\s+(/[^\s|`]+)"   # 标题式
        r"|"
        r"\|\s*(GET|POST|PUT|DELETE|PATCH)\s*\|[`\s]*([^`\|\s]+)",  # 表格式
        re.M
    )
    for m in pat.finditer(text):
        method = (m.group(1) or m.group(3) or "").upper()
        raw = (m.group(2) or m.group(4) or "")
        if method and raw:
            yield method, normalize_path(raw)


def extract_endpoints(api_doc_path):
    """从 API 接口文档抽取 (METHOD, /path) 集合，用于交叉核对。"""
    return set(_iter_endpoints(api_doc_path))


def normalize_path(p):
    if not p:
        return ""
    p = p.strip()
    # 去掉查询串
    p = p.split("?")[0]
    # 规整路径参数占位符 :id / {id}
    p = re.sub(r"\{[^}]+\}", lambda m: ":" + m.group(0)[1:-1], p)
    return p.rstrip("/")


def validate(data, api_doc_path=None):
    """返回 (errors, warnings)。errors 为空才视为通过。"""
    errors, warnings = [], []
    if not isinstance(data, dict):
        return ["根节点必须是对象"], []

    for key in ("meta", "domains", "nodes", "edges", "flows"):
        if key not in data:
            errors.append("缺少顶层字段: %s" % key)

    domains = data.get("domains", []) or []
    domain_ids = {d.get("id") for d in domains if isinstance(d, dict)}

    nodes = data.get("nodes", []) or []
    node_ids = set()
    for n in nodes:
        nid = n.get("id")
        if not nid:
            errors.append("存在无 id 的节点")
            continue
        if nid in node_ids:
            errors.append("节点 id 重复: %s" % nid)
        node_ids.add(nid)
        for fld in ("domain", "title", "method", "path", "role", "summary"):
            if fld == "title":
                # 名称字段接受 title 或 label 任一
                if not (n.get("title") or n.get("label")):
                    warnings.append("节点 %s 缺少字段 title/label" % nid)
            elif not n.get(fld):
                warnings.append("节点 %s 缺少字段 %s" % (nid, fld))
        if n.get("domain") and domain_ids and n["domain"] not in domain_ids:
            errors.append("节点 %s 的 domain=%s 不在 domains 中" % (nid, n["domain"]))
        if n.get("method") and n["method"] not in (
            "GET", "POST", "PUT", "DELETE", "PATCH", "(context)"
        ):
            warnings.append("节点 %s 的 method=%s 非常规" % (nid, n["method"]))

    for e in data.get("edges", []) or []:
        for end in ("from", "to"):
            v = e.get(end)
            if v not in node_ids:
                errors.append("边 %s→%s 的 %s=%s 不是已知节点"
                              % (e.get("from", "?"), e.get("to", "?"), end, v))
        if e.get("type") not in EDGE_TYPES:
            errors.append("边 %s→%s 类型 %s 非法（应为 prereq/sequence/produces/context）"
                          % (e.get("from"), e.get("to"), e.get("type")))

    for fl in data.get("flows", []) or []:
        fid = fl.get("id", "?")
        for s in fl.get("steps", []) or []:
            if s not in node_ids:
                errors.append("场景 %s 的步骤 %s 不是已知节点" % (fid, s))

    # 可选：与 API 文档交叉核对（仅产生 warning，不阻断）
    if api_doc_path:
        endpoints = extract_endpoints(api_doc_path)
        if endpoints:
            for n in nodes:
                if n.get("method") in ("(context)",) or n.get("domain") == "P":
                    continue
                ep = (n.get("method"), normalize_path(n.get("path", "")))
                if ep not in endpoints:
                    warnings.append("节点 %s 的接口 %s %s 未在 API 文档中找到"
                                    % (n.get("id"), n.get("method"), n.get("path")))

    return errors, warnings


# ---------------------------------------------------------------
# JSON → Markdown（含场景依赖全部信息）
# ---------------------------------------------------------------
def json_to_markdown(data):
    meta = data.get("meta", {})
    domains = data.get("domains", []) or []
    nodes = data.get("nodes", []) or []
    edges = data.get("edges", []) or []
    flows = data.get("flows", []) or []
    domain_map = {d.get("id"): d for d in domains if isinstance(d, dict)}
    node_map = {n.get("id"): n for n in nodes}

    L = []
    L.append("# %s" % (meta.get("title") or "业务流程与依赖知识图谱"))
    L.append("")
    L.append("> 版本 %s · 生成于 %s · 来源 %s"
             % (meta.get("version", "-"), meta.get("generatedAt", "-"),
                "、".join(meta.get("generatedFrom", []) or [])))
    L.append("")
    if meta.get("nodeSemantics"):
        L.append("- 节点语义：%s" % meta["nodeSemantics"])
    if meta.get("edgeSemantics"):
        L.append("- 边语义：%s" % meta["edgeSemantics"])
    L.append("")

    # 业务域
    L.append("## 一、业务域")
    L.append("")
    L.append("| 域 | 含义 | 颜色 |")
    L.append("|----|------|------|")
    for d in domains:
        L.append("| %s | %s | %s |" % (d.get("id"), d.get("name"), d.get("color")))
    L.append("")

    # 业务步骤节点
    L.append("## 二、业务步骤节点（%d）" % len(nodes))
    L.append("")
    L.append("| 步骤 | 域 | 接口 | 角色 | 摘要 | 产出 | 前置资源 |")
    L.append("|------|----|------|------|------|------|----------|")
    for n in nodes:
        api = n.get("api") or (
            "%s %s" % (n.get("method"), n.get("path")) if n.get("method") else "—")
        prod = "、".join(n.get("produces") or []) or "—"
        cons = "、".join(n.get("consumes") or []) or "—"
        L.append("| **%s** %s | %s | `%s` | %s | %s | %s | %s |"
                 % (n.get("id"), n.get("title") or n.get("label") or "",
                    n.get("domain"), api, n.get("role"), n.get("summary") or "", prod, cons))
    L.append("")

    # 依赖边
    L.append("## 三、依赖关系（%d）" % len(edges))
    L.append("")
    L.append("| 前置(From) | 类型 | 后继(To) | 说明 |")
    L.append("|-----------|------|---------|------|")
    for e in edges:
        L.append("| %s | %s | %s | %s |"
                 % (e.get("from"), e.get("type"), e.get("to"), e.get("label") or ""))
    L.append("")

    # 可测试场景
    L.append("## 四、可测试场景（%d）" % len(flows))
    L.append("")
    for fl in flows:
        L.append("### %s · %s" % (fl.get("id"), fl.get("name")))
        L.append("")
        L.append("%s" % (fl.get("description") or ""))
        L.append("")
        L.append("步骤链：%s" % " → ".join(fl.get("steps", []) or []))
        L.append("")
    return "\n".join(L)


# ---------------------------------------------------------------
# 由 API 文档生成骨架（端点 → 节点，待补全语义）
# ---------------------------------------------------------------
def scaffold_from_api_doc(api_doc_path, arch_doc_path=None):
    """扫描 API 文档端点，生成 nodes 骨架 + 默认 domains。语义字段留空待补全。"""
    endpoints = list(_iter_endpoints(api_doc_path))
    nodes = []
    for i, (method, p) in enumerate(endpoints, 1):
        nodes.append({
            "id": "A%d" % i,
            "domain": "A",
            "title": p,
            "method": method,
            "path": p,
            "api": "%s %s" % (method, p),
            "role": "",
            "summary": "",
            "produces": [],
            "consumes": [],
        })
    data = {
        "meta": {
            "title": "业务流程与依赖知识图谱（骨架）",
            "version": "0.1",
            "generatedFrom": [os.path.basename(x) for x in (arch_doc_path, api_doc_path) if x],
            "generatedAt": datetime.date.today().isoformat(),
            "nodeSemantics": "节点 = 一次带语义的业务步骤（对应一次 API 调用）",
            "edgeSemantics": "有向边 A→B 表示 B 在业务上依赖/须在 A 之后发生",
        },
        "domains": [
            {"id": "A", "name": "API 步骤", "color": "#60a5fa"},
            {"id": "P", "name": "上下文/前置", "color": "#9aa7b5"},
        ],
        "nodes": nodes,
        "edges": [],
        "flows": [],
    }
    return data


# ---------------------------------------------------------------
# 入库 / 读取
# ---------------------------------------------------------------
def ingest(json_obj, md_text, project_brain_dir):
    """写入 brains/<pid>/project-wiki/（入库项目 Wiki）。"""
    pw = os.path.join(project_brain_dir, "project-wiki")
    os.makedirs(pw, exist_ok=True)
    with open(os.path.join(pw, "business-flows.json"), "w", encoding="utf-8") as f:
        json.dump(json_obj, f, ensure_ascii=False, indent=2)
    with open(os.path.join(pw, "business-flows.md"), "w", encoding="utf-8") as f:
        f.write(md_text)
    return os.path.join(pw, "business-flows.json")


def load(project_brain_dir):
    p = os.path.join(project_brain_dir, "project-wiki", "business-flows.json")
    if not os.path.exists(p):
        return None
    return load_json(p)


# ---------------------------------------------------------------
# AI 驱动的业务依赖分析（从 project-wiki 文档重新生成）
# ---------------------------------------------------------------
def _read_truncated(path, limit=4000):
    try:
        text = open(path, "r", encoding="utf-8").read()
    except Exception:
        return ""
    if len(text) > limit:
        return text[:limit] + "\n…[内容已截断]\n"
    return text


GENERATE_SYSTEM = (
    "你是业务流程建模专家。基于给定的「系统架构 / PRD」与「API 接口文档」，"
    "抽取业务步骤、步骤间依赖关系，以及可测试业务场景，输出严格符合规范的 JSON。\n"
    "JSON 顶层结构：\n"
    "{ \"meta\": {...}, \"domains\": [...], \"nodes\": [...], \"edges\": [...], \"flows\": [...] }\n"
    "- meta: { title, version, generatedAt(留空), generatedFrom:[文件名...], nodeSemantics, edgeSemantics }\n"
    "- domains: [{ id, name, color }] 业务域分组（color 用十六进制，如 #f59e0b）\n"
    "- nodes: 每个 API 或业务步骤一个节点，字段：\n"
    "    id(唯一, 如 C1/F1), domain(对应 domains.id), title 或 label(步骤名),\n"
    "    method(GET/POST/PUT/DELETE/PATCH/(context)), path(接口路径, 无则空串),\n"
    "    api(\"METHOD /path\"), role(write/read/context/...), summary(一句话说明),\n"
    "    produces:[产出物], consumes:[前置资源]\n"
    "- edges: 依赖边 { from, to, type, label }，type ∈ { prereq, sequence, produces, context }\n"
    "    prereq=前置条件, sequence=时序先后, produces=A 产出供 B 使用, context=B 依赖 A 的上下文\n"
    "- flows: 可测试场景 { id, name, description, steps:[nodeId...] 按业务顺序 }\n"
    "必须只输出一个 JSON 对象，不要任何额外解释文字或 markdown 代码块围栏。"
)


def collect_source_docs(brain_dir):
    """从 brains/<pid>/project-wiki 收集架构/PRD 与 API 文档路径。"""
    pw = os.path.join(brain_dir, "project-wiki")
    arch, api = [], []
    if not os.path.isdir(pw):
        return arch, api
    for fn in sorted(os.listdir(pw)):
        if not fn.endswith(".md"):
            continue
        full = os.path.join(pw, fn)
        low = fn.lower()
        if "架构" in fn or low.startswith("prd") or "需求" in fn:
            arch.append(full)
        elif low == "api-overview.md":
            api.insert(0, full)          # 概览优先
        elif low.startswith("api-"):
            api.append(full)
    return arch, api


def _extract_json(text):
    try:
        return json.loads(text)
    except Exception:
        pass
    s, e = text.find("{"), text.rfind("}")
    if s != -1 and e != -1 and e > s:
        try:
            return json.loads(text[s:e + 1])
        except Exception:
            return None
    return None


def _call_ai(prompt):
    """调用 KS 统一 AI 通道（codebuddy/openai/none）。不可用时返回 None。"""
    ai_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ai")
    if not os.path.isdir(ai_dir):
        return None
    sys.path.insert(0, ai_dir)
    try:
        from ai_adapter import call_provider
    except Exception:
        return None
    try:
        return call_provider(prompt, system=GENERATE_SYSTEM)
    except Exception:
        return None


def generate(brain_dir, use_ai=True):
    """从 project-wiki 文档重新生成业务图谱。
    优先 AI 业务依赖分析；AI 不可用 / 输出不合法时回退到确定性骨架（scaffold）。
    返回 { success, source, valid, nodes, edges, flows, path, warnings }。
    """
    arch_docs, api_docs = collect_source_docs(brain_dir)
    # 候选 API 文档：project-wiki 中的详细接口文档，外加仓库级 API 主文档
    # （api-overview.md 仅为汇总页、各 api-*.md 为函数签名，均不含 method|path 表格）
    repo_docs = []
    repo_api = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "docs", "API-INTERFACE-DOC.md")
    if os.path.exists(repo_api):
        repo_docs.append(repo_api)
    candidates = [p for p in api_docs
                  if os.path.basename(p).lower() != "api-overview.md"] + repo_docs
    scored = sorted(((p, len(extract_endpoints(p))) for p in candidates),
                    key=lambda x: x[1], reverse=True)
    api_main = scored[0][0] if scored else (api_docs[0] if api_docs else None)
    arch_main = arch_docs[0] if arch_docs else None

    data, source = None, "deterministic"
    if use_ai:
        fragments = []
        for p in arch_docs[:2]:
            fragments.append("==== 架构/PRD 文档：%s ====\n%s" % (os.path.basename(p), _read_truncated(p, 6000)))
        for p in api_docs[:6]:
            fragments.append("==== API 文档：%s ====\n%s" % (os.path.basename(p), _read_truncated(p, 3000)))
        if fragments:
            prompt = ("以下是知识管理系统的架构/PRD 与 API 文档片段，请据此抽取业务步骤、依赖与可测试场景，"
                      "严格输出规范 JSON：\n\n" + "\n\n".join(fragments))
            text = _call_ai(prompt)
            if text:
                cand = _extract_json(text)
                if cand:
                    errs, _ = validate(cand)
                    if not errs:
                        data = cand
                        source = "ai"
                        data.setdefault("meta", {})["generatedAt"] = datetime.date.today().isoformat()

    if data is None:
        data = scaffold_from_api_doc(api_main, arch_main)
        data["meta"]["generatedFrom"] = [
            os.path.basename(x) for x in (arch_main, api_main) if x
        ]
        source = "deterministic"

    errs, warns = validate(data)
    md = json_to_markdown(data)
    out = ingest(data, md, brain_dir)
    return {
        "success": True,
        "source": source,
        "valid": not errs,
        "nodes": len(data.get("nodes", [])),
        "edges": len(data.get("edges", [])),
        "flows": len(data.get("flows", [])),
        "path": out,
        "warnings": warns,
    }


# ---------------------------------------------------------------
# CLI
# ---------------------------------------------------------------
def main(argv=None):
    ap = argparse.ArgumentParser(description="业务知识图谱构建")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_val = sub.add_parser("validate", help="校验 JSON 合法性 + 边/场景引用 + 可选与 API 文档交叉核对")
    p_val.add_argument("json")
    p_val.add_argument("--doc", help="API 接口文档路径，用于交叉核对")
    p_val.add_argument("--quiet", action="store_true")

    p_md = sub.add_parser("md", help="由 JSON 生成 Markdown")
    p_md.add_argument("json")
    p_md.add_argument("--out", help="输出 .md 路径（默认打印到 stdout）")

    p_sc = sub.add_parser("scaffold", help="由 API 文档生成 JSON 骨架")
    p_sc.add_argument("--api", required=True)
    p_sc.add_argument("--arch")
    p_sc.add_argument("--out", required=True)

    p_in = sub.add_parser("ingest", help="入库：JSON+MD 写入 project-wiki")
    p_in.add_argument("json")
    p_in.add_argument("--brain", required=True, help="brains/<pid> 目录")
    p_in.add_argument("--md", help="已有 .md 路径；省略则自动从 JSON 生成")

    p_ld = sub.add_parser("load", help="读取已入库的 JSON")
    p_ld.add_argument("--brain", required=True)
    p_ld.add_argument("--out", help="输出路径；省略则打印")

    p_gen = sub.add_parser("generate", help="从 project-wiki 文档重新生成业务图谱（AI 优先，确定性回退）")
    p_gen.add_argument("--brain", required=True, help="brains/<pid> 目录")
    p_gen.add_argument("--ai", dest="use_ai", action="store_true", default=True,
                       help="启用 AI 业务依赖分析（默认）")
    p_gen.add_argument("--no-ai", dest="use_ai", action="store_false",
                       help="仅用确定性骨架（不调用 AI）")

    args = ap.parse_args(argv)

    if args.cmd == "validate":
        data = load_json(args.json)
        errs, warns = validate(data, args.doc)
        if not args.quiet:
            for w in warns:
                print("WARN: %s" % w)
        if errs:
            for e in errs:
                print("ERROR: %s" % e)
            print("\n校验失败：%d 错误 / %d 警告" % (len(errs), len(warns)))
            return 1
        print("校验通过：0 错误 / %d 警告" % len(warns))
        return 0

    if args.cmd == "md":
        data = load_json(args.json)
        md = json_to_markdown(data)
        if args.out:
            with open(args.out, "w", encoding="utf-8") as f:
                f.write(md)
            print("已生成 %s" % args.out)
        else:
            print(md)
        return 0

    if args.cmd == "scaffold":
        data = scaffold_from_api_doc(args.api, args.arch)
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("已生成骨架 %s（%d 个端点节点，待补全语义）" % (args.out, len(data["nodes"])))
        return 0

    if args.cmd == "ingest":
        data = load_json(args.json)
        errs, warns = validate(data)
        if errs:
            for e in errs:
                print("ERROR: %s" % e)
            print("校验未通过，已中止入库"); return 1
        md = open(args.md, "r", encoding="utf-8").read() if args.md else json_to_markdown(data)
        out = ingest(data, md, args.brain)
        print("已入库：%s" % out)
        return 0

    if args.cmd == "load":
        data = load(args.brain)
        if data is None:
            print("未找到已入库的业务图谱"); return 1
        if args.out:
            with open(args.out, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print("已写出 %s" % args.out)
        else:
            print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0

    if args.cmd == "generate":
        res = generate(args.brain, args.use_ai)
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return 0


if __name__ == "__main__":
    sys.exit(main())
