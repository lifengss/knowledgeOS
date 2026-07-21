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
const { spawn } = require('child_process');
const fs = require('fs');
const multer = require('multer');

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件：Web UI
app.use(express.static(path.join(PROJECT_ROOT, 'web')));

// ---------------------------------------------------------------
// 辅助函数：调用 Python Skill
// ---------------------------------------------------------------
function callPython(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const python = process.platform === 'win32' ? 'python' : 'python3';
    const proc = spawn(python, [path.join(PROJECT_ROOT, scriptPath), ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      shell: process.platform === 'win32'
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
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
app.get('/api/drafts', async (req, res) => {
  try {
    const { status, source, type, limit = 100, offset = 0 } = req.query;
    const result = await callPython('cache/draft_cache.py', [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      'list',
      '--limit', String(limit),
      '--offset', String(offset),
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
      '--metadata', JSON.stringify(metadata || {})
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

// POST /api/drafts/:id/commit - 单条入库
app.post('/api/drafts/:id/commit', async (req, res) => {
  try {
    const { skip_conflict_check, skip_quality_gate } = req.body;
    const result = await callPython('skills/single_commit.py', [
      req.params.id,
      '--db-path', process.env.CACHE_DB_PATH || './cache/drafts.db',
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
    const { skip_conflict_check, skip_quality_gate } = req.body;
    const result = await callPython('skills/batch_commit.py', [
      '--db-path', process.env.CACHE_DB_PATH || './cache/drafts.db',
      ...(skip_conflict_check ? ['--skip-conflict-check'] : []),
      ...(skip_quality_gate ? ['--skip-quality-gate'] : [])
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
    const result = await callPython('skills/conflict_detector.py', [
      '--db-path', process.env.CACHE_DB_PATH || './cache/drafts.db'
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

// ---------------------------------------------------------------
// 模块 3: 质量门控 (Quality Gate)
// ---------------------------------------------------------------

// POST /api/quality-gate/check - 质量检查
app.post('/api/quality-gate/check', async (req, res) => {
  try {
    const { draft_ids } = req.body;
    const args = ['--db-path', process.env.CACHE_DB_PATH || './cache/drafts.db'];
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
    const result = await callPython('cache/draft_cache.py', [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      'list-audit',
      '--page', String(page),
      '--page-size', String(pageSize),
      ...(action ? ['--action', action] : []),
      ...(operator ? ['--operator', operator] : []),
      ...(target ? ['--target', target] : []),
      ...(startTime ? ['--start-time', startTime] : []),
      ...(endTime ? ['--end-time', endTime] : [])
    ]);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/stats - 获取统计数据
app.get('/api/stats', async (req, res) => {
  try {
    const result = await callPython('cache/draft_cache.py', [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      'stats'
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
      '--limit', String(limit)
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
      '--limit', String(limit)
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

    if (req.file) {
      // 代码上传：zip/tar/7z 压缩包或单个代码文件，后端自动解压并解析
      const result = await callPython('skills/code_upload_parser.py', [
        '--input', req.file.path,
        '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
        '--brain', process.env.BRAIN_REPO || './brain',
        '--note', note
      ]);
      // 清理 multer 暂存的上传文件
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      res.json({ success: true, data: result });
    } else {
      const { content } = req.body;
      // 非代码类型：将上传内容作为草稿写入缓冲层
      const result = await callPython('cache/draft_cache.py', [
        '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
        'add',
        '--source', 'upload',
        '--type', type || 'quality_rule',
        '--title', note || `上传: ${type}`,
        '--content', content || '',
        '--metadata', JSON.stringify({ uploadType: type, note: note || '' })
      ]);
      res.json({ success: true, data: result });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------
// 模块 7: GBrain 页面管理
// ---------------------------------------------------------------

// GET /api/brain/pages - 获取 Brain 页面列表
app.get('/api/brain/pages', async (req, res) => {
  try {
    const { category, limit = 100 } = req.query;
    const brainRepo = process.env.BRAIN_REPO || './brain';
    // 读取 brain 目录下的 Markdown 文件
    const pages = [];
    const categories = category ? [category] : ['quality-rules', 'defect-experience', 'project-wiki', 'test-cases'];

    for (const cat of categories) {
      const catPath = path.join(brainRepo, cat);
      if (!fs.existsSync(catPath)) continue;
      const files = fs.readdirSync(catPath).filter(f => f.endsWith('.md'));
      for (const file of files.slice(0, Number(limit))) {
        const filePath = path.join(catPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        pages.push({
          id: file.replace('.md', ''),
          title: titleMatch ? titleMatch[1] : file,
          category: cat,
          filename: file,
          frontmatter: frontmatterMatch ? frontmatterMatch[1] : '',
          preview: content.slice(0, 200)
        });
      }
    }
    res.json({ success: true, data: pages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/brain/pages/:category/:id - 获取单个页面内容
app.get('/api/brain/pages/:category/:id', async (req, res) => {
  try {
    const brainRepo = process.env.BRAIN_REPO || './brain';
    const filePath = path.join(brainRepo, req.params.category, `${req.params.id}.md`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Page not found' });
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ success: true, data: { content } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------
// 模块 8: 图谱数据（解析 GBrain WikiLinks + 调用关系）
// ---------------------------------------------------------------

// GET /api/graph-data - 获取图谱节点和边数据
app.get('/api/graph-data', async (req, res) => {
  try {
    const brainRepo = process.env.BRAIN_REPO || './brain';
    const pwPath = path.join(brainRepo, 'project-wiki');
    if (!fs.existsSync(pwPath)) {
      return res.json({ success: true, data: { nodes: [], edges: [] } });
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
      const overview = fs.readFileSync(overviewPath, 'utf-8');

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

function guessModule(funcName, fallback) {
  if (!funcName) return fallback;
  const parts = funcName.split('.');
  if (parts.length >= 2) {
    return 'api-' + parts[0].replace(/_/g, '-');
  }
  return fallback || 'api-unknown';
}

// ---------------------------------------------------------------
// 启动服务器
// ---------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`KnowledgeOS API Server running on http://localhost:${PORT}`);
  console.log(`Web UI: http://localhost:${PORT}/index.html`);
  console.log(`API Docs: http://localhost:${PORT}/api/health`);
});
