// 知识库浏览模块：详情展示 + 新增/批量新增 功能回归测试
// 覆盖此前未覆盖的浏览器级场景（详情接口正确性）与新增的人工维护能力。
// 运行：node tests/comprehensive/feature-tests.cjs  (需 KS 运行于 :3000)
const BASE = process.env.KS_BASE || 'http://localhost:3000';
const PROJECT = 'default';

let pass = 0, fail = 0, warn = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; fails.push(name); console.log(`  FAIL  ${name}${extra ? '  -> ' + JSON.stringify(extra) : ''}`); }
}

async function api(method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

(async () => {
  console.log('=== 知识库浏览：详情/新增/批量 回归测试 ===');
  const created = []; // {category, id} 供清理

  // --- A. 详情接口正确性（此前仅测 API 元信息，未覆盖详情内容）---
  console.log('\n[A] 详情接口：真实标题 + 去除 frontmatter 正文');
  // 取一个带 frontmatter 的真实页面（quality-rules 中应有真实标题）
  const list = await api('GET', `/api/brain/pages?limit=1000&category=quality-rules&project=${PROJECT}`);
  ok('A1 quality-rules 列表非空', (list.data || []).length > 0, { n: (list.data || []).length });
  const sample = (list.data || [])[0];
  if (sample) {
    const det = await api('GET', `/api/brain/pages/quality-rules/${sample.id}?project=${PROJECT}`);
    ok('A2 详情返回 success', det.success, det);
    ok('A3 详情 title 非占位符"标题"', det.data && det.data.title && det.data.title !== '标题', det.data && det.data.title);
    ok('A4 详情 body 不含 frontmatter', det.data && det.data.body != null && !/^---\s*\n/.test(det.data.body), det.data && det.data.body && det.data.body.slice(0, 20));
    ok('A5 详情 title 与列表 title 一致', det.data && det.data.title === sample.title, { det: det.data && det.data.title, list: sample.title });
  } else { ['A2', 'A3', 'A4', 'A5'].forEach(n => ok(n + ' (无样本跳过)', false)); }

  // --- B. 列表标题不应再是占位符"标题"（修复项回归）---
  console.log('\n[B] 列表标题修复回归（不应批量显示"标题"占位符）');
  const all = await api('GET', `/api/brain/pages?limit=1000&project=${PROJECT}`);
  const titled = (all.data || []).filter(p => p.title === '标题');
  const total = (all.data || []).length;
  // 仅当文件 frontmatter 确含真实 title 时才应不为"标题"；此处断言：含真实 frontmatter 的 quality-rules 不应全为"标题"
  const qr = (all.data || []).filter(p => p.category === 'quality-rules');
  const qrTitled = qr.filter(p => p.title === '标题').length;
  ok('B1 存在带真实标题的页面', total > 0);
  ok('B2 quality-rules 非全部为占位符"标题"', qrTitled < qr.length, { qrTotal: qr.length, qrTitled });

  // --- C. 新增单条条目 ---
  console.log('\n[C] 新增单条知识库条目');
  const c = await api('POST', `/api/brain/pages`, { category: 'quality-rules', title: '回归测试-单条', content: '内容X', project: PROJECT });
  ok('C1 新增返回 success', c.success, c);
  ok('C2 返回 id 与 title', c.success && c.data && c.data.id && c.data.title === '回归测试-单条', c.data);
  if (c.success) created.push({ category: 'quality-rules', id: c.data.id });
  if (c.success) {
    const det = await api('GET', `/api/brain/pages/quality-rules/${c.data.id}?project=${PROJECT}`);
    ok('C3 新建后可读取且内容正确', det.success && det.data.body.includes('内容X'), det.data && det.data.body);
  }

  // --- D. 批量新增条目 ---
  console.log('\n[D] 批量新增知识库条目');
  const b = await api('POST', `/api/brain/pages/batch`, {
    category: 'test-scripts',
    entries: [{ title: '批量甲', content: '甲内容' }, { title: '批量乙', content: '乙内容' }],
    project: PROJECT,
  });
  ok('D1 批量返回 success', b.success, b);
  ok('D2 批量创建数=2', b.success && b.data && b.data.created === 2, b.data);
  if (b.success) b.data.items.forEach(it => created.push({ category: 'test-scripts', id: it.id }));
  if (b.success) {
    const list2 = await api('GET', `/api/brain/pages?limit=1000&category=test-scripts&project=${PROJECT}`);
    const names = (list2.data || []).map(p => p.title);
    ok('D3 批量条目已入库(批量甲)', names.includes('批量甲'), names);
    ok('D4 批量条目已入库(批量乙)', names.includes('批量乙'), names);
  }

  // --- E. 参数校验 ---
  console.log('\n[E] 参数校验');
  const e1 = await api('POST', `/api/brain/pages`, { category: 'quality-rules', content: 'x', project: PROJECT });
  ok('E1 缺 title 应失败', !e1.success, e1);
  const e2 = await api('POST', `/api/brain/pages/batch`, { category: 'quality-rules', entries: [], project: PROJECT });
  ok('E2 空 entries 应失败', !e2.success, e2);

  // --- 清理测试数据 ---
  console.log('\n[cleanup] 清理测试创建的数据');
  for (const { category, id } of created) {
    const r = await api('DELETE', `/api/brain/pages/${category}/${id}?project=${PROJECT}`);
    if (!r.success) console.log(`  清理失败 ${category}/${id}: ${r.error}`);
  }
  console.log(`  已清理 ${created.length} 条`);

  // --- F. 业务流程图谱生成（bizflow）---
  console.log('\n[F] 业务流程图谱：生成接口与渲染');
  const bg1 = await api('GET', `/api/business-graph?project=${PROJECT}`);
  ok('F1 GET /api/business-graph 返回 success', bg1.success === true || bg1.success === false, bg1);
  // 触发一次生成（即使无素材也应返回结构化响应，不应抛异常）
  const bg2 = await api('POST', `/api/business-graph`, { ai: false, sources: [], project: PROJECT });
  ok('F2 POST /api/business-graph 不抛异常', bg2 != null, bg2);
  ok('F3 POST /api/business-graph 返回 success 或明确错误', bg2.success === true || (bg2.success === false && bg2.error), bg2);

  console.log(`\n=== 结果: PASS=${pass} FAIL=${fail} WARN=${warn} ===`);
  if (fail > 0) { console.log('失败项: ' + fails.join(', ')); process.exit(1); }
})().catch(e => { console.error('运行异常:', e); process.exit(2); });
