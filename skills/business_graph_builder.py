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
def _domain_of_path(p):
    """由接口路径推断业务域（取 /api/<resource> 的资源段或首段）。"""
    seg = [x for x in p.split('/') if x and not x.startswith(':')]
    if seg and seg[0].lower() == 'api' and len(seg) > 1:
        return seg[1]
    if seg:
        return seg[0]
    return 'root'


_DOMAIN_PALETTE = ['#60a5fa', '#f59e0b', '#34d399', '#f472b6', '#a78bfa',
                  '#fbbf24', '#22d3ee', '#fb7185', '#4ade80', '#c084fc']


def scaffold_from_api_doc(api_doc_path, arch_doc_path=None):
    """扫描 API 文档端点，生成 nodes 骨架 + 业务域聚合 + 依赖边 + 可测试场景。
    语义字段留空待 AI 业务分析补全；但保证图谱连通（端点→业务域→系统根）且每个
    业务域对应一个可测试场景，避免退化成「孤立一圈节点、无连线、无场景」。"""
    endpoints = list(_iter_endpoints(api_doc_path))
    role_of = {'GET': 'read', 'POST': 'write', 'PUT': 'write',
               'DELETE': 'write', 'PATCH': 'write'}
    domain_ids, domain_name = [], {}
    raw_nodes = []
    for i, (method, p) in enumerate(endpoints, 1):
        did = _domain_of_path(p)
        if did not in domain_name:
            domain_name[did] = did.replace('-', ' ').replace('_', ' ').title()
            domain_ids.append(did)
        raw_nodes.append({
            "id": "N%d" % i,
            "domain": did,
            "title": p,
            "label": p,
            "method": method,
            "path": p,
            "api": "%s %s" % (method, p),
            "role": role_of.get(method.upper(), 'context'),
            "summary": "",
            "produces": [],
            "consumes": [],
        })

    # 业务域聚合根 + 系统根，作为连线枢纽使整图连通
    ROOT = "ROOT"
    hub_nodes = []
    for did in domain_ids:
        hub_nodes.append({
            "id": did, "domain": did, "title": domain_name[did], "label": domain_name[did],
            "method": "(module)", "path": "", "api": "",
            "role": "module", "summary": "业务模块聚合根",
            "produces": [], "consumes": [],
        })
    hub_nodes.append({
        "id": ROOT, "domain": ROOT, "title": "知识管理系统", "label": "知识管理系统",
        "method": "(system)", "path": "", "api": "",
        "role": "system", "summary": "系统总入口",
        "produces": [], "consumes": [],
    })
    nodes = hub_nodes + raw_nodes

    # 依赖边：端点 → 所属业务域 → 系统根
    edges = []
    for n in raw_nodes:
        edges.append({"from": n["id"], "to": n["domain"],
                      "type": "context", "label": "属于 " + domain_name.get(n["domain"], n["domain"])})
    for did in domain_ids:
        edges.append({"from": did, "to": ROOT, "type": "context", "label": "子系统"})

    # 可测试场景：每个业务域一条，步骤为其下全部端点（按文档出现顺序）
    flows = []
    by_domain = {}
    for n in raw_nodes:
        by_domain.setdefault(n["domain"], []).append(n["id"])
    for did in domain_ids:
        steps = by_domain.get(did, [])
        if steps:
            flows.append({
                "id": "F_" + did,
                "name": domain_name.get(did, did) + " 业务场景",
                "description": "基于「" + domain_name.get(did, did) + "」模块接口梳理的可测试业务场景"
                               "（确定性骨架；AI 业务分析可用时会被更精细的依赖关系替代）。",
                "steps": steps,
            })

    domains = [{"id": did, "name": domain_name[did],
                "color": _DOMAIN_PALETTE[idx % len(_DOMAIN_PALETTE)]}
               for idx, did in enumerate(domain_ids)]
    domains.append({"id": ROOT, "name": "知识管理系统", "color": "#e2e8f0"})

    data = {
        "meta": {
            "title": "业务流程与依赖知识图谱（骨架）",
            "version": "0.1",
            "generatedFrom": [os.path.basename(x) for x in (arch_doc_path, api_doc_path) if x],
            "generatedAt": datetime.date.today().isoformat(),
            "nodeSemantics": "节点 = 一次 API 调用（业务步骤）；圆角枢纽节点 = 业务域/系统聚合",
            "edgeSemantics": "端点→业务域→系统根 表示归属与协同依赖",
        },
        "domains": domains,
        "nodes": nodes,
        "edges": edges,
        "flows": flows,
    }
    return data


