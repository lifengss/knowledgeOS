/**
 * 一致性 / 数据正确性测试
 * 聚焦此前全量测试漏掉的“明显错误”：
 *  1) 审计大盘最近7天趋势为空（created_at 字段名错误 + 审计接口未返回结构化 total + pageSize 参数无效）
 *  2) 质量监控类型覆盖标签中英混杂/重复（test_script / automation_script 被拆成两条）
 *  3) 知识库浏览与质量监控的“自动化测试脚本”计数不一致（跨项目缓存串数据）
 *  4) 草稿/审计记录的时间字段在列表页错用（drafts.createdAt vs audit.created_at）
 *
 * 运行：node tests/consistency-tests.cjs  （需 KS 服务在 :3000 运行）
 */
'use strict';

const BASE = process.env.KS_BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
const fails = [];

function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; fails.push(name); console.log(`  FAIL  ${name}${extra ? '  -> ' + extra : ''}`); }
}

async function get(path) {
  const r = await fetch(BASE + path);
  const j = await r.json();
  return { status: r.status, data: j };
}

async function main() {
  console.log(`\n=== 一致性 / 数据正确性测试 (BASE=${BASE}) ===\n`);

  // ---------- A. 审计大盘：结构化返回 + 时间字段 + 7天趋势 ----------
  console.log('[A] 审计大盘 /api/audit-log');
  const auditSmall = await get('/api/audit-log?pageSize=5');
  const auditBig = await get('/api/audit-log?pageSize=200');
  check('A1 接口返回成功', auditSmall.data && auditSmall.data.success === true);
  check('A2 返回结构化 data.items（数组）',
    Array.isArray(auditSmall.data.data.items),
    JSON.stringify(auditSmall.data.data).slice(0, 80));
  check('A3 total 为真实总数（与 items.length 无关）',
    typeof auditSmall.data.data.total === 'number' &&
    auditSmall.data.data.total > auditSmall.data.data.items.length,
    `total=${auditSmall.data.data.total} itemsLen=${auditSmall.data.data.items.length}`);
  check('A4 total 与 pageSize 无关（5 vs 200 应相等）',
    auditSmall.data.data.total === auditBig.data.data.total,
    `small=${auditSmall.data.data.total} big=${auditBig.data.data.total}`);

  const items = auditBig.data.data.items;
  const allHaveCreatedAt = items.length > 0 && items.every(it => typeof it.created_at === 'string' && it.created_at.length > 0);
  check('A5 每条审计记录含 created_at 字段（趋势聚合依赖此字段）', allHaveCreatedAt,
    `items=${items.length}`);

  // 最近7天 commit 计数
  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const daySet = new Set(days);
  let last7Commits = 0, last7Any = 0;
  items.forEach(it => {
    const day = (it.created_at || '').slice(0, 10);
    if (daySet.has(day)) {
      last7Any++;
      if (it.action === 'commit') last7Commits++;
    }
  });
  check('A6 最近7天存在操作（趋势不应为空）', last7Any > 0, `last7Any=${last7Any}`);
  check('A7 最近7天存在入库(commit)操作', last7Commits > 0, `last7Commits=${last7Commits}`);

  // ---------- B. 质量监控类型覆盖：中文标签、无混杂、与知识库浏览一致 ----------
  console.log('\n[B] 质量监控类型覆盖 /api/brain/pages');
  const catLabels = {
    'quality-rules': '质量规则', 'defect-experience': '缺陷经验', 'defect_rule': '缺陷规则',
    'project-wiki': '项目 Wiki', 'test-cases': '测试用例', 'test-scripts': '自动化脚本'
  };
  const projRes = await get('/api/projects');
  const projects = (projRes.data.data && projRes.data.data.projects) || [];
  check('B0 能枚举项目', projects.length >= 1, `projects=${projects.length}`);

  for (const p of projects) {
    const bp = await get(`/api/brain/pages?limit=1000&project=${encodeURIComponent(p.id)}`);
    const pages = bp.data.data || [];
    const group = {};
    pages.forEach(x => { const c = x.category || 'other'; group[c] = (group[c] || 0) + 1; });
    // 每个分类都应在 catLabels 中（否则会显示原始英文 -> 中英混杂回归）
    const unknown = Object.keys(group).filter(c => !(c in catLabels));
    check(`B1[${p.id}] 所有分类均有中文标签（无英文混杂）`,
      unknown.length === 0, `unknown=${unknown.join(',')}`);
    // 标签集合无重复（均为唯一中文名）
    const labels = Object.keys(catLabels).map(c => catLabels[c]);
    const dup = labels.filter((v, i) => labels.indexOf(v) !== i);
    check(`B2[${p.id}] 中文标签无重复`, dup.length === 0, `dup=${dup.join(',')}`);
    console.log(`      [${p.id}] 分类统计: ` + Object.entries(group).map(([c, n]) => `${catLabels[c] || c}=${n}`).join('  '));
  }

  // 跨项目一致性：default 与 testCaseGenerator 的 test-scripts 数应不同（证明数据隔离）
  const def = await get('/api/brain/pages?limit=1000&project=default');
  const tcg = await get('/api/brain/pages?limit=1000&project=testCaseGenerator');
  const defTS = (def.data.data || []).filter(x => x.category === 'test-scripts').length;
  const tcgTS = (tcg.data.data || []).filter(x => x.category === 'test-scripts').length;
  check('B3 default 与 testCaseGenerator 的 test-scripts 计数不同（隔离，不串数据）',
    defTS !== tcgTS, `default=${defTS} testCaseGenerator=${tcgTS}`);

  // ---------- C. 草稿时间字段正确性 ----------
  console.log('\n[C] 草稿时间字段 /api/drafts');
  const dr = await get('/api/drafts?limit=50&project=default');
  const drafts = dr.data.data || [];
  check('C1 草稿列表可获取', Array.isArray(drafts));
  const draftsHaveCreatedAt = drafts.length === 0 || drafts.every(d => typeof d.createdAt === 'string' && d.createdAt.length > 0);
  check('C2 草稿使用 createdAt 字段（非 created_at）', draftsHaveCreatedAt,
    drafts.length ? `sample=${(drafts[0].createdAt || drafts[0].created_at || 'undefined')}` : 'no drafts');

  // ---------- 汇总 ----------
  console.log(`\n=== 结果：PASS=${pass}  FAIL=${fail} ===`);
  if (fail > 0) {
    console.log('失败项：\n - ' + fails.join('\n - '));
    process.exit(1);
  } else {
    console.log('全部通过 ✅');
    process.exit(0);
  }
}

main().catch(e => { console.error('测试运行异常:', e); process.exit(2); });
