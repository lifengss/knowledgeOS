#!/usr/bin/env node
'use strict';
/**
 * 将测试报告经「业务前端(testcase-gen-frontend)回流页面」机制上传入库。
 * 等价于回流页面 reportFile 上传：POST {source:'exec_backflow', type:'defect_rule', ...} 到 BFF /api/drafts，
 * 再提交(commit)使其真正进入知识库(brain)。
 * 选项目：default（test-knowledge-system 自身知识库；报告记录的是 KS 系统质量，归属 KS 自有脑最合理）。
 *
 * 运行：node tests/comprehensive/upload-report.cjs
 */
const fs = require('fs');
const path = require('path');

const BFF = 'http://localhost:4123';   // 业务前端 BFF
const KS = 'http://localhost:3000';    // 知识系统（用于验证）
const REPORT = path.join(__dirname, 'REPORT.md');
const PROJECT = 'default';

function log(...a) { console.log(...a); }

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

(async () => {
  if (!fs.existsSync(REPORT)) { log('❌ 未找到 REPORT.md'); return; }
  const content = fs.readFileSync(REPORT, 'utf8');
  const title = `test-knowledge-system 全量测试报告 (${new Date().toISOString().slice(0, 10)})`;
  log('读取报告字节数:', Buffer.byteLength(content, 'utf8'));

  // 1) 经业务前端 BFF 回流接口创建草稿（exec_backflow / defect_experience）
  let draftId = null, usedBase = BFF, usedLabel = 'BFF';
  const res = await postApi(BFF, '/api/drafts', {
    source: 'exec_backflow', type: 'defect_experience', title, content
  }, PROJECT);
  if (res.success && res.data && res.data.id) { draftId = res.data.id; }
  else {
    log('⚠️ BFF 创建失败，回退直连 KS:', res.error || JSON.stringify(res).slice(0, 200));
    const res2 = await postApi(KS, '/api/drafts', {
      source: 'exec_backflow', type: 'defect_experience', title, content
    }, PROJECT);
    if (res2.success && res2.data && res2.data.id) { draftId = res2.data.id; usedBase = KS; usedLabel = 'KS'; }
    else { log('❌ 创建草稿失败:', res2.error || JSON.stringify(res2).slice(0, 200)); return; }
  }
  log(`✅ 回流草稿已创建 (经 ${usedLabel}) id=${draftId}`);

  // 2) 提交入库（进入知识库 brain）
  const cm = await postApi(usedBase, `/api/drafts/${draftId}/commit`, { skip_conflict_check: true }, PROJECT);
  if (!cm.success) log('⚠️ 提交未成功（可能质量门禁）:', cm.error || JSON.stringify(cm).slice(0, 200));
  else log('✅ 已提交入库 (commit):', cm.success);

  // 3) 验证：brain 页面出现 + 回流列表可见
  const pages = (await getApi(KS, '/api/brain/pages?limit=1000&category=quality-rules', PROJECT)).data || [];
  const hit = pages.find(p => String(p.id).toLowerCase().includes('test-knowledge-system') || String(p.title).includes('全量测试报告'));
  log(hit ? `✅ 知识库页面已存在: category=quality-rules id=${hit.id} title=${hit.title}` : '⚠️ 未在 quality-rules 找到报告页面（可能分类/质量门禁）');

  const bf = (await getApi(KS, '/api/drafts?limit=100&source=exec_backflow', PROJECT)).data || [];
  const bfHit = bf.find(d => d.id === draftId);
  log(bfHit ? `✅ 回流列表可见该草稿: status=${bfHit.status}` : '⚠️ 回流列表未找到该草稿');

  log('\n入库完成。项目 =', PROJECT, '| 经 =', usedLabel, '| 草稿ID =', draftId);
})().catch(e => { console.error('FATAL', e && e.message); });
