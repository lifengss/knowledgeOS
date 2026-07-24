#!/usr/bin/env node
'use strict';
/**
 * 批量将测试产物经「业务前端回流页面」机制上传入库。
 * 产物：基线报告 REPORT.md、回归报告 REGRESSION-REPORT.md、用例清单 test-cases.md、
 *       基线脚本 run-tests.cjs、回归脚本 regression-tests.cjs。
 * 每个产物创建一条 exec_backflow 草稿 → commit 入库，按内容归入对应标准分类
 * 项目：default（KS 自身知识库）。
 */
const fs = require('fs');
const path = require('path');

const BFF = 'http://localhost:4123';
const KS = 'http://localhost:3000';
const DIR = __dirname;
const PROJECT = 'default';

async function postApi(base, p, body, project) {
  const url = `${base}${p}` + (project ? `?project=${encodeURIComponent(project)}` : '');
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, body, { project }))
    });
    const text = await r.text();
    try { return JSON.parse(text); } catch (e) { return { success: false, error: text.slice(0, 200) }; }
  } catch (e) { return { success: false, error: e.message }; }
}
async function getApi(base, p, project) {
  const url = `${base}${p}` + (project ? `?project=${encodeURIComponent(project)}` : '');
  try {
    const r = await fetch(url);
    const text = await r.text();
    try { return JSON.parse(text); } catch (e) { return { success: false, data: [] }; }
  } catch (e) { return { success: false, data: [] }; }
}

const artifacts = [
  { file: 'REPORT.md', title: 'test-knowledge-system 全量测试报告(发现阶段基线)', type: 'defect_experience' },
  { file: 'REGRESSION-REPORT.md', title: 'test-knowledge-system 回归测试报告(修复后)', type: 'defect_experience' },
  { file: 'test-cases.md', title: 'test-knowledge-system 测试用例清单(全量+回归)', type: 'test_case' },
  { file: 'run-tests.cjs', title: 'test-knowledge-system 全量测试脚本 run-tests.cjs', type: 'test_script' },
  { file: 'regression-tests.cjs', title: 'test-knowledge-system 回归测试脚本 regression-tests.cjs', type: 'test_script' }
];

(async () => {
  let ok = 0;
  for (const a of artifacts) {
    const fp = path.join(DIR, a.file);
    if (!fs.existsSync(fp)) { console.log(`⚠️ 跳过(不存在): ${a.file}`); continue; }
    const content = fs.readFileSync(fp, 'utf8');
    console.log(`\n--- 上传: ${a.file} (${Buffer.byteLength(content, 'utf8')} 字节) ---`);
    let draftId = null, usedBase = BFF, label = 'BFF';
    const res = await postApi(BFF, '/api/drafts', {
      source: 'exec_backflow', type: a.type, title: a.title, content
    }, PROJECT);
    if (res.success && res.data && res.data.id) draftId = res.data.id;
    else {
      const res2 = await postApi(KS, '/api/drafts', {
        source: 'exec_backflow', type: a.type, title: a.title, content
      }, PROJECT);
      if (res2.success && res2.data && res2.data.id) { draftId = res2.data.id; usedBase = KS; label = 'KS'; }
      else { console.log(`❌ 创建草稿失败: ${a.file}`, res2.error || JSON.stringify(res2).slice(0, 160)); continue; }
    }
    console.log(`✅ 草稿已创建(经 ${label}) id=${draftId}`);
    const cm = await postApi(usedBase, `/api/drafts/${draftId}/commit`, { skip_conflict_check: true }, PROJECT);
    if (!cm.success) { console.log(`⚠️ 提交未成功: ${a.file}`, cm.error || JSON.stringify(cm).slice(0, 160)); continue; }
    console.log(`✅ 已提交入库 id=${draftId}`);
    ok++;
  }
  console.log(`\n入库完成：${ok}/${artifacts.length} 个产物成功进入知识库（项目=${PROJECT}）`);
})().catch(e => { console.error('FATAL', e && e.message); });
