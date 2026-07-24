#!/usr/bin/env node
/**
 * validate_graph.cjs — 校验 business-flows.json 的一致性
 *
 * 校验项:
 *  1) JSON 语法合法(解析失败即抛错)
 *  2) 所有边的 from / to 均指向 nodes 中存在的 id(无悬空边)
 *  3) 所有场景 flows[].steps 均指向 nodes 中存在的 id
 *  4) (可选 --doc <api.md>) 逐条核对节点 method+path 是否真在 API 文档中
 *
 * 节点端点字段约定(与交付产物一致):
 *  顶层 `method`(如 "GET"/"(context)") + 顶层 `path`(如 "/api/drafts")
 *  + 可选 `api`(字符串展示用,如 "GET /api/drafts")
 *
 * 用法:
 *  node validate_graph.cjs <business-flows.json> [--doc <API-INTERFACE-DOC.md>]
 * 退出码:0 = 全部通过;非 0 = 存在错误(并打印具体缺失)。
 */
'use strict';
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--doc') opts.doc = argv[++i];
    else positional.push(a);
  }
  return { file: positional[0], opts };
}

/** 从 API 文档抽取 "METHOD /path" 集合(best-effort) */
function extractDocEndpoints(docText) {
  const set = new Set();
  const re = /(?:GET|POST|PUT|DELETE|PATCH)\s+(\/[^\s*]+)/gi;
  let m;
  while ((m = re.exec(docText)) !== null) {
    const method = m[0].split(/\s+/)[0].toUpperCase();
    const p = m[1].split('?')[0].replace(/:[\w]+/g, ':param');
    set.add(`${method} ${p}`);
  }
  return set;
}

/** 把节点的 method+path 归一化为可比对 key(路径参数 :id -> :param,去查询串) */
function normalizeNodeApi(n) {
  if (!n || !n.method || !n.path) return null;
  const method = String(n.method).toUpperCase();
  const p = String(n.path).split('?')[0].replace(/:[\w]+/g, ':param');
  return `${method} ${p}`;
}

function main() {
  const { file, opts } = parseArgs(process.argv);
  if (!file) {
    console.error('用法: node validate_graph.cjs <business-flows.json> [--doc <API-INTERFACE-DOC.md>]');
    process.exit(2);
  }
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) { console.error('文件不存在:', abs); process.exit(2); }

  let data;
  try { data = JSON.parse(fs.readFileSync(abs, 'utf8')); }
  catch (e) { console.error('JSON 解析失败:', e.message); process.exit(1); }

  const ids = new Set((data.nodes || []).map(n => n.id));
  let err = 0;

  (data.edges || []).forEach(e => {
    if (!ids.has(e.from)) { console.log('EDGE from missing:', e.from, '->', e.to); err++; }
    if (!ids.has(e.to)) { console.log('EDGE to missing  :', e.from, '->', e.to); err++; }
  });

  (data.flows || []).forEach(f => (f.steps || []).forEach(s => {
    if (!ids.has(s)) { console.log('FLOW step missing:', f.id, s); err++; }
  }));

  if (opts.doc) {
    const docAbs = path.resolve(opts.doc);
    if (!fs.existsSync(docAbs)) { console.error('API 文档不存在:', docAbs); }
    else {
      const docEndpoints = extractDocEndpoints(fs.readFileSync(docAbs, 'utf8'));
      let missing = 0;
      (data.nodes || []).forEach(n => {
        const key = normalizeNodeApi(n);
        if (!key) { console.log('NODE 端点字段缺失/畸形:', n.id); err++; return; }
        if (!docEndpoints.has(key)) {
          console.log('WARN 文档未收录端点 :', n.id, key, (n.notes ? '(' + n.notes + ')' : ''));
          missing++;
        }
      });
      if (missing > 0) console.log(`(提示: ${missing} 个节点端点未在上游文档中找到,可能是架构文档独有/待对齐项/上下文节点)`);
    }
  }

  console.log(`nodes=${data.nodes?.length || 0} edges=${data.edges?.length || 0} flows=${data.flows?.length || 0}`);
  if (err === 0) { console.log('OK: all edge/flow refs valid'); process.exit(0); }
  console.log(`FAILED: ${err} errors`);
  process.exit(1);
}

main();
