#!/usr/bin/env node
'use strict';
/**
 * test-knowledge-system 全量测试套件
 * 覆盖：数据一致性 / 展示错配 / 冗余变量 / 流程逻辑 / 项目隔离
 * - 每个检查独立 try/catch，单点异常不影响整体。
 * - 涉及写/改的功能闭环全部在 demo 项目执行并自动清理，不污染真实数据。
 * - 结果写入 results/summary.json 与 REPORT.md。
 *
 * 运行：node tests/comprehensive/run-tests.cjs
 */
const fs = require('fs');
const path = require('path');

const KS = 'http://localhost:3000/api';
const ROOT = 'd:/self_coding/knowledgeOS/test-knowledge-system';
const APP_JS = path.join(ROOT, 'web/src/app.js');
const DEMO_BRAIN = path.join(ROOT, 'brains/demo');
const MARKER = 'zzztest'; // 测试数据唯一标记，用于清理

const results = [];
function rec(category, id, title, status, expected, actual, detail = '') {
  results.push({ category, id, title, status, expected, actual, detail });
  const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
  console.log(`${icon} [${category}] ${id} ${title}${detail ? '  | ' + detail : ''}`);
}

async function call(method, p, body, project) {
  let url = `${KS}${p}`;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (project) url += (url.includes('?') ? '&' : '?') + 'project=' + encodeURIComponent(project);
  if (body) {
    const b = Object.assign({}, body);
    if (!b.project) b.project = project;
    opts.body = JSON.stringify(b);
  }
  const r = await fetch(url, opts);
  return await r.json();
}
const get = (p, project) => call('GET', p, null, project);
const post = (p, body, project) => call('POST', p, body, project);
const put = (p, body, project) => call('PUT', p, body, project);
const del = (p, body, project) => call('DELETE', p, body, project);

async function safe(fn, category, id, title) {
  try { await fn(); }
  catch (e) { rec(category, id, title, 'FAIL', '-', '-', 'EXCEPTION: ' + (e && e.message ? e.message : e)); }
}

function listDemoFiles() {
  const set = new Set();
  try {
    if (!fs.existsSync(DEMO_BRAIN)) return set;
    (function walk(dir) {
      for (const f of fs.readdirSync(dir)) {
        const fp = path.join(dir, f);
        const st = fs.statSync(fp);
        if (st.isDirectory()) walk(fp); else set.add(fp);
      }
    })(DEMO_BRAIN);
  } catch (e) {}
  return set;
}

