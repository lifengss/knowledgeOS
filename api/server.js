/**
 * KnowledgeOS REST API Server
 * =============================
 * 提供 Web UI 所需的全部后端接口，直接调用 Python Skills 和 SQLite 缓冲层。
 *
 * 启动: node api/server.js
 * 端口: 3000 (默认，可通过 PORT 环境变量覆盖)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const multer = require('multer');
const iconv = require('iconv-lite');
const logger = require('./logger');

// 读取文本文件：自动探测 UTF-8 / GBK / GB2312 / GB18030 编码，避免 Windows 记事本默认 ANSI 导致乱码
function readTextFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const utf8 = buf.toString('utf-8');
  // 非法 UTF-8（含替换符）-> 多半是 GBK 等 ANSI 编码，整体按 GBK 解码
  if (utf8.includes('\uFFFD')) {
    const gbk = iconv.decode(buf, 'gbk');
    if (/[\u4e00-\u9fa5]/.test(gbk)) return gbk;
    return utf8;
  }
  // 合法 UTF-8 但夹杂“二次编码”乱码片段（如中文文件名被多层 UTF-8 误编码）-> 仅局部还原，
  // 避免对整个文件做 Latin-1 反向转换而破坏原本正确的中文内容。
  if (/[\u00C3\u00C2][\u0080-\u00BF]/.test(utf8)) {
    return repairMixedMojibake(utf8);
  }
  return utf8;
}

// 对单个乱码片段尝试 1~3 层 Latin-1 反向还原，取中文字符数最多的一层（兼容单层 / 双层 mojibake）
function reverseMojibakeRun(run) {
  let best = run, bestCjk = 0, cur = run;
  for (let i = 0; i < 4; i++) {
    const c = (cur.match(/[\u4e00-\u9fa5]/g) || []).length;
    if (c > bestCjk) { best = cur; bestCjk = c; }
    const rev = Buffer.from(cur, 'latin1').toString('utf-8');
    if (rev === cur) break;
    cur = rev;
  }
  return best;
}

// 仅处理含 Latin-1 引导字节（\u00C2/\u00C3）的连续片段，避免误伤正常标点（如间隔号 ·）
function repairMixedMojibake(s) {
  return s.replace(/([\u0080-\u00BF\u00C2\u00C3]+)/g, (run) => {
    if (!/[\u00C2\u00C3]/.test(run)) return run;
    return reverseMojibakeRun(run);
  });
}

// 从回测报告文本中抽取可拆分的记录数组。兼容常见键名 cases/results/tests/records/items/entries，
// 或直接顶层数组；均无法定位时回退为 [整份对象]（单条）。非 JSON 返回空数组（由调用方退化为单页沉淀）。
function extractTestReportRecords(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return []; }
  if (Array.isArray(parsed)) return parsed.filter(r => r && typeof r === 'object' && !Array.isArray(r));
  if (parsed && typeof parsed === 'object') {
    for (const key of ['cases', 'results', 'tests', 'records', 'items', 'entries', 'testCases', 'scenarios']) {
      const v = parsed[key];
      if (Array.isArray(v)) return v.filter(r => r && typeof r === 'object' && !Array.isArray(r));
    }
    return [parsed];
  }
  return [];
}

// 将不同格式的测试报告记录归一化为统一字段，供 defect-experience 沉淀使用。
// 支持 pytest-json-report 标准格式（nodeid / outcome / failure），同时兼容
// 自带 name/title/id/status/severity/group/evidence/detail 的自定义格式。
function normalizeTestReportRecord(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return rec;
  const out = Object.assign({}, rec);
  // pytest: nodeid -> 标题取末段方法名，完整 nodeid 保留为 caseId
  if (rec.nodeid) {
    const nodeid = String(rec.nodeid);
    const seg = nodeid.split('::').pop();
    out.title = seg || nodeid;
    out.id = nodeid;
    out.caseId = nodeid;
  }
  // pytest: outcome -> status
  if (rec.outcome) {
    const m = { passed: 'pass', failed: 'fail', error: 'error', skipped: 'skip', xfail: 'xfail', xpass: 'xpass' };
    out.status = m[String(rec.outcome).toLowerCase()] || String(rec.outcome);
  }
  // failure / error / stack -> 可读证据
  const failure = rec.failure || rec.error || rec.stack;
  if (failure && typeof failure === 'object') {
    const lines = [];
    if (failure.type) lines.push(`类型(type): ${failure.type}`);
    if (failure.message) lines.push(`信息(message): ${failure.message}`);
    if (typeof failure.missing_assertion === 'boolean') lines.push(`缺失断言(missing_assertion): ${failure.missing_assertion}`);
    if (typeof failure.boundary === 'boolean') lines.push(`边界场景(boundary): ${failure.boundary}`);
    out.evidence = lines.join('\n');
    out.detail = failure.message || JSON.stringify(failure, null, 2);
  } else if (typeof failure === 'string') {
    out.evidence = failure;
    out.detail = failure;
  }
  // 通过用例无 failure：补耗时，提升可读性
  if (!out.evidence) {
    const dur = rec.duration != null ? `${rec.duration}s` : '未知';
    out.evidence = `用例通过，耗时 ${dur}。`;
  }
  return out;
}

// 代理支持：Node 全局 fetch(undici) 默认不读取 HTTP(S)_PROXY。若后端机器需经代理才能访问外网
// （典型表现：浏览器能访问 api.icompify.com，但 KS 后端调用连不上），在此显式设置全局 dispatcher。
const _proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
if (_proxyUrl) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = require('undici');
    setGlobalDispatcher(new ProxyAgent(_proxyUrl));
    console.log('[proxy] 已启用全局代理:', _proxyUrl);
  } catch (e) {
    console.warn('[proxy] 未能启用代理（需先 npm install undici）：', e.message);
  }
}

const app = express();
const PORT = process.env.REST_API_PORT || process.env.PORT || 3000;

// 项目根目录
const PROJECT_ROOT = path.resolve(__dirname, '..');

// 上传临时目录（multer 接收代码 zip / 单文件）
const UPLOAD_DIR = path.join(PROJECT_ROOT, 'cache', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// 保留原始扩展名，便于后端按 .zip 识别为压缩包
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({ storage: uploadStorage });

// 中间件
app.use(cors());
// 放宽 JSON body 上限：业务流程与依赖图谱的「选择素材生成」会一次性提交多个
// Wiki 页面内容，默认 100kb 上限极易触发 413。放大到 10mb 以免素材模式被拒绝。
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件：Web UI
app.use(express.static(path.join(PROJECT_ROOT, 'web')));

// 请求日志（方法 / 路径 / 状态 / 耗时），写入 logs/app-*.log（保留 7 天）
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.http(req, res, Date.now() - start, { ip: req.ip });
  });
  next();
});

// ---------------------------------------------------------------
// 辅助函数：调用 Python Skill
// ---------------------------------------------------------------
function callPython(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const python = process.platform === 'win32' ? 'python' : 'python3';
    const proc = spawn(python, [path.join(PROJECT_ROOT, scriptPath), ...args], {
      cwd: PROJECT_ROOT,
      // shell:false 直接把参数数组交给 CreateProcess，避免 Windows 下经 cmd.exe 传递
      // 含中文/空格的参数时被错误拆分（导致 argparse 报 unrecognized arguments）。
      // PYTHONUTF8=1 确保 Python 以 UTF-8 解析 argv 与 stdout。
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      shell: false
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        logger.error(new Error(`Python ${scriptPath} exited ${code}`), {
          script: scriptPath, args: args, stderr: (stderr || '').slice(0, 800),
        });
        reject(new Error(`Python script exited with code ${code}: ${stderr || stdout}`));
      } else {
        try {
          // 尝试解析完整 stdout 为 JSON（skills 脚本统一输出 JSON）
          const json = JSON.parse(stdout.trim());
          resolve(json);
        } catch {
          resolve({ success: true, output: stdout.trim() });
        }
      }
    });
  });
}

// ---------------------------------------------------------------
// 健康检查
// ---------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', time: new Date().toISOString() });
});

// ---------------------------------------------------------------
// 模块 1: 草稿管理 (Drafts)
// ---------------------------------------------------------------

// GET /api/drafts - 获取草稿列表
const projects = require('./projects');

// 多项目：从请求解析 project 维度（query.project / body.project，默认 default）
function resolveProject(req) {
  const pid = (req.query && req.query.project) || (req.body && req.body.project) || projects.getDefaultProject().id;
  return pid;
}
// 返回项目私有 + 共享的 Brain 目录（绝对路径，正斜杠），用于只读/搜索合并
function brainDirsFor(pid) {
  return projects.resolveBrainDirs(pid).map((d) => d.replace(/\\/g, '/'));
}

// ---------------------------------------------------------------------------
// AI CLI 登录态管理（默认 CodeBuddy CLI，预留多 provider 扩展）
// 后端仅负责"检测登录态"与"触发登录"（派生 CLI 打开浏览器 OAuth）。
// 凭证由 CodeBuddy CLI 自身持久化在用户配置目录，天然一次登录、后续免登。
// ---------------------------------------------------------------------------
const AI_CLI_PROVIDERS = {
  codebuddy: {
    id: 'codebuddy',
    name: 'CodeBuddy CLI',
    default: true,
    resolve: () => {
      if (process.env.CODEBUDDY_CODE_PATH) return process.env.CODEBUDDY_CODE_PATH;
      try {
        const g = spawnSync('npm', ['root', '-g'], { encoding: 'utf-8', shell: true });
        const groot = (g.stdout || '').trim();
        const p = path.join(groot, '@tencent-ai', 'codebuddy-code', 'bin', 'codebuddy');
        if (groot && fs.existsSync(p)) return p;
      } catch (_) {}
      try {
        const w = spawnSync(process.platform === 'win32' ? 'where' : 'command',
          process.platform === 'win32' ? ['codebuddy'] : ['-v', 'codebuddy'],
          { encoding: 'utf-8', shell: true }).stdout.toString().trim().split(/\r?\n/)[0];
        if (w) return w;
      } catch (_) {}
      return 'codebuddy'; // PATH 兜底
    },
  },
};

function _codebuddyTokenCandidates() {
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  return [
    path.join(home, '.codebuddy', 'credentials.json'),
    path.join(home, '.codebuddy', 'auth.json'),
    path.join(home, '.codebuddy', 'session.json'),
    path.join(appData, 'CodeBuddy', 'credentials.json'),
    path.join(appData, 'codebuddy', 'credentials.json'),
    path.join(home, '.config', 'codebuddy', 'credentials.json'),
  ];
}
function _hasCodebuddyToken() {
  return _codebuddyTokenCandidates().some((c) => {
    try { return fs.existsSync(c) && fs.statSync(c).size > 0; } catch (_) { return false; }
  });
}
function _spawnCli(script, args, opts) {
  if (script && script !== 'codebuddy' && fs.existsSync(script)) {
    const lower = script.toLowerCase();
    if (lower.endsWith('.cmd') || lower.endsWith('.bat') || lower.endsWith('.ps1') || lower.endsWith('.exe')) {
      return spawn(script, args, opts);
    }
    return spawn(process.execPath, [script, ...args], opts);
  }
  return spawn(script, args, Object.assign({ shell: true }, opts || {}));
}
function _runCli(script, args, timeoutMs) {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    const cp = _spawnCli(script, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const onData = (d) => { out += d.toString(); };
    cp.stdout.on('data', onData);
    cp.stderr.on('data', onData);
    const finish = (code) => { if (done) return; done = true; clearTimeout(timer); resolve({ code, out }); };
    cp.on('close', finish);
    cp.on('error', () => finish(-1));
    const timer = setTimeout(() => { try { cp.kill(); } catch (_) {} finish(-2); }, timeoutMs || 20000);
  });
}
async function _resolveAndCheckInstalled(prov) {
  const script = prov.resolve();
  if (script && script !== 'codebuddy') {
    return { script, installed: fs.existsSync(script) };
  }
  const v = await _runCli('codebuddy', ['--version'], 8000);
  return { script: 'codebuddy', installed: v.code === 0 && !/not recognized|not found|unknown command/i.test(v.out) };
}
async function checkAiCliStatus(provider) {
  const prov = AI_CLI_PROVIDERS[provider] || AI_CLI_PROVIDERS.codebuddy;
  const { script, installed } = await _resolveAndCheckInstalled(prov);
  if (!installed) {
    return { provider: prov.id, name: prov.name, installed: false, loggedIn: false, status: 'not_installed', message: '未检测到 CodeBuddy CLI，请先执行：npm i -g @tencent-ai/codebuddy-code' };
  }
  const r = await _runCli(script, ['auth', 'status'], 20000);
  const o = (r.out || '').toLowerCase();
  let loggedIn = null;
  if (/(logged in|已登录|authenticated|登录有效|token.*valid|session.*valid)/.test(o)) loggedIn = true;
  else if (/(not logged|未登录|no (valid )?token|please log ?in|请登录|expired|unauthorized)/.test(o)) loggedIn = false;
  if (loggedIn === null) loggedIn = _hasCodebuddyToken();
  const status = loggedIn ? 'logged_in' : 'not_logged_in';
  let message;
  if (loggedIn) message = '已登录，AI CLI 能力可用（一次登录，后续无需重复）';
  else message = (r.out && r.out.trim()) ? r.out.trim().slice(0, 200) : '未登录，请点击下方「登录」按钮在浏览器中完成授权';
  return { provider: prov.id, name: prov.name, installed: true, loggedIn, status, message };
}
function startAiCliLogin(provider) {
  const prov = AI_CLI_PROVIDERS[provider] || AI_CLI_PROVIDERS.codebuddy;
  return (async () => {
    const { script, installed } = await _resolveAndCheckInstalled(prov);
    if (!installed) return { success: false, error: '未检测到 CodeBuddy CLI，请先安装：npm i -g @tencent-ai/codebuddy-code' };
    try {
      const child = _spawnCli(script, ['login'], { detached: true, stdio: 'ignore' });
      child.unref();
      return { success: true, message: '已在默认浏览器打开 CodeBuddy 登录页，请完成授权（一次性，令牌将持久保存）' };
    } catch (e) {
      return { success: false, error: String((e && e.message) || e) };
    }
  })();
}
app.get('/api/ai-cli/status', async (req, res) => {
  try {
    const s = await checkAiCliStatus((req.query && req.query.provider) || 'codebuddy');
    res.json({ success: true, data: s });
  } catch (e) {
    res.json({ success: false, error: String((e && e.message) || e) });
  }
});
app.post('/api/ai-cli/login', async (req, res) => {
  const r = await startAiCliLogin((req.body && req.body.provider) || 'codebuddy');
  res.json(r.success ? r : Object.assign({ success: false }, r));
});

// GET /api/projects - 返回多项目配置，供前端枚举与切换知识库
app.get('/api/projects', async (req, res) => {
  try {
    const list = projects.getProjects().map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      brainPath: p.brainPath
    }));
    res.json({
      success: true,
      data: {
        defaultProject: projects.getDefaultProject().id,
        sharedBrain: projects.config.sharedBrain || '',
        projects: list
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/projects - 运行时新建项目（写回 config/projects.json + 建 brains/<id> 目录）
app.post('/api/projects', async (req, res) => {
  try {
    const { id, name, description } = req.body || {};
    if (!id || !String(id).trim()) {
      return res.status(400).json({ success: false, error: '项目 ID 不能为空' });
    }
    const entry = projects.addProject({ id, name, description });
    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/projects/:id - 运行时删除项目（清理私有 brain 目录 + 写回配置）
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const entry = projects.removeProject(req.params.id);
    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/drafts', async (req, res) => {
  try {
    const { status, source, type, limit = 100, offset = 0 } = req.query;
    const result = await callPython('cache/draft_cache.py', [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      'list',
      '--limit', String(limit),
      '--offset', String(offset),
      '--project', resolveProject(req),
      ...(status ? ['--status', status] : []),
      ...(source ? ['--source', source] : []),
      ...(type ? ['--type', type] : [])
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/drafts/:id - 获取单个草稿
app.get('/api/drafts/:id', async (req, res) => {
  try {
    const result = await callPython('cache/draft_cache.py', [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      'get',
      '--id', req.params.id
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/drafts - 创建草稿
app.post('/api/drafts', async (req, res) => {
  try {
    const { source, type, title, content, metadata } = req.body;
    const result = await callPython('cache/draft_cache.py', [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      'add',
      '--source', source || 'human_edit',
      '--type', type || 'quality_rule',
      '--title', title || '未命名草稿',
      '--content', content || '',
      '--metadata', JSON.stringify(metadata || {}),
      '--project', resolveProject(req)
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/drafts/:id/status - 更新草稿状态
app.put('/api/drafts/:id/status', async (req, res) => {
  try {
    const { status, score } = req.body;
    const result = await callPython('cache/draft_cache.py', [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      'update-status',
      '--id', req.params.id,
      '--status', status,
      ...(score !== undefined ? ['--score', String(score)] : [])
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/drafts/:id - 更新草稿内容（人工编辑标题/正文/类型）
// 当编辑的是 AI 生成的用例/脚本(test_case / test_script)且正文产生有效改动时，
// 自动对比新旧内容、提炼质量规则草稿进入缓冲层（对齐设计「链路 3a / 4.2.4 人工编辑缓存写入流程」）。
app.put('/api/drafts/:id', async (req, res) => {
  try {
    const { title, content, type } = req.body;
    const db = process.env.CACHE_DB_PATH || './cache/drafts.db';
    const pid = resolveProject(req);

    // 读取原草稿：用于更新，并判断是否产生有效改动以触发质量规则总结
    const oldDraft = await callPython('cache/draft_cache.py', [
      '--db', db, 'get', '--id', req.params.id,
    ]).catch(() => null);
    const oldContent = (oldDraft && oldDraft.content) ? oldDraft.content : '';
    const oldType = (oldDraft && oldDraft.type) ? oldDraft.type : type;

    // 更新草稿内容
    const args = ['--db', db, 'update-draft', '--id', req.params.id];
    if (title !== undefined) args.push('--title', title);
    if (content !== undefined) args.push('--content', content);
    if (type !== undefined) args.push('--type', type);
    const result = await callPython('cache/draft_cache.py', args);

    // 自动总结质量规则：仅对 AI 生成用例/脚本类草稿、且正文有效改动时触发；
    // 编辑质量规则草稿自身(oldType=quality_rule)不级联，避免无限生成。
    const TRIGGER_TYPES = new Set(['test_case', 'test_script']);
    const newContent = (content !== undefined) ? content : oldContent;
    const changed = newContent !== oldContent
      && newContent.replace(/\s+/g, '') !== oldContent.replace(/\s+/g, '');
    if (TRIGGER_TYPES.has(oldType) && changed) {
      try {
        const draftTitle = title || (oldDraft && oldDraft.title) || req.params.id;
        const ruleResult = await callPython('skills/generate_quality_rule.py', [
          '--title', draftTitle,
          '--old', oldContent,
          '--new', newContent,
        ]);
        const ruleContent = (ruleResult && ruleResult.content) ? ruleResult.content : '';
        if (ruleContent) {
          const ruleDraft = await callPython('cache/draft_cache.py', [
            '--db', db, 'add',
            '--source', 'human_edit',
            '--type', 'quality_rule',
            '--title', `质量规则: ${draftTitle}`,
            '--content', ruleContent,
            '--metadata', JSON.stringify({
              fromDraftEdit: { draftId: req.params.id, draftType: oldType },
              ruleSource: ruleResult.source,
            }),
            '--project', (oldDraft && oldDraft.projectId) || pid,
          ]);
          result.ruleDraftId = ruleDraft.id || ruleDraft.draftId || null;
        }
      } catch (e) {
        console.error('[draft-edit] 质量规则自动总结失败(已忽略):', e.message);
      }
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/drafts/:id/commit - 单条入库
app.post('/api/drafts/:id/commit', async (req, res) => {
  try {
    const { skip_conflict_check, skip_quality_gate } = req.body;
    const result = await callPython('skills/single_commit.py', [
      req.params.id,
      '--db-path', process.env.CACHE_DB_PATH || './cache/drafts.db',
      '--project', resolveProject(req),
      ...(skip_conflict_check ? ['--skip-conflict-check'] : []),
      ...(skip_quality_gate ? ['--skip-quality-gate'] : [])
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/drafts/batch-commit - 批量入库
app.post('/api/drafts/batch-commit', async (req, res) => {
  try {
    const { skip_conflict_check, skip_quality_gate, ids } = req.body;
    const draftIds = ids || req.body.draftIds;
    const result = await callPython('skills/batch_commit.py', [
      '--db-path', process.env.CACHE_DB_PATH || './cache/drafts.db',
      '--project', resolveProject(req),
      ...((draftIds && Array.isArray(draftIds) && draftIds.length) ? ['--draft-ids', ...draftIds] : ['--all']),
      ...(skip_conflict_check ? ['--skip-conflict-check'] : []),
      ...(skip_quality_gate ? ['--skip-quality-gate'] : [])
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/drafts/:id - 删除单条草稿
app.delete('/api/drafts/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const result = await callPython('cache/draft_cache.py', [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      'delete-draft', '--project', resolveProject(req), '--id', id
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/drafts - 批量删除草稿（body: { ids: [...] }）
app.delete('/api/drafts', async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, error: '缺少 ids 参数' });
    }
    const result = await callPython('cache/draft_cache.py', [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      'delete-draft', '--project', resolveProject(req),
      '--id', ...ids.map(String)
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------
// 模块 2: 冲突管理 (Conflicts)
// ---------------------------------------------------------------

// GET /api/conflicts - 获取冲突列表
app.get('/api/conflicts', async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    const result = await callPython('cache/draft_cache.py', [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      'list-conflicts',
      '--limit', String(limit),
      '--project', resolveProject(req),
      ...(status ? ['--status', status] : [])
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/conflicts/detect - 触发冲突检测
app.post('/api/conflicts/detect', async (req, res) => {
  try {
    const result = await callPython(      'skills/conflict_detector.py', [
        '--db-path', process.env.CACHE_DB_PATH || './cache/drafts.db',
        '--project', resolveProject(req)
      ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/conflicts/:id/resolve - 处理冲突
app.put('/api/conflicts/:id/resolve', async (req, res) => {
  try {
    const { resolution } = req.body;
    const result = await callPython('cache/draft_cache.py', [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      'resolve-conflict',
      '--id', req.params.id,
      '--resolution', resolution || 'merge'
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/conflicts/resolve-batch - 批量处理冲突
app.put('/api/conflicts/resolve-batch', async (req, res) => {
  try {
    const { ids, resolution } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, error: 'ids 不能为空' });
    }
    const result = await callPython('cache/draft_cache.py', [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      'resolve-conflicts',
      '--ids', ids.join(','),
      '--resolution', resolution || 'merge'
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------
// 模块 3: 质量门控 (Quality Gate)
// ---------------------------------------------------------------

// POST /api/quality-gate/check - 质量检查
app.post('/api/quality-gate/check', async (req, res) => {
  try {
    const { draft_ids } = req.body;
    const args = ['--db-path', process.env.CACHE_DB_PATH || './cache/drafts.db', '--project', resolveProject(req)];
    if (draft_ids) {
      args.push('--draft-ids', ...draft_ids.split(','));
    }
    const result = await callPython('skills/quality_gate.py', args);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------
// 模块 4: 审计日志 (Audit Log)
// ---------------------------------------------------------------

// GET /api/audit-log - 获取审计日志（支持分页与过滤）
app.get('/api/audit-log', async (req, res) => {
  try {
    const { action, operator, target, startTime, endTime, page = 1, pageSize = 20 } = req.query;
    const buildArgs = (cmd) => [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      cmd,
      '--page', String(page),
      '--page-size', String(pageSize),
      ...(action ? ['--action', action] : []),
      ...(operator ? ['--operator', operator] : []),
      ...(target ? ['--target', target] : []),
      ...(startTime ? ['--start-time', startTime] : []),
      ...(endTime ? ['--end-time', endTime] : [])
    ];
    // 返回结构化 { items, total }，供前端分页与趋势聚合使用
    const [items, totalRaw] = await Promise.all([
      callPython('cache/draft_cache.py', buildArgs('list-audit')),
      callPython('cache/draft_cache.py', buildArgs('count-audit')).catch(() => null)
    ]);
    const total = (typeof totalRaw === 'number') ? totalRaw : (Array.isArray(items) ? items.length : 0);
    res.json({ success: true, data: { items, total } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/stats - 获取统计数据
app.get('/api/stats', async (req, res) => {
  try {
    const result = await callPython('cache/draft_cache.py', [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      'stats',
      '--project', resolveProject(req)
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/brain/stats - 按 brain 分类统计页面数（用例 / 脚本 / 规则 / 缺陷 / wiki）
app.get('/api/brain/stats', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const brainDirs = brainDirsFor(pid);
    const categories = projects.CATEGORIES || ['quality-rules', 'defect-experience', 'project-wiki', 'test-cases', 'test-scripts'];
    const stats = {};
    for (const cat of categories) {
      // 私有库优先，共享库同名文件按 cat/file 去重，使统计与 /api/brain/pages、/api/stats 一致
      const seen = new Set();
      for (const bdir of brainDirs) {
        const catPath = path.join(bdir, cat);
        if (!fs.existsSync(catPath)) continue;
        for (const f of fs.readdirSync(catPath)) {
          if (!f.endsWith('.md')) continue;
          const key = `${cat}/${f}`;
          if (seen.has(key)) continue;
          seen.add(key);
        }
      }
      stats[cat] = { count: seen.size };
    }
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------
// 模块 4.5: AI 平台对接 (AI Adapter)
// 配置中心对齐 testcase-gen-frontend 的系统设置；质量规则生成供“人工编辑优化”链路使用
// ---------------------------------------------------------------

// GET /api/ai-settings - 读取 AI 平台配置
app.get('/api/ai-settings', async (req, res) => {
  try {
    const result = await callPython('ai/ai_config.py', ['get']);
    result.knowledgeRoot = projects.PROJECT_DIR;
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/ai-settings - 更新 AI 平台配置（持久化到 data/ai_config.json）
app.put('/api/ai-settings', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await callPython('ai/ai_config.py', ['set', '--json', JSON.stringify(body)]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/generate-quality-rule - 由人工编辑前后内容生成质量规则
// body: { title, old, new }
app.post('/api/generate-quality-rule', async (req, res) => {
  try {
    const { title = '未命名条目', old = '', new: newContent = '' } = req.body || {};
    const result = await callPython('skills/generate_quality_rule.py', [
      '--title', title,
      '--old', old,
      '--new', newContent,
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------
// 模块 5: 知识检索 (Search)
// ---------------------------------------------------------------

// POST /api/search - 知识检索
app.post('/api/search', async (req, res) => {
  try {
    const { query, mode = 'keyword', limit = 10 } = req.body;
    // 调用 case_generator 进行搜索
    const result = await callPython('skills/case_generator.py', [
      query || '',
      '--mode', mode,
      '--limit', String(limit),
      '--brain-dirs', brainDirsFor(resolveProject(req)).join(','),
      '--project', resolveProject(req)
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/generate-cases - 生成测试用例
app.post('/api/generate-cases', async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;
    const result = await callPython('skills/case_generator.py', [
      query || '',
      '--mode', 'query',
      '--limit', String(limit),
      '--brain-dirs', brainDirsFor(resolveProject(req)).join(',')
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------
// 模块 6: 源数据上传 (Source Upload)
// ---------------------------------------------------------------

// POST /api/source-upload - 上传源数据
// 业务代码类型支持上传压缩包（zip / tar(.gz/.bz2/.xz) / 7z）或单个代码文件（自动解析并写入草稿）
app.post('/api/source-upload', upload.single('file'), async (req, res) => {
  try {
    const type = req.body.type || (req.file ? 'code' : 'quality_rule');
    const note = req.body.note || '';

    // 项目描述材料（PRD / 需求列表）：直接写入项目知识库 project-wiki，形成「项目 Wiki」（GBrain）
    // 设计：文档材料 → 项目 Wiki 直接入库，不经过草稿缓冲层；前端「按功能模块」选测试范围的数据源。
    // 同时支持文件上传（multipart）与纯文本（JSON content）两种提交方式。
    // （与代码上传产生的 API 调用依赖图谱区分；仅 api-*.md 参与图谱构建，互不影响）
    if (type === 'prd' || type === 'requirement' || type === 'test-report') {
      let text;
      if (req.file) {
        text = readTextFile(req.file.path);
        try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      } else {
        text = req.body.content || '';
      }
      const brainDir = projects.resolveBrainDir(req.body.project || 'default');
      const fileBase = req.file ? path.basename(req.file.originalname, path.extname(req.file.originalname)) : '';
      const bodyName = req.body.filename ? String(req.body.filename).replace(/\.[^.]+$/, '') : '';
      const sourceFile = req.body.filename || (req.file ? req.file.originalname : '');
      // 中文文件名经 multipart 上传时可能被多层 UTF-8 误编码成 mojibake，入库前先局部还原
      const rawName = repairMixedMojibake(note || bodyName || fileBase || type);
      const safeSourceFile = repairMixedMojibake(sourceFile);
      const base = rawName.replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || type;

      // 回测报告：JSON 格式自动解析拆分为多条记录（当前版本统一标签为「缺陷经验」）
      if (type === 'test-report') {
        const catDir = path.join(brainDir, 'defect-experience');
        fs.mkdirSync(catDir, { recursive: true });
        fs.mkdirSync(path.join(catDir, 'raw'), { recursive: true });
        const records = extractTestReportRecords(text).map(normalizeTestReportRecord);
        const slug = `de-${base}`;
        // 整份原始报告溯源副本（无论是否拆分都保留，便于回测复盘）
        fs.writeFileSync(path.join(catDir, 'raw', `${slug}-raw.md`), `# ${rawName}（原始测试报告）\n\n${text}\n`, 'utf-8');
        if (records.length) {
          const rawRel = `raw/${slug}-raw.md`;
          const slugs = [];
          records.forEach((rec, i) => {
            const cSlug = `${slug}-${i + 1}`;
            const rTitle = String(rec.name || rec.title || rec.id || `记录#${i + 1}`).replace(/\s+/g, ' ').trim().slice(0, 80);
            const fm = [
              '---',
              'uploadType: test-report',
              `title: ${rTitle}`,
              `caseId: ${rec.id || ''}`,
              `status: ${rec.status || ''}`,
              `severity: ${rec.severity || ''}`,
              `group: ${rec.group || ''}`,
              `sourceFile: ${safeSourceFile}`,
              `raw: ${rawRel}`,
              `uploadedAt: ${new Date().toISOString()}`,
              '---',
              `# ${rTitle}（${rec.id || '记录' + (i + 1)}）`,
              '',
              `- 状态(status)：${rec.status || '-'}`,
              `- 严重度(severity)：${rec.severity || '-'}`,
              `- 分组(group)：${rec.group || '-'}`,
              '',
              '## 证据(evidence)',
              '```',
              String(rec.evidence || ''),
              '```',
              '',
              '## 细节(detail)',
              '```',
              String(rec.detail || ''),
              '```',
              ''
            ].join('\n');
            fs.writeFileSync(path.join(catDir, cSlug + '.md'), fm, 'utf-8');
            slugs.push(cSlug);
          });
          res.json({ success: true, data: { summary: `已拆分沉淀为缺陷经验：${slugs.length} 条记录`, slug: slugs[0], slugs, count: slugs.length, uploadType: 'test-report', category: 'defect-experience' } });
          return;
        }
        // 非 JSON / 无 records：退化为单页沉淀（保持对 Markdown/纯文本的兼容）
        const fm = `---\nuploadType: test-report\ntitle: ${rawName}\nsourceFile: ${safeSourceFile}\nraw: raw/${slug}-raw.md\nuploadedAt: ${new Date().toISOString()}\n---\n# ${rawName}\n\n${text}`;
        fs.writeFileSync(path.join(catDir, slug + '.md'), fm, 'utf-8');
        res.json({ success: true, data: { summary: `已沉淀为缺陷经验(defect-experience)：${slug}.md`, slug, uploadType: 'test-report', category: 'defect-experience' } });
        return;
      }

      // PRD / 需求列表 → 项目 Wiki（单页沉淀，与代码产生的 API 调用依赖图谱区分）
      const catDir = path.join(brainDir, 'project-wiki');
      fs.mkdirSync(catDir, { recursive: true });
      const prefix = type === 'requirement' ? 'req' : 'prd';
      let slug = `${prefix}-${base}`;
      let dup = 2;
      while (fs.existsSync(path.join(catDir, slug + '.md'))) {
        slug = `${prefix}-${base}-${dup}`;
        dup++;
      }
      const rawRel = `raw/${slug}-raw.md`;
      const fm = `---\nuploadType: ${type}\ntitle: ${rawName}\nsourceFile: ${safeSourceFile}\nraw: ${rawRel}\nuploadedAt: ${new Date().toISOString()}\n---\n# ${rawName}\n\n${text}`;
      fs.writeFileSync(path.join(catDir, slug + '.md'), fm, 'utf-8');
      // Raw 溯源区：独立存放原始文档，可在项目 Wiki 中溯源查看
      fs.mkdirSync(path.join(catDir, 'raw'), { recursive: true });
      const rawFm = `# ${rawName}（原始文档）

${text}
`;
      fs.writeFileSync(path.join(catDir, 'raw', `${slug}-raw.md`), rawFm, 'utf-8');
      res.json({ success: true, data: { summary: `已沉淀为项目 Wiki：${slug}.md`, slug, uploadType: type, category: 'project-wiki' } });
      return;
    }

    // 无文件（纯文本）：作为草稿写入缓冲层（如 quality_rule / defect / report）
    if (!req.file) {
      const { content } = req.body;
      const result = await callPython('cache/draft_cache.py', [
        '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
        'add',
        '--source', 'upload',
        '--type', type || 'quality_rule',
        '--title', note || `上传: ${type}`,
        '--content', content || '',
        '--metadata', JSON.stringify({ uploadType: type, note: note || '' }),
        '--project', resolveProject(req)
      ]);
      res.json({ success: true, data: result });
      return;
    }

    // 代码上传：zip/tar/7z 压缩包或单个代码文件 → 解析「API 调用依赖」图谱（project-wiki/api-*.md）
    if (type === 'code') {
      const result = await callPython('skills/code_upload_parser.py', [
        '--input', req.file.path,
        '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
        '--brain', projects.resolveBrainDir(req.body.project || 'default'),
        '--project', req.body.project || 'default',
        '--note', note
      ]);
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      res.json({ success: true, data: result });
      return;
    }

    // 其它文件类型（如 quality_rule）回退为草稿缓冲
    const { content } = req.body;
    const result = await callPython('cache/draft_cache.py', [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      'add', '--source', 'upload', '--type', type,
      '--title', note || `上传: ${type}`,
      '--content', content || readTextFile(req.file.path),
      '--metadata', JSON.stringify({ uploadType: type, note }),
      '--project', resolveProject(req)
    ]);
    try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------
// GBrain / AI 调用辅助（OpenAI 兼容 /chat/completions）
// ---------------------------------------------------------------
async function callOpenAI({ endpoint, apiKey, model, messages, timeoutMs = 120000 }) {
  if (!endpoint) return null;
  const base = String(endpoint).replace(/\/+$/, '');
  const url = base.endsWith('/chat/completions') ? base : base + '/chat/completions';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (apiKey || '') },
      body: JSON.stringify({ model: model || 'gpt-4o-mini', messages }),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error('GBrain/AI HTTP ' + resp.status + ': ' + txt.slice(0, 300));
    }
    const j = await resp.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || null;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('GBrain/AI 请求超时');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// 简单中文/英文分词：英文按词、中文取二元组 + 整词
function tokenize(s) {
  const clean = (s || '').toLowerCase();
  const cjk = clean.match(/[一-龥]+/g) || [];
  const words = clean.split(/[^a-z0-9一-龥]+/i).filter(Boolean);
  const toks = new Set(words);
  for (const w of cjk) {
    toks.add(w);
    for (let i = 0; i < w.length - 1; i++) toks.add(w.slice(i, i + 2));
  }
  return Array.from(toks).filter(t => t.length >= 2);
}

// 判断路径是否落在隔离 raw 溯源区（禁止经 API/MCP 读取）
function isRawPath(p) {
  return String(p).split(/[\\/]/).some(seg => seg === 'raw');
}

// 从 GBrain 各分类检索与问题相关的素材（返回 topN 条，含最佳片段）
function kbRetrieve(question, brainDir, categories, topN) {
  const qTokens = tokenize(question);
  if (!qTokens.length) return [];
  const scored = [];
  for (const cat of categories) {
    const catPath = path.join(brainDir, cat);
    if (!fs.existsSync(catPath)) continue;
    for (const file of fs.readdirSync(catPath).filter(f => f.endsWith('.md'))) {
      const fp = path.join(catPath, file);
      if (isRawPath(fp)) continue; // 跳过隔离 raw 溯源区
      let content;
      try { content = readTextFile(fp); } catch { continue; }
      let title = file;
      const fmM = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmM) {
        const tline = fmM[1].split('\n').find(l => l.startsWith('title:'));
        if (tline) title = tline.slice(6).trim();
      }
      const headMatch = content.match(/^#\s+(.+)$/m);
      if (title === file && headMatch) title = headMatch[1].trim();
      const lower = content.toLowerCase();
      let score = 0;
      for (const t of qTokens) {
        const re = new RegExp(escapeRegExp(t), 'gi');
        score += (lower.match(re) || []).length;
      }
      if (score <= 0) continue;
      const paragraphs = content.split(/\n{2,}/);
      let best = '', bestScore = -1;
      for (const p of paragraphs) {
        let ps = 0;
        const pl = p.toLowerCase();
        for (const t of qTokens) { const re = new RegExp(escapeRegExp(t), 'gi'); ps += (pl.match(re) || []).length; }
        if (ps > bestScore) { bestScore = ps; best = p; }
      }
      scored.push({ category: cat, id: file.replace(/\.md$/, ''), title, score, snippet: best.slice(0, 1200).trim() });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

// 在 frontmatter 中写入/更新某个字段（值为多行时以双引号转义存储）
function setFrontmatterField(content, key, value) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  const lines = m ? m[1].split('\n') : [];
  const idx = lines.findIndex(l => l.startsWith(key + ':'));
  const quoted = '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  if (idx >= 0) lines[idx] = `${key}: ${quoted}`;
  else lines.push(`${key}: ${quoted}`);
  const newFm = '---\n' + lines.join('\n') + '\n---';
  const body = m ? content.slice(m[0].length) : content;
  return newFm + (body.startsWith('\n') ? body : '\n' + body);
}

// POST /api/wiki/:category/:id/ai-summary - 调用 GBrain 生成并持久化 AI 摘要
app.post('/api/wiki/:category/:id/ai-summary', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const { category, id } = req.params;
    if (!projects.CATEGORIES.includes(category)) return res.status(400).json({ success: false, error: '非法分类: ' + category });
    const cfg = (await callPython('ai/ai_config.py', ['get'])) || {};
    const gb = cfg.gbrain || {};
    if (!gb.endpoint) return res.status(400).json({ success: false, error: 'GBrain 未配置模型 endpoint，请到「系统设置」配置。' });
    // 遍历私有库 + 共享库定位页面（与 GET /api/brain/pages 一致），避免共享库页面误报「页面不存在」
    let fp = null;
    for (const bdir of brainDirsFor(pid)) {
      const cand = path.join(bdir, category, id + '.md');
      if (fs.existsSync(cand)) { fp = cand; break; }
    }
    if (!fp) return res.status(404).json({ success: false, error: `Wiki 页面文件不存在（category=${category}, id=${id}），可能 id 不匹配或文件未落盘。` });
    const content = readTextFile(fp);
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : id;
    const body = content.replace(/^---\n[\s\S]*?\n---/, '').trim();
    let summary;
    try {
      summary = await callOpenAI({
        endpoint: gb.endpoint, apiKey: gb.apiKey, model: gb.model,
        messages: [
          { role: 'system', content: '你是知识库摘要助手。请用 3-5 条简洁中文要点概括下方文档，使用 Markdown 无序列表（每行以「- 」开头）。不要重复文档标题。仅基于文档内容。' },
          { role: 'user', content: `文档标题：${title}\n\n文档内容：\n${body.slice(0, 6000)}` }
        ]
      });
    } catch (e) {
      console.error('[ai-summary] GBrain 调用失败：', e.message);
      return res.status(502).json({
        success: false,
        error: 'GBrain 模型调用失败：' + e.message +
          '（请确认 api.icompify.com 在该后端机器上可达、endpoint 路径正确；若后端经代理出网，请设置 HTTPS_PROXY 环境变量后重启服务）'
      });
    }
    if (!summary) return res.status(502).json({ success: false, error: 'GBrain 未返回内容（可能未配置或网络不通）' });
    const newContent = setFrontmatterField(content, 'aiSummary', summary.trim());
    fs.writeFileSync(fp, newContent, 'utf-8');
    res.json({ success: true, data: { summary: summary.trim() } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/wiki/:category/:id/extract-entities - 调用 GBrain 语义抽取实体并落库实体页
app.post('/api/wiki/:category/:id/extract-entities', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const { category, id } = req.params;
    if (!projects.CATEGORIES.includes(category)) return res.status(400).json({ success: false, error: '非法分类: ' + category });
    const cfg = (await callPython('ai/ai_config.py', ['get'])) || {};
    const gb = cfg.gbrain || {};
    if (!gb.endpoint) return res.status(400).json({ success: false, error: 'GBrain 未配置模型 endpoint，请到「系统设置」配置。' });
    let fp = null;
    for (const bdir of brainDirsFor(pid)) {
      const cand = path.join(bdir, category, id + '.md');
      if (fs.existsSync(cand)) { fp = cand; break; }
    }
    if (!fp) return res.status(404).json({ success: false, error: `Wiki 页面不存在（category=${category}, id=${id}）` });
    const content = readTextFile(fp);
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : id;
    let body = content.replace(/^---\n[\s\S]*?\n---/, '').trim();
    body = body.replace(/```mermaid[\s\S]*?```/g, '').trim();
    let raw;
    try {
      raw = await callOpenAI({
        endpoint: gb.endpoint, apiKey: gb.apiKey, model: gb.model,
        messages: [
          { role: 'system', content: '你是知识库实体抽取引擎。请从 PRD/需求文档中识别关键实体（概念、角色、模块、流程、规则、接口）。必须输出严格 JSON，不要解释、不要 Markdown 代码块。结构：{"entities":[{"name":"实体名称","type":"概念|角色|模块|流程|规则|接口","definition":"一句话定义","attributes":["属性"],"relations":[{"target":"关联实体名","type":"依赖|包含|触发|实现"}],"sourceSection":"出处章节"}]}。示例：输入"用户模块负责注册登录，订单流程包含支付" 输出 {"entities":[{"name":"用户模块","type":"模块","definition":"账号注册与登录","attributes":[],"relations":[],"sourceSection":"用户模块"},{"name":"订单流程","type":"流程","definition":"创建-支付-发货","attributes":[],"relations":[{"target":"支付接口","type":"依赖"}],"sourceSection":"订单流程"}]}。请基于真实文档抽取，输出 3 到 15 个最重要的实体，不要超过 15 个。只输出 JSON。' },
          { role: 'user', content: `文档标题：${title}\n\n文档内容：\n${body.slice(0, 8000)}` }
        ]
      });
    } catch (e) {
      console.error('[extract-entities] GBrain 调用失败：', e.message);
      return res.status(502).json({ success: false, error: 'GBrain 模型调用失败：' + e.message });
    }
    if (!raw) return res.status(502).json({ success: false, error: 'GBrain 未返回内容' });
    let json = raw.trim();
    try { fs.writeFileSync(path.join(__dirname, 'extract-debug.log'), 'RAW>>>\n' + raw + '\n<<<JSON\n' + json); } catch (e) {}
    const fence = json.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) json = fence[1].trim();
    let parsed;
    try { parsed = JSON.parse(json); } catch (e) {
      return res.status(502).json({ success: false, error: 'GBrain 返回的实体不是合法 JSON：' + raw.slice(0, 160) });
    }
    const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
    if (!entities.length) return res.json({ success: true, data: { count: 0, message: '未抽取到实体' } });
    const fv = (s) => JSON.stringify(String(s == null ? '' : s));
    const baseDir = path.dirname(fp);
    const entLinks = [];
    const entIds = [];
    for (const e of entities) {
      try {
        const name = String(e.name || '').trim();
        if (!name) continue;
        const eSlug = 'entity-' + id + '-' + name.replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
        entIds.push(eSlug);
        entLinks.push({ name, eSlug, type: String(e.type || '概念') });
        const attrs = Array.isArray(e.attributes) ? e.attributes : [];
        const attrMd = attrs.length ? '\n## 属性\n' + attrs.map(a => '- ' + a).join('\n') : '';
        const rels = Array.isArray(e.relations) ? e.relations : [];
        const relMd = rels.length ? '\n## 关联关系\n' + rels.map(r => '- ' + (r.target || '') + '（' + (r.type || '关联') + '）').join('\n') : '';
        const entContent = `---\ntitle: ${fv(name)}\ntype: entity\nsource: ${fv(id)}\nentityType: ${fv(e.type || '概念')}\nuploadedAt: ${fv(new Date().toISOString())}\n---\n\n# ${name}\n\n**类型**：${e.type || '概念'}\n\n## 定义\n\n${e.definition || ''}${attrMd}${relMd}\n\n## 出处\n\n> 来源文档：${title}（${e.sourceSection || '全文'}）\n`;
        fs.writeFileSync(path.join(baseDir, eSlug + '.md'), entContent, 'utf-8');
      } catch (e2) {
        try { fs.appendFileSync(path.join(__dirname, 'extract-err.log'), 'WRITE-ERR: ' + (e2 && e2.stack || e2) + '\n'); } catch (e3) {}
      }
    }
    const indexSlug = 'entity-index-' + id;
    const indexContent = `---\ntitle: ${fv(title + ' · 实体列表')}\ntype: entity-index\nsource: ${fv(id)}\nuploadedAt: ${fv(new Date().toISOString())}\n---\n\n# ${title} · 实体列表\n\n本文档由 GBrain 从源 PRD 自动抽取，共 ${entLinks.length} 个实体。\n\n## 实体清单\n\n` + entLinks.map(l => `- [[${l.eSlug}|${l.name}]]（${l.type}）`).join('\n') + '\n';
    fs.writeFileSync(path.join(baseDir, indexSlug + '.md'), indexContent, 'utf-8');
    res.json({ success: true, data: { count: entLinks.length, indexId: indexSlug, entityIds: entIds } });
  } catch (err) {
    try { fs.writeFileSync(path.join(__dirname, 'extract-err.log'), 'FATAL: ' + (err && err.stack || err) + '\n'); } catch (e) {}
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/kb-qa - 复用 GBrain 知识库做问答 / 推理验证
app.post('/api/kb-qa', async (req, res) => {
  try {
    const { question } = req.body || {};
    if (!question || !question.trim()) return res.status(400).json({ success: false, error: '请输入问题' });
    const pid = resolveProject(req);
    const brainDir = projects.resolveBrainDir(pid);
    const categories = ['project-wiki', 'quality-rules', 'defect-experience', 'test-cases'];
    const sources = kbRetrieve(question, brainDir, categories, 6);
    if (!sources.length) {
      return res.json({ success: true, data: { answer: '知识库中暂无可检索的相关内容，请先导入 PRD / 代码 / 缺陷等到 GBrain。', sources: [] } });
    }
    const cfg = (await callPython('ai/ai_config.py', ['get'])) || {};
    const gb = cfg.gbrain || {};
    const sysMsg = '你是企业知识库问答助手。请严格基于下方「参考资料」用中文回答用户问题，并在相关句末用 [n] 标注引用（n 对应资料序号）。资料不足时明确说明。使用 Markdown 结构输出。';
    const ctx = sources.map((s, i) => `[${i + 1}] 《${s.title}》(${s.category}/${s.id}.md)\n${s.snippet}`).join('\n\n');
    const messages = [
      { role: 'system', content: sysMsg },
      { role: 'user', content: `参考资料：\n${ctx}\n\n问题：${question}` }
    ];
    let answer = null;
    try {
      if (gb.endpoint) {
        answer = await callOpenAI({ endpoint: gb.endpoint, apiKey: gb.apiKey, model: gb.model, messages });
      }
      if (!answer) {
        const ai = cfg.ai || {};
        if (ai.provider === 'openai' && ai.endpoint) {
          answer = await callOpenAI({ endpoint: ai.endpoint, apiKey: ai.apiKey, model: ai.model, messages });
        }
      }
    } catch (e) {
      console.error('[kb-qa] LLM 调用失败：', e.message);
    }
    if (!answer) answer = '（未能调用 GBrain / AI 模型生成回答，请检查系统设置中的模型配置。已检索到以下相关素材可供参考。）';
    res.json({ success: true, data: { answer, sources: sources.map((s, i) => ({ ref: i + 1, category: s.category, id: s.id, title: s.title })) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/wiki-modules - 从项目描述 Wiki（PRD / 需求列表）抽取功能模块
// 优先级：需求列表(req-*) > PRD(prd-*)；两者皆无则 available=false（前端「按功能模块」标签页禁用）
app.get('/api/wiki-modules', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const brainDirs = brainDirsFor(pid);
    const pages = [];
    for (const bdir of brainDirs) {
      const catPath = path.join(bdir, 'project-wiki');
      if (!fs.existsSync(catPath)) continue;
      for (const file of fs.readdirSync(catPath).filter(f => f.endsWith('.md'))) {
        if (!/^(prd|req)-/.test(file)) continue;
        const content = readTextFile(path.join(catPath, file));
        const fm = content.match(/^---\n([\s\S]*?)\n---/);
        let uploadType = '';
        if (fm) { const mt = fm[1].match(/uploadType:\s*(\w+)/); if (mt) uploadType = mt[1]; }
        if (uploadType === 'prd' || uploadType === 'requirement') pages.push({ file, uploadType, content });
      }
    }
    let source = '';
    let chosen = pages.filter(p => p.uploadType === 'requirement');
    if (chosen.length) source = 'requirement';
    else { chosen = pages.filter(p => p.uploadType === 'prd'); if (chosen.length) source = 'prd'; }
    if (!source) return res.json({ success: true, data: { available: false, source: '', modules: [] } });

    const modules = [];
    const seen = new Set();
    const SKIP = /^(目录|修订记录|变更记录|概述|简介|前言|附录|参考|备注|1\s*概述|背景|目标)/;
    for (const p of chosen) {
      for (const line of p.content.split(/\r?\n/)) {
        const h = line.match(/^#{1,3}\s+(.+?)\s*$/);
        if (!h) continue;
        if (/^#\s/.test(line)) continue; // 跳过 H1 标题
        const label = h[1].trim();
        if (SKIP.test(label)) continue;
        const id = label.replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        modules.push({ id, label });
      }
    }
    res.json({ success: true, data: { available: true, source, modules } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/wiki/module-entities - 按功能模块精准召回 GBrain 抽取实体及其图谱关系
// 业务端「按功能模块」生成时，将选中模块关联的实体（定义/属性/关系）作为高优上下文，
// 而非依赖全库关键词检索的噪声召回。绑定锚点 = 实体正文的 sourceSection（PRD 章节）与模块标题重叠。
app.get('/api/wiki/module-entities', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const brainDirs = brainDirsFor(pid);
    let modules = [];
    try { modules = JSON.parse(req.query.modules || '[]'); } catch (_) {}
    if (!Array.isArray(modules) || !modules.length) {
      return res.json({ success: true, data: { entities: [], related: [] } });
    }

    const strip = (v) => String(v == null ? '' : v).trim().replace(/^"+|"+$/g, '');
    const norm = (s) => String(s || '').replace(/^\d+([.\d]*)\s*/, '').replace(/\s+/g, '');

    // 1) 收集全部 GBrain 实体页（排除 entity-index-* 索引页）
    const ents = [];
    const byName = new Map();
    for (const bdir of brainDirs) {
      const pw = path.join(bdir, 'project-wiki');
      if (!fs.existsSync(pw)) continue;
      for (const file of fs.readdirSync(pw).filter(f => f.startsWith('entity-') && f.endsWith('.md') && !f.startsWith('entity-index-'))) {
        const content = readTextFile(path.join(pw, file));
        const fm = parseFrontmatter(content) || {};
        if (fm.type !== 'entity') continue;
        const id = file.replace(/\.md$/, '');
        const titleM = content.match(/^#\s+(.+)$/m);
        const name = strip(fm.title) || (titleM ? titleM[1].trim() : id);
        const secM = content.match(/>\s*来源文档：[^\n]*?（(.+?)）/) || content.match(/sourceSection:\s*(.+)/);
        const sourceSection = secM ? secM[1].trim() : '';
        const defM = content.match(/##\s*定义\s*\n([\s\S]*?)(?=\n##\s|$)/);
        const definition = defM ? defM[1].replace(/^[-*]\s*/gm, '').trim().slice(0, 240) : '';
        const relM = content.match(/##\s*关联关系\s*\n([\s\S]*?)(?=\n##\s|$)/);
        const relations = [];
        if (relM) {
          for (const line of relM[1].split('\n')) {
            const m = line.match(/^[-*]\s*(.+?)\s*[（(](.+?)[）)]/);
            if (m) relations.push({ target: strip(m[1]), type: strip(m[2]) });
          }
        }
        const e = { id, name, type: strip(fm.entityType) || '概念', source: strip(fm.source) || '', sourceSection, definition, relations };
        ents.push(e);
        byName.set(name, e);
      }
    }
    if (!ents.length) return res.json({ success: true, data: { entities: [], related: [] } });

    // 2) CJK 字符重叠打分（处理模块标题与 sourceSection 的字面差异）
    const cjkSet = (s) => new Set([...String(s || '')].filter(c => /[一-鿿]/.test(c)));
    const overlap = (a, b) => {
      const sa = cjkSet(a), sb = cjkSet(b);
      if (!sa.size || !sb.size) return 0;
      let n = 0; sb.forEach(c => { if (sa.has(c)) n++; });
      return n / Math.max(sa.size, sb.size);
    };
    // 抽取标题/章节的「数字编号路径」（如 "2.2.2 AI知识加工层" → "2.2.2"），
    // 用于父章节(模块 2.2) → 子节实体(2.2.2) 的前缀匹配（功能模块是 H2/H3，实体 sourceSection 多为 H4 子节）
    const secNum = (s) => { const m = String(s || '').match(/^\s*(\d+(?:\.\d+)*)/); return m ? m[1] : ''; };
    const scoreOf = (mod) => (e) => {
      const nm = norm(mod), ns = norm(e.sourceSection), nn = norm(e.name), nd = norm(e.definition || '');
      let s = 0;
      const mn = secNum(mod), sn = secNum(e.sourceSection);
      if (mn && sn && (sn === mn || sn.startsWith(mn + '.') || mn.startsWith(sn + '.'))) s = Math.max(s, 90);
      if (ns && ns === nm) s = 100;
      else if (ns && (ns.includes(nm) || nm.includes(ns))) s = Math.max(s, 80);
      if (nn && (nn.includes(nm) || nm.includes(nn))) s = Math.max(s, 70);
      s = Math.max(s, overlap(nm, nn + nd) * 60);
      if (e.relations.some(r => { const rt = norm(r.target); return rt && (rt.includes(nm) || nm.includes(rt)); })) s = Math.max(s, 40);
      return s;
    };

    // 3) 每个模块取 top 实体（score>=20，最多 6 个）
    const merged = new Map();
    for (const mod of modules) {
      ents.map(e => ({ e, s: scoreOf(mod)(e) }))
        .filter(x => x.s >= 20)
        .sort((a, b) => b.s - a.s)
        .slice(0, 6)
        .forEach(({ e }) => merged.set(e.id, e));
    }

    // 4) 1 跳图谱扩展：把选中实体的关系对象也纳入（知识图谱邻域）
    const related = [];
    const relatedSeen = new Set();
    for (const e of merged.values()) {
      for (const r of e.relations) {
        const t = byName.get(r.target) || [...byName.values()].find(x => {
          const xn = norm(x.name), rn = norm(r.target);
          return xn && rn && (xn.includes(rn) || rn.includes(xn));
        });
        if (t && !merged.has(t.id) && !relatedSeen.has(t.id)) {
          relatedSeen.add(t.id);
          related.push({ ...t, via: e.name, relType: r.type });
        }
      }
    }

    res.json({ success: true, data: { entities: [...merged.values()], related } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------
// 模块 7: GBrain 页面管理
// ---------------------------------------------------------------

// Raw 溯源区（brains/<project>/<category>/raw/）为隔离存储：原始 PRD/需求等文档全文仅归档于此，
// 按安全约束不对外提供任何 API/MCP 读取，仅由服务端内部流程（如实体抽取 /api/extract-entities）直接读取。
// 故不注册 /api/brain/raw 路由——需要原始文档溯源请走受控内部流程，避免长文档经 API/MCP 返回导致泄密与模型输入超长。

// GET /api/brain/pages - 获取 Brain 页面列表
app.get('/api/brain/pages', async (req, res) => {
  try {
    const { category, limit = 100 } = req.query;
    const pid = resolveProject(req);
    // 读取项目私有库 + 共享库(合并去重)
    const brainDirs = brainDirsFor(pid);
    let pages = [];
    const categories = (category && category !== 'all') ? [category] : projects.CATEGORIES;
    const seen = new Set();

    for (const bdir of brainDirs) {
      for (const cat of categories) {
        const catPath = path.join(bdir, cat);
        if (!fs.existsSync(catPath)) continue;
        const files = fs.readdirSync(catPath).filter(f => f.endsWith('.md'));
        for (const file of files) {
          if (isRawPath(path.join(catPath, file))) continue; // 跳过隔离 raw 溯源区
          const key = `${cat}/${file}`;
          if (seen.has(key)) continue; // 共享库可能与私有库重复，私有优先
          seen.add(key);
          const filePath = path.join(catPath, file);
          const content = readTextFile(filePath);
          const fmMeta = parseFrontmatter(content);
          let pageTitle = file;
          if (fmMeta && fmMeta.title) pageTitle = fmMeta.title.replace(/^["']|["']$/g, '');
          else {
            const titleMatch = content.match(/^#\s+(.+)$/m);
            if (titleMatch) pageTitle = titleMatch[1];
          }
          pages.push({
            id: file.replace('.md', ''),
            title: pageTitle,
            category: cat,
            filename: file,
            repo: path.basename(bdir),
            frontmatter: fmMeta || null,
            preview: content.slice(0, 200)
          });
        }
      }
    }
    // 全局分页：去重后的总数受 limit 约束（默认 100，前端浏览传 1000 取全量）
    if (limit && pages.length > Number(limit)) pages = pages.slice(0, Number(limit));
    res.json({ success: true, data: pages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/brain/pages/:category/:id - 获取单个页面内容
app.get('/api/brain/pages/:category/:id', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const { category, id } = req.params;
    const brainDirs = brainDirsFor(pid);
    for (const bdir of brainDirs) {
      const filePath = path.join(bdir, category, `${id}.md`);
      if (isRawPath(filePath)) continue; // 跳过隔离 raw 溯源区
      if (fs.existsSync(filePath)) {
        const content = readTextFile(filePath);
        const fmMeta = parseFrontmatter(content) || {};
        const body = content.replace(/^---\s*\n([\s\S]*?)\n---\s*\n?/, '');
        const dt = fmMeta.title ? fmMeta.title.replace(/^["']|["']$/g, '') : (content.match(/^#\s+(.+)$/m) || [,''])[1];
        return res.json({ success: true, data: { id, category, title: dt, content, body, frontmatter: fmMeta, repo: path.basename(bdir) } });
      }
    }
    return res.status(404).json({ success: false, error: 'Page not found' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 各分类新增页面时对应的文档类型（frontmatter.type）
const BRAIN_CATEGORY_TYPE = {
  'quality-rules': 'quality_rule',
  'defect-experience': 'defect_experience',
  'project-wiki': 'project_wiki',
  'test-cases': 'test_case',
  'test-scripts': 'test_script'
};

// 生成带 frontmatter 的页面内容
function buildBrainPage(title, body, type) {
  const t = String(title).trim().replace(/"/g, '\\"');
  const tp = type || 'doc';
  const ts = new Date().toISOString().slice(0, 10);
  return `---\ntitle: "${t}"\ntype: ${tp}\nsource: manual\ncreated: ${ts}\nupdated: ${ts}\n---\n\n# ${t}\n\n${body || ''}`;
}

// 审计辅助（与现有 edit/promote 一致，失败仅告警不阻断）
function logBrainAudit(action, target, pid) {
  callPython('cache/draft_cache.py', [
    '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
    'log-audit', '--action', action, '--operator', 'web-ui',
    '--target', target, '--project', pid
  ]).catch((e) => console.error(`[audit] ${action} 审计失败(已忽略):`, e.message));
}

// POST /api/brain/pages - 新增单条知识库页面（人工维护/补充内容，直接写项目私有库）
app.post('/api/brain/pages', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const { category, title, content, type } = req.body || {};
    if (!category || !title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'category 与 title 必填' });
    }
    const dirs = brainDirsFor(pid);
    const bdir = dirs[0]; // 私有库优先
    const catDir = path.join(bdir, category);
    fs.mkdirSync(catDir, { recursive: true });
    const id = require('crypto').randomUUID();
    const tp = type || BRAIN_CATEGORY_TYPE[category] || 'doc';
    fs.writeFileSync(path.join(catDir, `${id}.md`), buildBrainPage(title, content, tp), 'utf-8');
    logBrainAudit('create_page', `${pid}:${category}/${id}`, pid);
    res.json({ success: true, data: { id, category, title: String(title).trim() } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/brain/pages/batch - 批量新增知识库页面（人工维护，直接写项目私有库）
// body: { category, entries: [{ title, content }], type? }
app.post('/api/brain/pages/batch', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const { category, entries, type } = req.body || {};
    if (!category || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ success: false, error: 'category 与 entries[] 必填且非空' });
    }
    const dirs = brainDirsFor(pid);
    const bdir = dirs[0];
    const catDir = path.join(bdir, category);
    fs.mkdirSync(catDir, { recursive: true });
    const tp = type || BRAIN_CATEGORY_TYPE[category] || 'doc';
    const created = [];
    for (const e of entries) {
      const t = (e.title || '').toString().trim();
      if (!t) continue;
      const id = require('crypto').randomUUID();
      fs.writeFileSync(path.join(catDir, `${id}.md`), buildBrainPage(t, e.content, tp), 'utf-8');
      created.push({ id, category, title: t });
    }
    logBrainAudit('batch_create_page', `${pid}:${category}/${created.length}`, pid);
    res.json({ success: true, data: { created: created.length, items: created } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



// PUT /api/brain/pages/:category/:id - 编辑知识库页面内容（人工修改已发布条目）
app.put('/api/brain/pages/:category/:id', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const { category, id } = req.params;
    const { content } = req.body || {};
    if (!projects.CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: '非法分类: ' + category });
    }
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return res.status(400).json({ success: false, error: '非法页面 ID' });
    }
    if (content === undefined || content === null) {
      return res.status(400).json({ success: false, error: 'content 不能为空' });
    }
    const brainDirs = brainDirsFor(pid);
    // 在原所在仓库（私有优先于共享）写回，保持 repo 不变
    let targetFile = null;
    for (const bdir of brainDirs) {
      const f = path.join(bdir, category, `${id}.md`);
      if (fs.existsSync(f)) { targetFile = f; break; }
    }
    if (!targetFile) {
      return res.status(404).json({ success: false, error: 'Page not found' });
    }
    fs.writeFileSync(targetFile, content, 'utf-8');
    // 记录审计日志（失败不阻断主流程）
    try {
      await callPython('cache/draft_cache.py', [
        '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
        'log-audit',
        '--action', 'edit',
        '--operator', 'web-ui',
        '--target', `${pid}:${category}/${id}.md`,
        '--detail', JSON.stringify({ size: Buffer.byteLength(content, 'utf-8') }),
        '--project', pid,
      ]);
    } catch (e) {
      console.error('[audit] edit 审计失败(已忽略):', e.message);
    }
    res.json({
      success: true,
      data: { category, id, repo: path.basename(path.dirname(path.dirname(targetFile))), size: Buffer.byteLength(content, 'utf-8') }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/brain/pages/:category/:id/propose-edit
// 人工编辑优化闭环（设计"链路 3a"）：编辑不直接写盘，而是生成两条草稿
//   A. 知识条目修改草稿(type=knowledge_edit)：确认入库后写回原仓库页面
//   B. 质量规则草稿(type=quality_rule)：由 old/new 对比自动提炼，进草稿箱待确认
app.post('/api/brain/pages/:category/:id/propose-edit', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const { category, id } = req.params;
    const { content, repo, category: bodyCategory } = req.body || {};
    const effectiveCategory = bodyCategory || category;
    if (!projects.CATEGORIES.includes(effectiveCategory)) {
      return res.status(400).json({ success: false, error: '非法分类: ' + effectiveCategory });
    }
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return res.status(400).json({ success: false, error: '非法页面 ID' });
    }
    if (content === undefined || content === null) {
      return res.status(400).json({ success: false, error: 'content 不能为空' });
    }
    const brainDirs = brainDirsFor(pid);
    // 定位原文件（私有优先于共享），读 old 内容与原 repo
    let targetFile = null;
    for (const bdir of brainDirs) {
      const f = path.join(bdir, category, `${id}.md`);
      if (fs.existsSync(f)) { targetFile = f; break; }
    }
    if (!targetFile) {
      return res.status(404).json({ success: false, error: 'Page not found' });
    }
    const oldContent = readTextFile(targetFile);
    const origRepo = repo || path.basename(path.dirname(path.dirname(targetFile)));

    // 1) 由 old/new 对比生成质量规则（优先 AI，失败回退确定性 diff）
    let ruleResult = { source: 'deterministic', content: '' };
    try {
      ruleResult = await callPython('skills/generate_quality_rule.py', [
        '--title', id,
        '--old', oldContent,
        '--new', content,
      ]);
    } catch (e) {
      console.error('[propose-edit] 质量规则生成失败(已忽略):', e.message);
    }
    const ruleContent = (ruleResult && ruleResult.content) ? ruleResult.content : '';

    // 2) 创建知识条目修改草稿（type=knowledge_edit）
    const editDraft = await callPython('cache/draft_cache.py', [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      'add',
      '--source', 'human_edit',
      '--type', 'knowledge_edit',
      '--title', id,
      '--content', content,
      '--metadata', JSON.stringify({ category: effectiveCategory, originalCategory: category, pageId: id, repo: origRepo, oldContent, hasRule: Boolean(ruleContent) }),
      '--project', pid,
    ]);
    // 3) 创建质量规则草稿（关联编辑草稿）
    let ruleDraft = null;
    if (ruleContent) {
      ruleDraft = await callPython('cache/draft_cache.py', [
        '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
        'add',
        '--source', 'human_edit',
        '--type', 'quality_rule',
        '--title', `质量规则: ${id}`,
        '--content', ruleContent,
        '--metadata', JSON.stringify({ fromEdit: { category: effectiveCategory, originalCategory: category, pageId: id, repo: origRepo }, editDraftId: editDraft.draftId, ruleSource: ruleResult.source }),
        '--project', pid,
      ]);
    }
    // 记录审计日志（失败不阻断主流程）
    try {
      await callPython('cache/draft_cache.py', [
        '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
        'log-audit',
        '--action', 'propose_edit',
        '--operator', 'web-ui',
        '--target', `${pid}:${category}/${id}.md`,
        '--detail', JSON.stringify({ editDraftId: editDraft.draftId, ruleDraftId: ruleDraft ? ruleDraft.draftId : null }),
        '--project', pid,
      ]);
    } catch (e) {
      console.error('[audit] propose_edit 审计失败(已忽略):', e.message);
    }

    res.json({
      success: true,
      data: {
        editDraftId: editDraft.draftId,
        ruleDraftId: ruleDraft ? ruleDraft.draftId : null,
        note: '已生成编辑草稿与质量规则草稿，请在草稿箱确认入库。知识条目修改将在确认后写回原仓库；质量规则将沉淀至质量规则库。'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/brain/private-pages - 列出项目私有知识库页面（不含共享库），供筛选晋升共享库
app.get('/api/brain/private-pages', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const brainDir = projects.resolveBrainDir(pid);
    const categories = projects.CATEGORIES;
    const pages = [];
    for (const cat of categories) {
      const catPath = path.join(brainDir, cat);
      if (!fs.existsSync(catPath)) continue;
      const files = fs.readdirSync(catPath).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(catPath, file);
        const stat = fs.statSync(filePath);
        const content = readTextFile(filePath);
        const titleMatch = content.match(/^#\s+(.+)$/m);
        pages.push({
          category: cat,
          filename: file,
          id: file.replace('.md', ''),
          path: `${cat}/${file}`,
          title: titleMatch ? titleMatch[1] : file,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
        });
      }
    }
    res.json({ success: true, data: { project: pid, pages } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/brain/promote - 将项目私有知识页面晋升到共享知识库
app.post('/api/brain/promote', async (req, res) => {
  try {
    const { project, pagePath, mode = 'copy' } = req.body || {};
    const pid = project || resolveProject(req);
    if (!pagePath || !String(pagePath).trim()) {
      return res.status(400).json({ success: false, error: '页面路径不能为空' });
    }
    const p = String(pagePath).replace(/\\/g, '/');
    if (p.includes('..')) {
      return res.status(400).json({ success: false, error: '非法路径: 不允许包含 ..' });
    }
    const parts = p.split('/').filter(Boolean);
    if (parts.length < 2) {
      return res.status(400).json({ success: false, error: 'pagePath 格式应为 <分类>/<文件名.md>' });
    }
    const [cat] = parts;
    if (!projects.CATEGORIES.includes(cat)) {
      return res.status(400).json({ success: false, error: '非法分类: ' + cat });
    }
    const brainDir = projects.resolveBrainDir(pid);
    const src = path.join(brainDir, p);
    if (!src.startsWith(brainDir) || !fs.existsSync(src) || !fs.statSync(src).isFile()) {
      return res.status(404).json({ success: false, error: '源页面不存在: ' + p });
    }
    const sharedDir = projects.resolveSharedDir();
    const dest = path.join(sharedDir, p);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    let action = 'promote_copy';
    if (mode === 'move') {
      fs.renameSync(src, dest);
      action = 'promote_move';
    } else {
      fs.copyFileSync(src, dest);
    }
    // 记录审计日志（失败不阻断主流程）
    try {
      await callPython('cache/draft_cache.py', [
        '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
        'log-audit',
        '--action', action,
        '--operator', 'web-ui',
        '--target', `${pid}:${p}`,
        '--detail', JSON.stringify({ project: pid, pagePath: p, mode }),
        '--project', pid,
      ]);
    } catch (auditErr) {
      console.error('[audit] promote 审计失败(已忽略):', auditErr.message);
    }
    res.json({ success: true, data: { project: pid, pagePath: p, mode, dest: dest.replace(/\\/g, '/') } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/brain/pages/:category/:id - 删除知识库单页（id 不含 .md）
app.delete('/api/brain/pages/:category/:id', async (req, res) => {
  try {
    const { category, id } = req.params;
    if (!projects.CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: '非法分类: ' + category });
    }
    const file = id.endsWith('.md') ? id : id + '.md';
    if (file.includes('..') || file.includes('/') || file.includes('\\')) {
      return res.status(400).json({ success: false, error: '非法文件名: ' + id });
    }
    const pid = resolveProject(req);
    const candidates = [
      path.join(projects.resolveBrainDir(pid), category),
      path.join(projects.resolveSharedDir(), category)
    ];
    let deletedPath = null;
    for (const dir of candidates) {
      const fp = path.join(dir, file);
      if (fp.startsWith(dir + path.sep) && fs.existsSync(fp)) {
        fs.unlinkSync(fp);
        deletedPath = fp.replace(/\\/g, '/');
        break;
      }
    }
    if (!deletedPath) {
      return res.status(404).json({ success: false, error: '页面不存在: ' + category + '/' + id });
    }
    try {
      await callPython('cache/draft_cache.py', [
        '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
        'log-audit', '--action', 'delete', '--operator', 'web-ui',
        '--target', pid + ':' + category + '/' + file,
        '--project', pid,
      ]);
    } catch (auditErr) {
      console.error('[audit] delete 审计失败(已忽略):', auditErr.message);
    }
    res.json({ success: true, data: { category, id, path: deletedPath } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/brain/pages - 批量删除知识库页面（body: { items: [{category,id}] }）
app.delete('/api/brain/pages', async (req, res) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ success: false, error: '缺少 items 参数' });
    }
    const pid = resolveProject(req);
    const deleted = [];
    for (const it of items) {
      const category = it.category;
      let id = String(it.id || '');
      if (!projects.CATEGORIES.includes(category)) continue;
      const file = id.endsWith('.md') ? id : id + '.md';
      if (file.includes('..') || file.includes('/') || file.includes('\\')) continue;
      const candidates = [
        path.join(projects.resolveBrainDir(pid), category),
        path.join(projects.resolveSharedDir(), category)
      ];
      for (const dir of candidates) {
        const fp = path.join(dir, file);
        if (fp.startsWith(dir + path.sep) && fs.existsSync(fp)) {
          fs.unlinkSync(fp);
          deleted.push({ category, id });
          break;
        }
      }
    }
    try {
      await callPython('cache/draft_cache.py', [
        '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
        'log-audit', '--action', 'batch_delete', '--operator', 'web-ui',
        '--target', pid + ':brain:' + deleted.length,
        '--project', pid,
      ]);
    } catch (auditErr) {
      console.error('[audit] batch_delete 审计失败(已忽略):', auditErr.message);
    }
    res.json({ success: true, data: { deleted, count: deleted.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------
// 模块 8: 图谱数据（解析 GBrain WikiLinks + 调用关系）
// ---------------------------------------------------------------

// GET /api/graph-data - 获取图谱节点和边数据
// ---------------------------------------------------------------
// 业务流程与依赖知识图谱 (Business Flow Graph)
// GET /api/business-graph - 返回业务步骤/依赖/场景，供网页渲染与业务前端生成用例时取上下文
// ---------------------------------------------------------------
app.get('/api/business-graph', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const brainRepo = projects.resolveBrainDir(pid);
    const p = path.join(brainRepo, 'project-wiki', 'business-flows.json');
    if (!fs.existsSync(p)) {
      return res.json({ success: true, data: null });
    }
    const data = JSON.parse(readTextFile(p));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/business-graph - 从 project-wiki 文档重新生成业务图谱（AI 优先，确定性骨架兜底）
// 像 api_graph_builder 那样由 server 经 callPython 调用 skills 模块；body.ai=false 可强制仅用确定性骨架。
app.post('/api/business-graph', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const brainRepo = projects.resolveBrainDir(pid);
    const useAi = !(req.body && req.body.ai === false);
    const args = ['generate', '--brain', brainRepo, useAi ? '--ai' : '--no-ai'];
    // 素材模式：将选定 Wiki 页面内容写入临时文件，交由 Python 仅基于这些素材生成。
    // body.sources: [{ id, title, content }]；为空/不存在则回退全量扫描 project-wiki。
    if (req.body && Array.isArray(req.body.sources) && req.body.sources.length) {
      const tmp = path.join(PROJECT_ROOT, 'data', `bg-sources-${Date.now()}.json`);
      fs.writeFileSync(tmp, JSON.stringify(req.body.sources), 'utf-8');
      args.push('--sources-file', tmp);
    }
    // callPython 已将 Python stdout 解析为 JSON 对象返回
    const out = await callPython('skills/business_graph_builder.py', args);
    res.json({ success: true, data: out });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/business-graph/modules - 返回 project-wiki 中可聚焦的模块清单（API / PRD / 需求 / 实体），供聚焦生成用
app.get('/api/business-graph/modules', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const brainRepo = projects.resolveBrainDir(pid);
    const pw = path.join(brainRepo, 'project-wiki');
    const out = [];
    if (fs.existsSync(pw)) {
      for (const fn of fs.readdirSync(pw).sort()) {
        if (!fn.endsWith('.md')) continue;
        const id = fn.slice(0, -3);
        if (id === 'business-flows') continue;
        let kind = 'other';
        if (fn.startsWith('api-')) kind = 'api';
        else if (fn.startsWith('prd-')) kind = 'prd';
        else if (fn.startsWith('req-')) kind = 'req';
        else if (fn.startsWith('entity-')) kind = 'entity';
        if (kind === 'other') continue; // 仅暴露可聚焦文档
        const text = readTextFile(path.join(pw, fn));
        const m = text.match(/^---\s*\n(?:.*\n)*?title:\s*(.+?)\s*\n/);
        out.push({ id, title: (m && m[1]) || id.replace(/^(api-|prd-|req-|entity-)/, ''), kind });
      }
    }
    res.json({ success: true, data: out });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/business-graph/plan - 规划业务场景种子（AI 优先，确定性兜底）
app.post('/api/business-graph/plan', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const brainRepo = projects.resolveBrainDir(pid);
    const useAi = !(req.body && req.body.ai === false);
    const args = ['plan', '--brain', brainRepo, useAi ? '--ai' : '--no-ai'];
    if (req.body && req.body.focus && Array.isArray(req.body.focus) && req.body.focus.length) {
      args.push('--focus', req.body.focus.join(','));
    }
    const out = await callPython('skills/business_graph_builder.py', args);
    res.json({ success: true, data: out });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/business-graph/scenario - 生成单个业务场景子图
app.post('/api/business-graph/scenario', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const brainRepo = projects.resolveBrainDir(pid);
    const useAi = !(req.body && req.body.ai === false);
    const scenario = req.body && req.body.scenario;
    if (!scenario) return res.status(400).json({ success: false, error: 'scenario required' });
    const tmp = path.join(PROJECT_ROOT, 'data', `bg-sc-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(scenario), 'utf-8');
    const args = ['scenario', '--brain', brainRepo, '--scenario-file', tmp, useAi ? '--ai' : '--no-ai'];
    const out = await callPython('skills/business_graph_builder.py', args);
    try { fs.unlinkSync(tmp); } catch (e) {}
    res.json({ success: true, data: out });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/business-graph/optimize - 合并多场景子图并入库（写 business-flows.json）
app.post('/api/business-graph/optimize', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const brainRepo = projects.resolveBrainDir(pid);
    const scenarios = (req.body && req.body.scenarios) || [];
    const tmp = path.join(PROJECT_ROOT, 'data', `bg-opt-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(scenarios), 'utf-8');
    const args = ['optimize', '--brain', brainRepo, '--scenarios-file', tmp, '--write'];
    const out = await callPython('skills/business_graph_builder.py', args);
    try { fs.unlinkSync(tmp); } catch (e) {}
    res.json({ success: true, data: out });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/graph-data', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const mode = (req.query.mode || 'api');
    const brainRepo = projects.resolveBrainDir(pid);
    const pwPath = path.join(brainRepo, 'project-wiki');
    if (!fs.existsSync(pwPath)) {
      return res.json({ success: true, data: { nodes: [], edges: [], mode } });
    }
    if (mode === 'entity') {
      return res.json({ success: true, data: buildEntityGraph(pwPath) });
    }

    const nodes = new Map();
    const edges = [];
    let edgeId = 0;

    // 内置函数黑名单（不应出现在图谱中）
    const BUILTINS = new Set([
      'print', 'open', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'tuple',
      'set', 'bool', 'type', 'id', 'input', 'max', 'min', 'sum', 'abs', 'round',
      'sorted', 'reversed', 'enumerate', 'zip', 'map', 'filter', 'any', 'all',
      'hex', 'oct', 'bin', 'chr', 'ord', 'pow', 'divmod', 'compile', 'eval', 'exec',
      'getattr', 'setattr', 'hasattr', 'delattr', 'isinstance', 'issubclass', 'callable',
      'format', 'repr', 'vars', 'locals', 'globals', 'next', 'iter', 'slice',
      'memoryview', 'bytearray', 'bytes', 'complex', 'frozenset', 'object', 'property',
      'staticmethod', 'classmethod', 'super', '__import__', 'ascii', 'breakpoint',
      'hash', 'help', 'dir', 'exit', 'quit'
    ]);

    function isBuiltin(name) {
      if (!name) return false;
      const base = name.split('.').pop();
      return BUILTINS.has(base);
    }

    // 1. 从 api-overview.md 提取模块节点和 WikiLinks
    const overviewPath = path.join(pwPath, 'api-overview.md');
    if (fs.existsSync(overviewPath)) {
      const overview = readTextFile(overviewPath);

      // 模块节点：[[api-xxx]]
      const wikiLinkRe = /\[\[(api-[\w-]+)\]\]/g;
      let m;
      while ((m = wikiLinkRe.exec(overview)) !== null) {
        const id = m[1];
        if (!nodes.has(id)) {
          nodes.set(id, { id, label: id.replace('api-', ''), type: 'module', module: id });
        }
      }

      // 相似关系：`A` ↔ `B` （相似度: x.xx）
      const similarRe = /- `([^`]+)` ↔ `([^`]+)` （相似度: ([\d.]+)）/g;
      while ((m = similarRe.exec(overview)) !== null) {
        const [_, a, b, sim] = m;
        if (isBuiltin(a) || isBuiltin(b)) continue;
        const aid = a.replace(/\./g, '_');
        const bid = b.replace(/\./g, '_');
        if (!nodes.has(aid)) nodes.set(aid, { id: aid, label: a, type: 'function', module: guessModule(a) });
        if (!nodes.has(bid)) nodes.set(bid, { id: bid, label: b, type: 'function', module: guessModule(b) });
        edges.push({ id: `e${edgeId++}`, source: aid, target: bid, type: 'similar', label: `sim:${sim}` });
      }
    }

    // 2. 从每个 api-*.md 提取函数节点和调用关系（排除总览文档）
    const files = fs.readdirSync(pwPath).filter(f => f.startsWith('api-') && f.endsWith('.md') && f !== 'api-overview.md');
    for (const file of files) {
      const content = fs.readFileSync(path.join(pwPath, file), 'utf-8');
      const moduleId = file.replace('.md', '');

      // 确保模块节点存在
      if (!nodes.has(moduleId)) {
        nodes.set(moduleId, { id: moduleId, label: moduleId.replace('api-', ''), type: 'module', module: moduleId });
      }

      // 接口列表：`- `module.func` → ...`
      const ifaceRe = /- `([\w.]+)`\s*→/g;
      while ((m = ifaceRe.exec(content)) !== null) {
        const fname = m[1];
        if (isBuiltin(fname)) continue;
        const fid = fname.replace(/\./g, '_');
        if (!nodes.has(fid)) {
          nodes.set(fid, { id: fid, label: fname, type: 'function', module: moduleId });
        }
        // 函数归属到模块（隐式边，不显示，用于布局分组）
      }

      // 调用关系：`- `A` → `B` （call / method_call）`
      const callRe = /- `([^`]+)` → `([^`]+)` （(\w+)）/g;
      while ((m = callRe.exec(content)) !== null) {
        const [_, a, b, ctype] = m;
        if (isBuiltin(a) || isBuiltin(b)) continue;
        const aid = a.replace(/\./g, '_');
        const bid = b.replace(/\./g, '_');
        if (!nodes.has(aid)) nodes.set(aid, { id: aid, label: a, type: 'function', module: guessModule(a, moduleId) });
        if (!nodes.has(bid)) nodes.set(bid, { id: bid, label: b, type: 'function', module: guessModule(b, moduleId) });
        // 去重边
        const dup = edges.find(e => e.source === aid && e.target === bid && e.type === 'call');
        if (!dup) {
          edges.push({ id: `e${edgeId++}`, source: aid, target: bid, type: 'call', label: ctype });
        }
      }
    }

    // 3. 模块之间的 WikiLink 边（从 overview 的模块列表）
    const moduleIds = Array.from(nodes.values()).filter(n => n.type === 'module').map(n => n.id);
    // 模块间如果存在跨模块调用，添加模块级边
    const moduleEdges = new Set();
    for (const e of edges) {
      if (e.type !== 'call') continue;
      const srcNode = nodes.get(e.source);
      const tgtNode = nodes.get(e.target);
      if (!srcNode || !tgtNode) continue;
      if (srcNode.module !== tgtNode.module && srcNode.module && tgtNode.module) {
        const key = `${srcNode.module}|${tgtNode.module}`;
        if (!moduleEdges.has(key)) {
          moduleEdges.add(key);
          edges.push({ id: `e${edgeId++}`, source: srcNode.module, target: tgtNode.module, type: 'module_call', label: 'calls' });
        }
      }
    }

    res.json({
      success: true,
      data: {
        nodes: Array.from(nodes.values()),
        edges: edges
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/wiki/api-deps - 解析 API 契约页面为结构化列表（供 Wiki 子页以列表方式展示，并关联图谱可视化）
app.get('/api/wiki/api-deps', async (req, res) => {
  try {
    const pid = resolveProject(req);
    const pwPath = path.join(projects.resolveBrainDir(pid), 'project-wiki');
    const result = { overview: null, modules: [] };
    if (!fs.existsSync(pwPath)) return res.json({ success: true, data: result });

    // 总览统计与模块列表
    const overviewPath = path.join(pwPath, 'api-overview.md');
    if (fs.existsSync(overviewPath)) {
      const ov = readTextFile(overviewPath);
      const stats = {};
      const statRe = /- \*\*(\d+)\*\* 个([接口定义|调用依赖关系|代码文件|相似接口]+)/g;
      let sm;
      while ((sm = statRe.exec(ov)) !== null) stats[sm[2]] = parseInt(sm[1], 10);
      const mods = [];
      const modRe = /\[\[([\w-]+)\]\]\s*—\s*([^\n]+)/g;
      while ((sm = modRe.exec(ov)) !== null) mods.push({ id: sm[1], title: sm[2].trim() });
      result.overview = { stats, modules: mods };
    }

    // 各模块契约
    const files = fs.readdirSync(pwPath).filter(f => f.startsWith('api-') && f.endsWith('.md') && f !== 'api-overview.md');
    for (const file of files) {
      const content = fs.readFileSync(path.join(pwPath, file), 'utf-8');
      const id = file.replace('.md', '');
      const fm = parseFrontmatter(content) || {};
      const moduleName = fm.module || id.replace(/^api-/, '');
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : id;
      const interfaces = [];
      const ifaceSec = matchSection(content, '接口列表');
      if (ifaceSec) {
        const re = /- `([^`]+)`(?:\s*→\s*(.+))?$/gm;
        let m;
        while ((m = re.exec(ifaceSec)) !== null) {
          let returns = (m[2] || '').replace(/`/g, '').trim();
          let params = '';
          const pm = returns.match(/^\(params:\s*(.*)\)$/);
          if (pm) { params = pm[1]; returns = ''; }
          interfaces.push({ name: m[1], returns, params });
        }
      }
      const calls = [];
      const callSec = matchSection(content, '调用关系');
      if (callSec) {
        const re = /- `([^`]+)`\s*→\s*`([^`]+)`\s*（([^）]+)）/g;
        let m;
        while ((m = re.exec(callSec)) !== null) {
          calls.push({ from: m[1], to: m[2], type: m[3] });
        }
      }
      result.modules.push({ id, title, module: moduleName, interfaces, calls });
    }
    result.modules.sort((a, b) => a.module.localeCompare(b.module));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\n/)) {
    const idx = line.indexOf(':');
    if (idx > 0) fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return fm;
}

function matchSection(content, heading) {
  const re = new RegExp('##?\\s+' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n([\\s\\S]*?)(?=\\n##\\s|\\n###\\s|$)', 'g');
  const m = re.exec(content);
  return m ? m[1] : '';
}

// 由 PRD/需求等 Wiki 文档构建「项目实体图谱」（确定性提取：标题为实体、同文档共现为关联、[[wikilink]] 为引用）
function buildEntityGraph(pwPath) {
  const nodes = new Map();
  const edges = [];
  let eid = 0;
  const files = fs.readdirSync(pwPath).filter(f => f.endsWith('.md') && !f.startsWith('api-'));
  const docEntities = {};
  const SKIP_HEAD = /^(目录|修订记录|变更记录|概述|简介|前言|附录|参考|备注|背景|目标|Timeline|Compiled Truth)$/;
  for (const file of files) {
    const content = fs.readFileSync(path.join(pwPath, file), 'utf-8');
    const fm = parseFrontmatter(content) || {};
    const docId = file.replace('.md', '');
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = fm.title || (titleMatch ? titleMatch[1].trim() : docId);
    nodes.set(docId, { id: docId, label: title, type: 'doc', uploadType: fm.uploadType || '' });
    const entities = [];
    const headRe = /^#{2,3}\s+(.+?)\s*$/gm;
    let h;
    while ((h = headRe.exec(content)) !== null) {
      const label = h[1].trim();
      if (SKIP_HEAD.test(label)) continue;
      const eNode = 'E:' + label;
      if (!nodes.has(eNode)) nodes.set(eNode, { id: eNode, label, type: 'entity' });
      edges.push({ id: `c${eid++}`, source: docId, target: eNode, type: 'contains' });
      entities.push(label);
    }
    const wlRe = /\[\[([\w-]+)\]\]/g;
    let w;
    while ((w = wlRe.exec(content)) !== null) {
      const target = w[1];
      if (nodes.has(target) && target !== docId) {
        edges.push({ id: `r${eid++}`, source: docId, target, type: 'ref' });
      }
    }
    docEntities[docId] = entities;
  }
  // 实体共现关系（同一文档出现的实体互连为「related」）
  const seenPairs = new Set();
  for (const ents of Object.values(docEntities)) {
    for (let i = 0; i < ents.length; i++) {
      for (let j = i + 1; j < ents.length; j++) {
        const a = 'E:' + ents[i], b = 'E:' + ents[j];
        const key = a < b ? a + '|' + b : b + '|' + a;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          edges.push({ id: `co${eid++}`, source: a, target: b, type: 'related' });
        }
      }
    }
  }
  return { nodes: Array.from(nodes.values()), edges, mode: 'entity' };
}

function guessModule(funcName, fallback) {
  if (!funcName) return fallback;
  const parts = funcName.split('.');
  if (parts.length >= 2) {
    return 'api-' + parts[0].replace(/_/g, '-');
  }
  return fallback || 'api-unknown';
}

// ---------------------------------------------------------------
// 统一 JSON 错误处理器（必须放在所有路由之后）
// 确保任何异常 / 解析错误（如请求体过大 413、JSON 解析失败等）返回 JSON
// 而非 HTML 错误页。否则前端 fetch().json() 解析 <!DOCTYPE ... 时会抛
// "Unexpected token '<', "<!DOCTYPE "... is not valid JSON"。
// ---------------------------------------------------------------
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  logger.error(err, { path: req.path || req.url, method: req.method });
  const status =
    err.status ||
    err.statusCode ||
    (typeof err.type === 'string' && err.type.startsWith('entity.') ? 413 : 500);
  const message = err.message || '服务器内部错误';
  res.status(status).json({ success: false, error: message });
});

// ---------------------------------------------------------------
// 启动服务器
// ---------------------------------------------------------------
// 进程级未捕获异常记录（不阻断原有行为，仅落盘便于事后诊断）
process.on('uncaughtException', (err) => {
  logger.error(err, { phase: 'uncaughtException' });
});
process.on('unhandledRejection', (reason) => {
  logger.error(reason instanceof Error ? reason : new Error(String(reason)), {
    phase: 'unhandledRejection',
  });
});

app.listen(PORT, () => {
  console.log(`KnowledgeOS API Server running on http://localhost:${PORT}`);
  console.log(`Web UI: http://localhost:${PORT}/index.html`);
  console.log(`API Docs: http://localhost:${PORT}/api/health`);
});