def _heading_nodes(body):
    """从 markdown 正文抽取 H2/H3 标题，返回 [(level, text)]。"""
    out = []
    for line in (body or '').splitlines():
        m = re.match(r'^\s{0,3}(#{2,3})\s+(.+?)\s*#*$', line)
        if m:
            out.append((len(m.group(1)), m.group(2).strip()))
    return out


def scaffold_from_doc(pg, index=None):
    """从 PRD / 需求 / 实体 文档确定性抽取业务节点与依赖边（API 通道不可用时的兜底）。
    - 文档枢纽节点 page_<id>，H2 为二级模块节点、H3 为业务步骤节点；
    - H3 → H2 → page_hub 为归属（context）边；
    - 文档间 [[wikilink]] 为跨文档依赖（depends）边。
    节点 method/path 置空（语义待 AI 补全），保证 PRD 主导的项目也能产出连通子图。
    """
    body = pg.get('body') or ''
    pid = pg['id']
    hub = 'page_' + _slug(pid)
    nodes = [{
        'id': hub, 'domain': hub, 'title': pg.get('title') or pid, 'label': pg.get('title') or pid,
        'method': None, 'path': '', 'api': '', 'role': 'module',
        'summary': (pg.get('summary') or '')[:240], 'produces': [], 'consumes': [], 'notes': '',
    }]
    edges = []
    cur_h2 = None
    for level, text in _heading_nodes(body):
        nid = 'page_' + _slug(pid) + '_' + _slug(text)
        if level == 2:
            cur_h2 = nid
            nodes.append({
                'id': nid, 'domain': hub, 'title': text, 'label': text,
                'method': None, 'path': '', 'api': '', 'role': 'module',
                'summary': '', 'produces': [], 'consumes': [], 'notes': '',
            })
            edges.append({'from': nid, 'to': hub, 'type': 'context', 'label': '属于文档'})
        else:
            parent = cur_h2 or hub
            nodes.append({
                'id': nid, 'domain': hub, 'title': text, 'label': text,
                'method': None, 'path': '', 'api': '', 'role': 'step',
                'summary': '', 'produces': [], 'consumes': [], 'notes': '',
            })
            edges.append({'from': nid, 'to': parent, 'type': 'context', 'label': '属于'})
    # 跨文档 wikilink 依赖边
    pages = (index or {}).get('pages', {})
    for link in pg.get('links') or []:
        tid = link.strip()
        if tid in pages and tid != pid:
            edges.append({'from': hub, 'to': 'page_' + _slug(tid), 'type': 'depends', 'label': '引用'})
    # 按 id 去重（同文档内重复标题）
    seen, uniq = set(), []
    for n in nodes:
        if n['id'] in seen:
            continue
        seen.add(n['id']); uniq.append(n)
    return {'nodes': uniq, 'edges': edges}


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


def _call_ai(prompt, system=GENERATE_SYSTEM):
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
        return call_provider(prompt, system=system)
    except Exception:
        return None


# ---------------------------------------------------------------
# 基于项目 Wiki 的分治生成（方案A：规划 → 逐场景生成 → 合并优化 + BFS）
# ---------------------------------------------------------------
GENERATE_PLAN_SYSTEM = (
    "你是软件架构分析师。基于项目 Wiki 的模块清单与文档摘要，识别可测试的业务场景并归类，"
    "只输出符合要求的 JSON，不要输出多余说明。"
)
GENERATE_SCENARIO_SYSTEM = (
    "你是业务分析师。基于给定的项目 Wiki 素材，抽取单个业务场景的业务步骤节点、依赖边与可测试流程，"
    "只输出符合要求的 JSON，不要输出多余说明。"
)