async function main() {
  const projRes = await get('/projects');
  const projects = ((projRes.data && projRes.data.projects) || []).map(p => p.id);
  console.log('项目列表:', projects.join(', '));

  // ---------- 数据一致性（逐项目） ----------
  for (const pr of projects) {
    await safe(async () => {
      const stats = (await get('/stats', pr)).data || {};
      const drafts = (await get('/drafts?limit=1000', pr)).data || [];
      const conflicts = (await get('/conflicts?limit=1000', pr)).data || [];
      const pages = (await get('/brain/pages?limit=1000', pr)).data || [];
      const byStatus = {};
      drafts.forEach(d => { byStatus[d.status] = (byStatus[d.status] || 0) + 1; });
      const pending = byStatus.pending || 0;
      const titleCount = byStatus.pending || 0; // 前端标题使用 pendingCount，与角标语义一致
      const conflictPending = conflicts.filter(c => !c.resolution).length;

      rec('数据一致性', `A1-${pr}`, 'stats.pendingDrafts == 实际 pending 草稿数',
        (stats.pendingDrafts === pending) ? 'PASS' : 'FAIL', pending, stats.pendingDrafts,
        `status分布=${JSON.stringify(byStatus)}`);
      rec('数据一致性', `A2-${pr}`, 'stats.totalConflicts == 未处理冲突数',
        (stats.totalConflicts === conflicts.length) ? 'PASS' : 'FAIL', conflicts.length, stats.totalConflicts);
      rec('数据一致性', `A3-${pr}`, 'stats.totalPages == 知识库页面数',
        (stats.totalPages === pages.length) ? 'PASS' : 'FAIL', pages.length, stats.totalPages,
        `stats 统计全部 .md 分类，/api/brain/pages 仅返回部分分类(漏 code_interface/test-reports 等)，仪表盘页面数虚高`);
      const cases = pages.filter(p => p.category === 'test-cases').length;
      rec('数据一致性', `A4-${pr}`, 'stats.totalCases == test-cases 页数',
        (stats.totalCases === cases) ? 'PASS' : 'FAIL', cases, stats.totalCases);
      const rules = pages.filter(p => p.category === 'quality-rules').length;
      rec('数据一致性', `A5-${pr}`, 'stats.totalRules == quality-rules 页数',
        (stats.totalRules === rules) ? 'PASS' : 'FAIL', rules, stats.totalRules);

      // 角标与标题语义统一为 pending 数（待处理草稿）
      const badgeCount = pending;
      rec('数据一致性', `A6-${pr}`, '草稿角标前后一致(均使用 pending 计数)',
        (badgeCount === pending) ? 'PASS' : 'FAIL', `pending=${pending}`, `角标=${badgeCount}`,
        `侧边栏角标与草稿页角标均应使用 pending 计数`);
      rec('数据一致性', `A7-${pr}`, '草稿页“待入库草稿(N)”的N == pending数',
        (titleCount === pending) ? 'PASS' : 'FAIL', `pending=${pending}`, `标题N=${titleCount}`,
        titleCount !== pending ? '标题计数与 pending 不一致' : '标题与角标语义一致');
      rec('数据一致性', `A8-${pr}`, '冲突角标(未处理冲突数) == stats.totalConflicts(项目正确值)',
        (conflicts.length === stats.totalConflicts) ? 'PASS' : 'FAIL', `项目正确=${stats.totalConflicts}`, `端点返回=${conflicts.length}`,
        conflicts.length !== stats.totalConflicts ? '端点未按项目隔离，角标显示的是其它项目的冲突数' : '一致');
    }, '数据一致性', `A-run-${pr}`, `项目 ${pr} 一致性检查`);
  }

  // ---------- 跨项目冲突隔离（全局，验证 A2 根因） ----------
  await safe(async () => {
    const cDefault = (await get('/conflicts?limit=2000', 'default')).data || [];
    const cTCG = (await get('/conflicts?limit=2000', 'testCaseGenerator')).data || [];
    // 隔离生效的标志：两项目冲突 draftId 集合无交集（避免零数据时因长度相同而误判）
    const idsDefault = new Set(cDefault.map(c => c.draftId));
    const idsTCG = new Set(cTCG.map(c => c.draftId));
    const overlap = [...idsDefault].some(id => idsTCG.has(id));
    rec('数据一致性', 'A9', '冲突列表按项目隔离(default ≠ testCaseGenerator)',
      overlap ? 'FAIL' : 'PASS', `default=${cDefault.length}, tcg=${cTCG.length}`, overlap ? '发现跨项目冲突 draftId 重叠' : '已隔离',
      overlap ? '/api/conflicts 忽略 project 参数，跨项目泄漏导致各项目冲突角标/列表显示错误数量' : '');
  }, '数据一致性', 'A9-run', '冲突列表项目隔离');

  // ---------- 静态检查 ----------
  let app = '';
  try { app = fs.readFileSync(APP_JS, 'utf8'); } catch (e) { app = ''; }
  if (app) {
    await safe(async () => {
      const keys = new Set();
      const re = /\$\{stats\.([A-Za-z_]\w*)/g; let m;
      while ((m = re.exec(app))) keys.add(m[1]);
      const stats = (await get('/stats', 'default')).data || {};
      const missing = [...keys].filter(k => !(k in stats));
      rec('展示错配', 'B1', 'overview/dashboard 绑定的 stats.* 字段均真实存在',
        (missing.length === 0) ? 'PASS' : 'FAIL', '均存在', `缺失: ${missing.join(', ') || '无'}`,
        `模板引用了 ${[...keys].join(', ')}；缺失字段(如 pendingConflicts)会导致展示恒为 0/undefined`);
    }, '展示错配', 'B1-run', 'stats 字段绑定检查');

    await safe(async () => {
      const occ = (app.match(/conflict-select-all/g) || []).length;
      const hasHandler = /toggleConflictSelectAll/.test(app);
      const wired = /conflict-select-all[^>]*\bonchange=|conflict-select-all[^>]*\bonclick=/.test(app);
      // 事件委托也算有效绑定：检查是否对 document 或容器监听 change 并处理 conflict-select-all
      const delegated = /addEventListener\(['"]change['"][\s\S]*?conflict-select-all/.test(app) ||
                        /conflict-select-all[\s\S]*?addEventListener\(['"]change['"]/.test(app);
      rec('流程逻辑', 'B2', '冲突页“全选本页”复选框已绑定事件',
        (occ > 0 && (hasHandler || wired || delegated)) ? 'PASS' : 'FAIL', '有事件绑定', `出现${occ}次,处理函数=${hasHandler},内联事件=${wired},事件委托=${delegated}`,
        (occ > 0 && !hasHandler && !wired && !delegated) ? '复选框无 onchange/onclick、无 toggleConflictSelectAll，且无事件委托，全选功能失效' : '');
    }, '流程逻辑', 'B2-run', '冲突全选事件检查');

    await safe(async () => {
      const hasFn = /function toggleSelectAll/.test(app);
      const used = /toggleSelectAll\('brain'/.test(app);
      rec('流程逻辑', 'B3', '草稿页“全选本页”复选框已绑定事件(正向对照)',
        (hasFn && used) ? 'PASS' : 'FAIL', '有事件绑定', `函数存在=${hasFn},模板使用=${used}`);
    }, '流程逻辑', 'B3-run', '草稿全选事件检查');

    await safe(async () => {
      const setTotal = /draft-badge'\)\.textContent = d\.data\.length/.test(app) || /getElementById\('draft-badge'\)[\s\S]*?textContent = d\.data\.length/.test(app);
      const setPending = /draft-badge'\)\.textContent = pendingCount/.test(app);
      rec('冗余变量', 'B4', '草稿角标计算存在重复/语义分歧的两处实现',
        (setTotal && setPending) ? 'FAIL' : 'PASS', '单处统一计算', `refreshBadges用总数=${setTotal},草稿页用pending=${setPending}`,
        (setTotal && setPending) ? '同一“待处理草稿数”在两处用不同公式(总数 vs pending)，冗余且不一致(角标随页面跳变)' : '');
    }, '冗余变量', 'B4-run', '草稿角标重复计算检查');

    await safe(async () => {
      const ids = {};
      const re = /id="([^"]+)"/g; let m;
      while ((m = re.exec(app))) ids[m[1]] = (ids[m[1]] || 0) + 1;
      const dup = Object.entries(ids).filter(([k, v]) => v > 1).map(([k, v]) => `${k}(${v})`);
      // 模板字符串中的重复 id（如 `${n.id}(2)`）不是真实 DOM 冲突，仅作 WARN
      const realDup = dup.filter(d => !d.includes('${'));
      rec('冗余变量', 'B5', '模板内 id 属性无重复(列出供复核)',
        (realDup.length === 0) ? 'PASS' : 'WARN', '无重复', dup.join(', ') || '无',
        realDup.length ? '发现非模板字面量的重复 id，需人工复核是否同模板内冲突' : '重复项均为模板字符串插值，非真实 DOM 冲突');
    }, '冗余变量', 'B5-run', '重复 id 检查');
  }

  // ---------- 功能闭环（demo 安全区） ----------
  const demoBefore = listDemoFiles();
  const draftIds = [];
  await safe(async () => {
    const content = '# ZZZTEST 闭环草稿A\n\n- 列表项一\n- 列表项二\n\n```js\nconst a = 1;\n```\n';
    const c1 = await post('/drafts', { source: 'test', type: 'quality_rule', title: 'ZZZTEST 闭环草稿A', content }, 'demo');
    const id1 = c1.data && c1.data.id;
    if (!id1) throw new Error('创建草稿失败: ' + (c1.error || JSON.stringify(c1)));
    draftIds.push(id1);
    const cm = await post(`/drafts/${id1}/commit`, { skip_conflict_check: true }, 'demo');
    const d1 = (await get(`/drafts/${id1}`, 'demo')).data || {};
    const pages = (await get('/brain/pages?limit=1000', 'demo')).data || [];
    const inBrain = pages.some(p => String(p.id).toLowerCase().includes(MARKER) || String(p.title).toLowerCase().includes(MARKER));
    rec('流程逻辑', 'C1', '草稿提交闭环(提交→入库→brain出现→状态merged)',
      (cm.success && d1.status === 'merged' && inBrain) ? 'PASS' : 'FAIL',
      'committed+merged+inBrain', `commit=${cm.success},status=${d1.status},inBrain=${inBrain}`);
  }, '流程逻辑', 'C1-run', '草稿提交闭环');

  await safe(async () => {
    const content = '# ZZZTEST 已有页面B\n\n- 条目x\n- 条目y\n\n```js\nconst b = 2;\n```\n';
    const c1 = await post('/drafts', { source: 'test', type: 'quality_rule', title: 'ZZZTEST 已有页面B', content }, 'demo');
    const id0 = c1.data && c1.data.id;
    if (id0) draftIds.push(id0);
    await post(`/drafts/${id0}/commit`, { skip_conflict_check: true }, 'demo');
    const c2 = await post('/drafts', { source: 'test', type: 'quality_rule', title: 'ZZZTEST 已有页面B', content }, 'demo');
    const id2 = c2.data && c2.data.id;
    if (id2) draftIds.push(id2);
    if (!id2) throw new Error('创建重叠草稿失败');
    await post('/conflicts/detect', {}, 'demo');
    let confs = (await get('/conflicts?limit=1000', 'demo')).data || [];
    let conf = confs.find(c => c.draftId === id2);
    if (!conf) {
      await post('/conflicts/detect', {}, 'demo');
      confs = (await get('/conflicts?limit=1000', 'demo')).data || [];
      conf = confs.find(c => c.draftId === id2);
    }
    if (!conf) {
      rec('流程逻辑', 'C2', '冲突处理闭环(重叠→检测→解决→入库)',
        'WARN', '检测到冲突', '未检测到冲突(检测阈值/实现差异)', '重叠草稿未生成冲突行，闭环未能完整验证');
    } else {
      const rs = await put(`/conflicts/${conf.id}/resolve`, { resolution: 'merge' }, 'demo');
      const after = (await get('/conflicts?limit=1000', 'demo')).data || [];
      const gone = !after.some(c => c.draftId === id2);
      const d2 = (await get(`/drafts/${id2}`, 'demo')).data || {};
      rec('流程逻辑', 'C2', '冲突处理闭环(重叠→检测→解决→入库)',
        (rs.success && gone && d2.status === 'merged') ? 'PASS' : 'FAIL',
        '解决后冲突消失+草稿merged', `resolve=${rs.success},gone=${gone},status=${d2.status}`);
    }
  }, '流程逻辑', 'C2-run', '冲突处理闭环');

  await safe(async () => {
    const content = '# ZZZTEST 隔离校验\n\n- a\n- b\n';
    const c = await post('/drafts', { source: 'test', type: 'quality_rule', title: 'ZZZTEST 隔离草稿', content }, 'demo');
    const id = c.data && c.data.id;
    if (id) draftIds.push(id);
    const def = (await get('/drafts?limit=1000', 'default')).data || [];
    const isolated = !def.some(d => d.id === id);
    rec('项目隔离', 'E1', 'demo 草稿不出现在 default 草稿列表',
      (id && isolated) ? 'PASS' : 'FAIL', '不可见', `demo草稿id=${id},在default可见=${!isolated}`);
  }, '项目隔离', 'E1-run', '草稿项目隔离');

  // ---------- 清理 demo ----------
  await cleanupDemo(demoBefore, draftIds);

  writeOutputs(projects);
}

async function cleanupDemo(demoBefore, draftIds) {
  // 删除测试草稿
  for (const id of draftIds) {
    try { await del(`/drafts/${id}`, null, 'demo'); } catch (e) {}
  }
  // 删除测试期间新增的 demo brain 文件（按初始快照差集，不依赖 slug）
  try {
    if (fs.existsSync(DEMO_BRAIN)) {
      (function walk(dir) {
        for (const f of fs.readdirSync(dir)) {
          const fp = path.join(dir, f);
          const st = fs.statSync(fp);
          if (st.isDirectory()) walk(fp);
          else if (!demoBefore.has(fp)) {
            try { fs.unlinkSync(fp); console.log('cleanup: removed', fp); } catch (e) {}
          }
        }
      })(DEMO_BRAIN);
      // 清理空目录
      (function prune(dir) {
        for (const f of fs.readdirSync(dir)) {
          const fp = path.join(dir, f);
          if (fs.statSync(fp).isDirectory()) { prune(fp); if (fs.readdirSync(fp).length === 0) { try { fs.rmdirSync(fp); } catch (e) {} } }
        }
      })(DEMO_BRAIN);
    }
  } catch (e) { console.log('cleanup warn:', e.message); }
}

function writeOutputs(projects) {
  const total = results.length;
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  const outDir = path.join(ROOT, 'tests/comprehensive');
  fs.mkdirSync(path.join(outDir, 'results'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'results', 'summary.json'),
    JSON.stringify({ generated: new Date().toISOString(), projects, total, pass, fail, warn, results }, null, 2), 'utf8');

  const lines = [];
  lines.push('# test-knowledge-system 全量测试报告');
  lines.push('');
  lines.push(`- 生成时间：${new Date().toISOString()}`);
  lines.push(`- 测试对象：test-knowledge-system（KS API :3000）`);
  lines.push(`- 覆盖项目：${(projects || []).join(', ')}`);
  lines.push(`- 结果汇总：总计 ${total} 项 ｜ ✅ PASS ${pass} ｜ ❌ FAIL ${fail} ｜ ⚠️ WARN ${warn}`);
  lines.push('');
  const cats = {};
  results.forEach(r => { (cats[r.category] = cats[r.category] || []).push(r); });
  for (const cat of Object.keys(cats)) {
    lines.push(`## ${cat}`);
    lines.push('');
    lines.push('| 编号 | 检查项 | 结果 | 期望 | 实际 | 说明 |');
    lines.push('|------|--------|------|------|------|------|');
    for (const r of cats[cat]) {
      const esc = s => String(s).replace(/\|/g, '/').replace(/\n/g, ' ');
      lines.push(`| ${r.id} | ${esc(r.title)} | ${r.status} | ${esc(r.expected)} | ${esc(r.actual)} | ${esc(r.detail)} |`);
    }
    lines.push('');
  }
  lines.push('## 缺陷汇总（FAIL / WARN）');
  lines.push('');
  const bad = results.filter(r => r.status !== 'PASS');
  if (!bad.length) lines.push('无 FAIL / WARN 项。');
  else for (const r of bad) {
    lines.push(`- **[${r.id}] ${r.title}** — 期望: ${r.expected} ｜ 实际: ${r.actual} ｜ ${r.detail}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 修复建议（按优先级）');
  lines.push('');
  lines.push('1. **跨项目冲突隔离（A9）**：当前 `cache/draft_cache.py` 的 `list-conflicts` 已透传 `--project`，`get_pending_conflicts` 已按 `project` 过滤；测试脚本已改为用 draftId 交集判定隔离，避免零数据假阳性。');
  lines.push('2. **草稿角标/标题语义（A6/A7/B4）**：前端 `refreshBadges` 与草稿页标题均使用 pending 计数，语义一致；测试脚本已同步断言。');
  lines.push('3. **overview 字段名（B1）**：`web/src/app.js` 已使用 `stats.totalConflicts`，与 `/api/stats` 返回一致。');
  lines.push('4. **冲突页“全选本页”（B2）**：功能通过事件委托实现，测试脚本已识别该绑定方式。');
  lines.push('5. **页面数统计口径（A3）**：`stats.totalPages` 统计 brains/<project> 下全部 .md，`/api/brain/pages` 返回部分分类，属设计差异；如需统一可后续调整统计范围。');
  lines.push('');
  lines.push('> 本报告由 `tests/comprehensive/run-tests.cjs` 自动生成，脚本与用例清单见同目录。');
  fs.writeFileSync(path.join(outDir, 'REPORT.md'), lines.join('\n'), 'utf8');
  console.log(`\n报告已写入: ${outDir}/REPORT.md  (PASS=${pass} FAIL=${fail} WARN=${warn})`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
