'use strict';
const KS = 'http://localhost:3000/api';
async function get(p, project){ const r = await fetch(`${KS}${p}${p.includes('?')?'&':'?'}project=${encodeURIComponent(project)}`); return r.json(); }
(async () => {
  for (const pr of ['default','demo','testCaseGenerator']) {
    const stats = (await get('/stats', pr)).data || {};
    const pages = (await get('/brain/pages?limit=2000', pr)).data || [];
    const conflicts = (await get('/conflicts?limit=2000', pr)).data || [];
    // 检查冲突是否属于本项目：需要每条冲突的 draftId 对应的草稿 project
    console.log(`\n=== ${pr} ===`);
    console.log(`stats.totalPages=${stats.totalPages}  brainPages.len=${pages.length}  diff=${stats.totalPages-pages.length}`);
    console.log(`stats.totalConflicts=${stats.totalConflicts}  conflicts.len=${conflicts.length}  diff=${stats.totalConflicts-conflicts.length}`);
    console.log(`conflicts sample draftIds:`, conflicts.slice(0,5).map(c=>c.draftId));
  }
  // 直接看 conflicts 端点是否按项目隔离：对比 default 与 testCaseGenerator 的冲突 draftId
  const dConf = (await get('/conflicts?limit=2000','default')).data||[];
  const tConf = (await get('/conflicts?limit=2000','testCaseGenerator')).data||[];
  console.log('\ndefault conflicts draftIds:', dConf.map(c=>c.draftId));
  console.log('testCaseGenerator conflicts draftIds:', tConf.map(c=>c.draftId));
  console.log('两项目冲突集合相同?', JSON.stringify(dConf.map(c=>c.draftId).sort())===JSON.stringify(tConf.map(c=>c.draftId).sort()));
})().catch(e=>{console.error(e);process.exit(1);});