WIKILINK_RE = re.compile(r'\[\[([^\]]+)\]\]')
DOMAIN_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9',
                  '#a855f7', '#14b8a6', '#ec4899', '#84cc16', '#f97316']


def _slug(s):
    s = re.sub(r'[^\w一-鿿]+', '_', (s or '').strip().lower())
    return s.strip('_') or 'x'


def _norm_key(s):
    return re.sub(r'\s+', '', (s or '').lower())


def _parse_frontmatter(text):
    fm = {}
    m = re.match(r'^---\s*\n(.*?)\n---\s*\n', text, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ':' in line:
                k, v = line.split(':', 1)
                k, v = k.strip(), v.strip()
                if v.startswith('[') and v.endswith(']'):
                    inner = v[1:-1].strip()
                    fm[k] = [x.strip() for x in inner.split(',') if x.strip()] if inner else []
                else:
                    fm[k] = v
    return fm


def _index_wiki(brain_dir):
    """扫描 project-wiki，构建页面/模块/标签索引，供规划与检索使用。"""
    pw = os.path.join(brain_dir, 'project-wiki')
    pages = {}
    if not os.path.isdir(pw):
        return {'pages': pages, 'modules': [], 'tags': {}}
    for fn in sorted(os.listdir(pw)):
        if not fn.endswith('.md') or fn == 'business-flows.json':
            continue
        p = os.path.join(pw, fn)
        try:
            text = open(p, 'r', encoding='utf-8').read()
        except Exception:
            continue
        fm = _parse_frontmatter(text)
        body = text
        if body.startswith('---'):
            body = re.sub(r'^---\s*\n.*?\n---\s*\n', '', body, flags=re.S)
        kind = ('api' if fn.startswith('api-') else 'prd' if fn.startswith('prd-')
                else 'req' if fn.startswith('req-') else 'entity' if fn.startswith('entity-') else 'other')
        title = fm.get('title') or (re.search(r'^#\s+(.+)$', body, re.M) and re.search(r'^#\s+(.+)$', body, re.M).group(1)) or fn
        tags = fm.get('tags') or []
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(',') if t.strip()]
        summary = fm.get('aiSummary') or fm.get('summary') or ''
        links = WIKILINK_RE.findall(body)
        pages[fn[:-3]] = {
            'id': fn[:-3], 'title': title, 'tags': tags, 'summary': summary,
            'links': links, 'kind': kind, 'path': p, 'body': body,
        }
    modules = [pid for pid, pg in pages.items() if pg['kind'] in ('api', 'prd', 'req', 'entity')]
    tags_map = {}
    for pid, pg in pages.items():
        for t in pg['tags']:
            tags_map.setdefault(t, []).append(pid)
    return {'pages': pages, 'modules': modules, 'tags': tags_map}


def _module_label(index, mid):
    pg = index['pages'].get(mid)
    return pg['title'] if pg else mid.replace('api-', '')


def plan_scenarios(index, focus_modules=None, use_ai=True):
    """返回场景种子列表: [{id, name, description, focus_modules:[], focus_tags:[]}]。"""
    modules = focus_modules or index['modules']
    modules = [m for m in modules if m in index['pages']]
    if not modules:
        modules = index['modules']
    if use_ai:
        text = _plan_with_ai(index, modules)
        if text:
            sc = _extract_json(text)
            lst = (sc or {}).get('scenarios') if isinstance(sc, dict) else None
            if lst and isinstance(lst, list) and lst:
                out = []
                for s in lst:
                    fmods = [m for m in (s.get('focus_modules') or []) if m in index['pages']]
                    if not fmods:
                        continue
                    out.append({
                        'id': _slug(s.get('id') or s.get('name') or ('sc_%d' % len(out))),
                        'name': s.get('name') or _module_label(index, fmods[0]),
                        'description': s.get('description') or '',
                        'focus_modules': fmods,
                        'focus_tags': s.get('focus_tags') or [],
                    })
                if out:
                    return out
    # 确定性兜底：AI 不可用时返回单全量场景
    return _deterministic_scenarios(index, modules)


