const fs = require('fs');

const src = fs.readFileSync('src/app.js', 'utf-8');
const globals = {};

// Match top-level function declarations
const funcRe = /^function\s+(\w+)/gm;
let m;
while ((m = funcRe.exec(src)) !== null) {
  globals[m[1]] = 'readonly';
}

// Match top-level const/let/var declarations
const declRe = /^(?:const|let|var)\s+(\w+)/gm;
while ((m = declRe.exec(src)) !== null) {
  globals[m[1]] = 'writable';
}

// Known DOM globals used in the file
['document', 'window', 'localStorage', 'fetch', 'console', 'setTimeout', 'clearTimeout', 'URL', 'Blob'].forEach(g => {
  globals[g] = 'readonly';
});

const output = JSON.stringify({ globals }, null, 2);
fs.writeFileSync('.eslint-globals.json', output);
console.log('Generated .eslint-globals.json with ' + Object.keys(globals).length + ' symbols');
