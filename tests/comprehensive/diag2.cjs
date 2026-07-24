'use strict';
const fs = require('fs');
const path = require('path');
const KS = 'http://localhost:3000/api';
const APP_JS = path.join('d:/self_coding/knowledgeOS/test-knowledge-system','web/src/app.js');
const ROOT = 'd:/self_coding/knowledgeOS/test-knowledge-system';

(async () => {
  // 1) 调试 B1 正则
  const app = fs.readFileSync(APP_JS,'utf8');
  const re1 = /\$\{stats\.([A-Za-z_][\w.]*)\}/g;
  let m, k1=[]; while((m=re1.exec(app))) k1.push(m[1]);
  console.log('B1 regex (stats.) keys:', k1);
  const re2 = /\$\{(stats|s)\.([A-Za-z_][\w.]*)\}/g;
  let k2=[]; while((m=re2.exec(app))) k2.push(m[1]+'.'+m[2]);
  console.log('B1 regex (stats|s) keys:', k2);

  // 2) A3 根因：testCaseGenerator 各分类端点计数 vs 磁盘文件数
  const pr='testCaseGenerator';
  const pages = (await (await fetch(`${KS}/brain/pages?limit=2000&project=${pr}`)).json()).data||[];
  const byCat={}; pages.forEach(p=>byCat[p.category]=(byCat[p.category]||0)+1);
  console.log('\nAPI brain/pages by category:', byCat, ' total=', pages.length);
  // 磁盘 brains/testCaseGenerator 各子目录 .md 数
  const dir = path.join(ROOT,'brains',pr);
  const disk={};
  (function walk(d){ for(const f of fs.readdirSync(d)){ const fp=path.join(d,f); const st=fs.statSync(fp); if(st.isDirectory()) walk(fp); else if(f.endsWith('.md')){ const cat=path.relative(dir,fp).split(path.sep)[0]; disk[cat]=(disk[cat]||0)+1; } } })(dir);
  console.log('DISK brains/testCaseGenerator by category:', disk);
  // proj_wiki 目录（若 project-wiki 来源于此）
  const pw = path.join(ROOT,'proj_wiki');
  if (fs.existsSync(pw)){ let n=0; (function walk(d){ for(const f of fs.readdirSync(d)){ const fp=path.join(d,f); const st=fs.statSync(fp); if(st.isDirectory()) walk(fp); else if(f.endsWith('.md')) n++; } })(pw); console.log('DISK proj_wiki .md count:', n); }
})().catch(e=>{console.error(e);process.exit(1);});