def _deterministic_scenarios(index, modules):
    """确定性兜底：AI 不可用时返回单个全量场景（按端点最多的文档抽取骨架）。"""
    return [{
        'id': 'det_global',
        'name': '确定性全量生成',
        'description': 'AI 不可用时基于全量 project-wiki 端点抽取生成的确定性骨架',
        'focus_modules': None,
        'focus_tags': [],
    }]


def _plan_with_ai(index, modules):
    lines = ['- %s: %s' % (m, _module_label(index, m)) for m in modules]
    prd = []
    for pid, pg in index['pages'].items():
        if pg['kind'] in ('prd', 'req') and pg['summary']:
            prd.append('- %s: %s' % (pg['title'], pg['summary'][:300]))
    prompt = ("项目模块清单:\n%s\n\nPRD/需求摘要:\n%s\n\n"
              "请识别本系统的业务场景（可测试的端到端流程），每个场景聚合相关模块。\n"
              "输出严格 JSON: {\"scenarios\":[{\"id\":\"sc_xxx\",\"name\":\"场景名\",\"description\":\"一句话\","
              "\"focus_modules\":[\"api-xxx\"],\"focus_tags\":[\"标签\"]}]}\n"
              "约束: 场景数 4~24; focus_modules 必须是上面列出的模块 id; 若信息不足则每个模块一个场景。"
              % ("\n".join(lines), "\n".join(prd[:8])))
    return _call_ai(prompt, system=GENERATE_PLAN_SYSTEM)


def retrieve_for_scenario(index, scenario, budget=4200):
    """为场景检索相关 Wiki 素材（聚焦模块 + 标签命中 + wikilink 邻居），截断拼接。"""
    picked = {}
    def pick(pid, limit):
        pg = index['pages'].get(pid)
        if not pg or pid in picked:
            return
        picked[pid] = _read_truncated(pg['path'], limit)
    for m in scenario.get('focus_modules') or []:
        pick(m, 1600)
    for t in scenario.get('focus_tags') or []:
        for pid in index['tags'].get(t, [])[:3]:
            pick(pid, 1200)
    seen = set(picked.keys())
    for m in scenario.get('focus_modules') or []:
        pg = index['pages'].get(m)
        if not pg:
            continue
        for nb in pg['links'][:6]:
            if nb in index['pages'] and nb not in seen:
                pick(nb, 800); seen.add(nb)
    frags = ["==== 文档：%s ====\n%s" % (index['pages'][pid]['title'], txt)
             for pid, txt in picked.items()]
    out, total = [], 0
    for f in frags:
        if total + len(f) > budget:
            out.append(f[:max(200, budget - total)])
            break
        out.append(f); total += len(f)
    return "\n\n".join(out)


def generate_scenario(index, scenario, use_ai=True):
    """生成单个场景子图: {nodes, edges, flow, related_modules}。AI 失败回退确定性骨架。"""
    material = retrieve_for_scenario(index, scenario)
    if use_ai and material:
        prompt = ("业务场景: %s\n描述: %s\n\n相关项目 Wiki 素材:\n%s\n\n"
                  "请输出该场景的业务知识子图，严格 JSON:\n"
                  "{\"nodes\":[{\"id\":\"node_id\",\"domain\":\"域id\",\"title\":\"中文名\",\"method\":null,\"path\":null,"
                  "\"api\":\"...\",\"role\":\"...\",\"summary\":\"...\",\"produces\":[],\"consumes\":[],\"notes\":\"\"}],"
                  "\"edges\":[{\"from\":\"节点id\",\"to\":\"节点id\",\"type\":\"sequence|data|depends|call\",\"label\":\"...\"}],"
                  "\"flow\":{\"id\":\"%s\",\"name\":\"%s\",\"description\":\"\",\"steps\":[\"步骤(节点id)\"]},"
                  "\"related_modules\":[\"api-yyy\"]}\n"
                  "约束: 仅用素材中出现的概念; 节点 id 用小写蛇形; related_modules 列出本场景依赖但未覆盖的其它已知模块 id;"
                  "若素材不足以生成，返回空 nodes 与空 related_modules。"
                  % (scenario.get('name', ''), scenario.get('description', ''), material,
                     scenario.get('id', 'sc'), scenario.get('name', '场景')))
        text = _call_ai(prompt, system=GENERATE_SCENARIO_SYSTEM)
        if text:
            sub = _extract_json(text)
            if isinstance(sub, dict) and (sub.get('nodes') or sub.get('edges') or sub.get('flow')):
                return {
                    'nodes': sub.get('nodes') or [],
                    'edges': sub.get('edges') or [],
                    'flow': sub.get('flow') or {'id': scenario.get('id'), 'name': scenario.get('name'), 'steps': []},
                    'related_modules': [m for m in (sub.get('related_modules') or []) if m in index['pages']],
                }
    return _scaffold_scenario(index, scenario)


