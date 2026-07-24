#!/usr/bin/env node
/**
 * gen_html.cjs — 由 business-flows.json 生成自包含交互式图谱 index.html
 *
 * 把 JSON 注入 assets/graph-template.html 的 __DATA__ 占位符,
 * 输出纯前端、无 CDN 依赖、可双击离线打开的力导向图。
 *
 * 用法:
 *  node gen_html.cjs <business-flows.json> [<output.html>]
 *  output 省略时,默认写到输入文件同目录的 index.html。
 */
'use strict';
const fs = require('fs');
const path = require('path');

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('用法: node gen_html.cjs <business-flows.json> [<output.html>]');
    process.exit(2);
  }
  const inAbs = path.resolve(input);
  if (!fs.existsSync(inAbs)) { console.error('输入文件不存在:', inAbs); process.exit(2); }

  const data = JSON.parse(fs.readFileSync(inAbs, 'utf8'));

  const outAbs = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(path.dirname(inAbs), 'index.html');

  const tplPath = path.join(__dirname, '..', 'assets', 'graph-template.html');
  if (!fs.existsSync(tplPath)) { console.error('模板不存在:', tplPath); process.exit(2); }
  const tpl = fs.readFileSync(tplPath, 'utf8');

  if (!tpl.includes('__DATA__')) { console.error('模板缺少 __DATA__ 占位符'); process.exit(2); }
  const html = tpl.replace('__DATA__', JSON.stringify(data));

  fs.writeFileSync(outAbs, html, 'utf8');
  console.log('OK: wrote', outAbs, `(${data.nodes?.length || 0} nodes, ${data.edges?.length || 0} edges)`);
}

main();
