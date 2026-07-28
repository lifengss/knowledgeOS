const { execSync } = require('child_process');

const cmd = 'npx eslint src/app.js';

console.log('Running ESLint on src/app.js...');
try {
  const out = execSync(cmd, { encoding: 'utf-8', cwd: __dirname, stdio: 'pipe' });
  console.log(out || 'No issues found!');
} catch (e) {
  if (e.stdout) console.log(e.stdout);
  if (e.stderr) console.error(e.stderr);
  process.exit(1);
}