def _scaffold_global(index):
    """确定性全局骨架：优先 API 端点骨架，并补充 PRD/需求/实体 文档的确定性抽取，保证连通。"""
    candidates = [pid for pid in index['pages'] if pid != 'api-overview']
    # 1) API 端点骨架（若有端点）
    scored = sorted(((pid, len(extract_endpoints(index['pages'][pid]['path']))) for pid in candidates),
                    key=lambda x: x[1], reverse=True)
    nodes, edges = [], []
    if scored and scored[0][1] > 0:
        api_main = scored[0][0]
        try:
            g = scaffold_from_api_doc(index['pages'][api_main]['path'], None)
            nodes.extend(g.get('nodes', [])); edges.extend(g.get('edges', []))
        except Exception:
            pass
    # 2) 非 API 文档（PRD/需求/实体）确定性抽取，确保 PRD 主导项目也有节点
    for pid in candidates:
        pg = index['pages'][pid]
        if pg['kind'] == 'api':
            continue
        try:
            g = scaffold_from_doc(pg, index)
            nodes.extend(g.get('nodes', [])); edges.extend(g.get('edges', []))
        except Exception:
            pass
    if not nodes:
        return {'nodes': [], 'edges': [],
                'flow': {'id': 'det', 'name': '确定性全量', 'steps': []}, 'related_modules': []}
    seen, uniq = set(), []
    for n in nodes:
        if n.get('id') in seen:
            continue
        seen.add(n.get('id')); uniq.append(n)
    return {'nodes': uniq, 'edges': edges,
            'flow': {'id': 'det', 'name': '确定性全量', 'steps': [n.get('id') for n in uniq if n.get('id')]},
            'related_modules': []}


def _scaffold_scenario(index, scenario):
    """确定性场景骨架：按聚焦模块种类分派（API→端点骨架；PRD/需求/实体→文档抽取）。"""
    if not scenario.get('focus_modules'):
        return _scaffold_global(index)
    nodes, edges = [], []
    for m in scenario['focus_modules']:
        pg = index['pages'].get(m)
        if not pg:
            continue
        try:
            if pg['kind'] == 'api':
                g = scaffold_from_api_doc(pg['path'], pg['path'])
            else:
                g = scaffold_from_doc(pg, index)
            nodes.extend(g.get('nodes', [])); edges.extend(g.get('edges', []))
        except Exception:
            pass
    if len(nodes) <= 1:
        return _scaffold_global(index)
    flow = {'id': scenario.get('id'), 'name': scenario.get('name'), 'description': '',
            'steps': [n.get('id') for n in nodes if n.get('id')]}
    return {'nodes': nodes, 'edges': edges, 'flow': flow, 'related_modules': []}


def merge_graph(scenarios, brain_dir=None):
    """合并多场景子图为最终图谱: 去重节点/边、分配稳定 id、构建域与配色、汇总 flows。"""
    node_by_key = {}
    id_remap = {}
    nodes, edges, flows = [], [], []
    edge_keys = set()

    def ensure_node(n):
        key = _norm_key(n.get('title') or n.get('id'))
        # 同时以节点 id 的归一化形式建索引，使边（按 id 引用）也能正确重映射
        alt = _norm_key(n.get('id') or n.get('title'))
        if key in node_by_key:
            ex = node_by_key[key]
            for f in ('produces', 'consumes'):
                seen = set(ex.get(f, []))
                for v in (n.get(f) or []):
                    if v not in seen:
                        seen.add(v); ex.setdefault(f, []).append(v)
            if not ex.get('summary') and n.get('summary'):
                ex['summary'] = n['summary']
            return id_remap[key]
        nid = n.get('id') or key
        id_remap[key] = nid
        if alt != key:
            id_remap[alt] = nid
        node_by_key[key] = n
        nodes.append({
            'id': nid, 'domain': n.get('domain') or 'default', 'title': n.get('title') or nid,
            'method': n.get('method'), 'path': n.get('path'), 'api': n.get('api') or '',
            'role': n.get('role') or '', 'summary': n.get('summary') or '',
            'produces': n.get('produces') or [], 'consumes': n.get('consumes') or [],
            'notes': n.get('notes') or '',
        })
        return nid

    for sc in scenarios:
        for n in sc.get('nodes') or []:
            ensure_node(n)
        for e in sc.get('edges') or []:
            f = id_remap.get(_norm_key(e.get('from')))
            t = id_remap.get(_norm_key(e.get('to')))
            if not f or not t:
                continue
            k = (f, t, e.get('type') or 'sequence')
            if k in edge_keys:
                continue
            edge_keys.add(k)
            edges.append({'from': f, 'to': t, 'type': e.get('type') or 'sequence', 'label': e.get('label') or ''})
        fl = sc.get('flow')
        if fl and fl.get('name'):
            steps = [id_remap.get(_norm_key(s)) or s for s in (fl.get('steps') or [])]
            flows.append({'id': fl.get('id') or _slug(fl.get('name')), 'name': fl['name'],
                          'description': fl.get('description') or '', 'steps': [s for s in steps if s]})

    domains, dmap = [], {}
    for n in nodes:
        d = n['domain']
        if d not in dmap:
            dmap[d] = len(domains)
            domains.append({'id': d, 'name': d, 'color': DOMAIN_PALETTE[len(domains) % len(DOMAIN_PALETTE)]})
        n['domain'] = d

    data = {
        'meta': {'title': '业务流程与依赖知识图谱', 'version': '1.0',
                 'generatedAt': datetime.date.today().isoformat()},
        'domains': domains, 'nodes': nodes, 'edges': edges, 'flows': flows,
    }
    errs, warns = validate(data)
    return data, warns


def run_pipeline(brain_dir, use_ai=True, focus_modules=None, max_scenarios=40, max_depth=3):
    """完整管道: 规划 → BFS 逐场景生成 → 合并优化。返回 (data, warnings, seed_count)。"""
    index = _index_wiki(brain_dir)
    seeds = plan_scenarios(index, focus_modules, use_ai)
    queue = list(seeds)
    visited = set()
    collected = []
    depth = {s['id']: 0 for s in seeds}
    while queue and len(collected) < max_scenarios:
        sc = queue.pop(0)
        if sc['id'] in visited:
            continue
        visited.add(sc['id'])
        sub = generate_scenario(index, sc, use_ai)
        collected.append({'scenario': sc, 'nodes': sub['nodes'], 'edges': sub['edges'], 'flow': sub['flow']})
        d = depth.get(sc['id'], 0)
        for rm in sub.get('related_modules') or []:
            if rm in visited or len(collected) + len(queue) >= max_scenarios or d >= max_depth:
                continue
            nid = 'm_' + rm
            if nid not in visited:
                queue.append({'id': nid, 'name': _module_label(index, rm), 'description': '',
                              'focus_modules': [rm], 'focus_tags': []})
                depth[nid] = d + 1
    data, warnings = merge_graph(collected, brain_dir)
    return data, warnings, len(seeds)


def generate(brain_dir, use_ai=True, sources=None, focus_modules=None):
    """从 project-wiki（或可选 focus_modules 聚焦模块）重新生成业务图谱。
    采用分治: 规划 → 逐场景 BFS 生成 → 合并优化；AI 不可用/失败回退确定性骨架。
    返回 { success, source, valid, nodes, edges, flows, path, warnings }。
    """
    # 兼容旧调用: sources 若含 api- 模块 id，则作为聚焦模块
    if sources and not focus_modules and isinstance(sources, list):
        fmods = [s.get("id") for s in sources if isinstance(s, dict) and str(s.get("id", "")).startswith("api-")]
        if fmods:
            focus_modules = fmods
    data, warnings, _seed = run_pipeline(brain_dir, use_ai, focus_modules)
    md = json_to_markdown(data)
    out = ingest(data, md, brain_dir)
    errs, _ = validate(data)
    return {
        "success": True,
        "source": "ai" if use_ai else "deterministic",
        "valid": not errs,
        "nodes": len(data.get("nodes", [])),
        "edges": len(data.get("edges", [])),
        "flows": len(data.get("flows", [])),
        "path": out,
        "warnings": warnings,
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
    p_gen.add_argument("--sources-file", help="素材 JSON 文件路径（list of {id,title,content}），优先于全量扫描")

    p_plan = sub.add_parser("plan", help="规划业务场景种子（AI 优先，确定性兜底）")
    p_plan.add_argument("--brain", required=True)
    p_plan.add_argument("--ai", dest="use_ai", action="store_true", default=True)
    p_plan.add_argument("--no-ai", dest="use_ai", action="store_false")
    p_plan.add_argument("--focus", help="聚焦模块 id 逗号分隔（如 api-server,api-batch-commit）")

    p_sc = sub.add_parser("scenario", help="生成单个业务场景子图")
    p_sc.add_argument("--brain", required=True)
    p_sc.add_argument("--scenario", help="场景 spec JSON（内联）")
    p_sc.add_argument("--scenario-file", help="场景 spec JSON 文件路径（避免命令行引号/长度问题）")
    p_sc.add_argument("--ai", dest="use_ai", action="store_true", default=True)
    p_sc.add_argument("--no-ai", dest="use_ai", action="store_false")

    p_opt = sub.add_parser("optimize", help="合并多场景子图并入库")
    p_opt.add_argument("--brain", required=True)
    p_opt.add_argument("--scenarios", help="场景子图数组 JSON")
    p_opt.add_argument("--scenarios-file", help="场景子图数组 JSON 文件路径（大数据用，避免命令行长度限制）")
    p_opt.add_argument("--write", action="store_true", help="写入 business-flows.json 并审计")

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
        sources = None
        sf = getattr(args, "sources_file", None)
        if sf:
            try:
                with open(sf, "r", encoding="utf-8") as f:
                    sources = json.load(f)
            except Exception:
                sources = None
            try:
                os.remove(sf)
            except Exception:
                pass
        res = generate(args.brain, args.use_ai, sources)
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return 0

    if args.cmd == "plan":
        index = _index_wiki(args.brain)
        focus = args.focus.split(",") if args.focus else None
        scs = plan_scenarios(index, focus, args.use_ai)
        print(json.dumps({"success": True, "mode": "ai" if args.use_ai else "deterministic",
                          "scenarios": scs}, ensure_ascii=False, indent=2))
        return 0

    if args.cmd == "scenario":
        if getattr(args, "scenario_file", None):
            with open(args.scenario_file, "r", encoding="utf-8-sig") as f:
                sc = json.load(f)
        else:
            sc = json.loads(args.scenario)
        index = _index_wiki(args.brain)
        sub = generate_scenario(index, sc, args.use_ai)
        print(json.dumps({"success": True, "nodes": sub["nodes"], "edges": sub["edges"],
                          "flow": sub["flow"], "related_modules": sub["related_modules"]},
                         ensure_ascii=False, indent=2))
        return 0

    if args.cmd == "optimize":
        if getattr(args, "scenarios_file", None):
            with open(args.scenarios_file, "r", encoding="utf-8-sig") as f:
                scs = json.load(f)
        else:
            scs = json.loads(args.scenarios or "[]")
        norm = [{"scenario": s.get("scenario") or {}, "nodes": s.get("nodes") or [],
                 "edges": s.get("edges") or [], "flow": s.get("flow") or {}} for s in scs]
        data, warnings = merge_graph(norm, args.brain)
        out = None
        if args.write:
            md = json_to_markdown(data)
            out = ingest(data, md, args.brain)
        print(json.dumps({"success": True, "data": data, "warnings": warnings, "path": out},
                         ensure_ascii=False, indent=2))
        return 0


if __name__ == "__main__":
    sys.exit(main())
