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
const iconv = require('iconv-lite');

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
app.put('/api/drafts/:id', async (req, res) => {
  try {
    const { title, content, type } = req.body;
    const args = [
      '--db', process.env.CACHE_DB_PATH || './cache/drafts.db',
      'update-draft',
      '--id', req.params.id,
    ];
    if (title !== undefined) args.push('--title', title);
    if (content !== undefined) args.push('--content', content);
    if (type !== undefined) args.push('--type', type);
    const result = await callPython('cache/draft_cache.py', args);
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
      let count = 0;
      for (const bdir of brainDirs) {
        const catPath = path.join(bdir, cat);
        if (fs.existsSync(catPath)) {
          count += fs.readdirSync(catPath).filter(f => f.endsWith('.md')).length;
        }
      }
      stats[cat] = { count };
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
    if (type === 'prd' || type === 'requirement') {
      let text;
      if (req.file) {
        text = readTextFile(req.file.path);
        try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      } else {
        text = req.body.content || '';
      }
      const brainDir = projects.resolveBrainDir(req.body.project || 'default');
      const catDir = path.join(brainDir, 'project-wiki');
      fs.mkdirSync(catDir, { recursive: true });
      const prefix = type === 'requirement' ? 'req' : 'prd';
      const fileBase = req.file ? path.basename(req.file.originalname, path.extname(req.file.originalname)) : '';
      const bodyName = req.body.filename ? String(req.body.filename).replace(/\.[^.]+$/, '') : '';
      const sourceFile = req.body.filename || (req.file ? req.file.originalname : '');
      // 中文文件名经 multipart 上传时可能被多层 UTF-8 误编码成 mojibake，入库前先局部还原
      const rawName = repairMixedMojibake(note || bodyName || fileBase || type);
      const safeSourceFile = repairMixedMojibake(sourceFile);
      const base = rawName.replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || type;
      // 唯一化 slug：同名文档重复上传不再相互覆盖，依次追加 -2 / -3 …
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

// GET /api/brain/raw - 读取 Raw 溯源区的原始文档
app.get('/api/brain/raw', async (req, res) => {
  try {
    const { project, category = 'project-wiki', file } = req.query;
    if (!file || /[\\/]?\.\./.test(file) || /[^A-Za-z0-9_.\-]/.test(file)) {
      return res.status(400).json({ success: false, error: 'invalid file' });
    }
    const brainDir = projects.resolveBrainDir(project || 'default');
    const rawDir = path.join(brainDir, category, 'raw');
    const filePath = path.resolve(rawDir, file);
    if (!filePath.startsWith(path.resolve(rawDir))) {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'not found' });
    }
    const raw = readTextFile(filePath);
    res.json({ success: true, data: { title: file, content: raw, sourceFile: '' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/brain/pages - 获取 Brain 页面列表
app.get('/api/brain/pages', async (req, res) => {
  try {
    const { category, limit = 100 } = req.query;
    const pid = resolveProject(req);
    // 读取项目私有库 + 共享库(合并去重)
    const brainDirs = brainDirsFor(pid);
    const pages = [];
    const categories = (category && category !== 'all') ? [category] : ['quality-rules', 'defect-experience', 'project-wiki', 'test-cases', 'test-scripts'];
    const seen = new Set();

    for (const bdir of brainDirs) {
      for (const cat of categories) {
        const catPath = path.join(bdir, cat);
        if (!fs.existsSync(catPath)) continue;
        const files = fs.readdirSync(catPath).filter(f => f.endsWith('.md'));
        for (const file of files.slice(0, Number(limit))) {
          const key = `${cat}/${file}`;
          if (seen.has(key)) continue; // 共享库可能与私有库重复，私有优先
          seen.add(key);
          const filePath = path.join(catPath, file);
          const content = readTextFile(filePath);
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
          pages.push({
            id: file.replace('.md', ''),
            title: titleMatch ? titleMatch[1] : file,
            category: cat,
            filename: file,
            repo: path.basename(bdir),
            frontmatter: frontmatterMatch ? frontmatterMatch[1] : '',
            preview: content.slice(0, 200)
          });
        }
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
    const pid = resolveProject(req);
    const { category, id } = req.params;
    const brainDirs = brainDirsFor(pid);
    for (const bdir of brainDirs) {
      const filePath = path.join(bdir, category, `${id}.md`);
      if (fs.existsSync(filePath)) {
        const content = readTextFile(filePath);
        return res.json({ success: true, data: { content, repo: path.basename(bdir) } });
      }
    }
    return res.status(404).json({ success: false, error: 'Page not found' });
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
    const { content, repo } = req.body || {};
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
      '--metadata', JSON.stringify({ category, pageId: id, repo: origRepo, oldContent, hasRule: Boolean(ruleContent) }),
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
        '--metadata', JSON.stringify({ fromEdit: { category, pageId: id, repo: origRepo }, editDraftId: editDraft.draftId, ruleSource: ruleResult.source }),
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
  const m = content.match(/^---\n([\s\S]*?)\n---/);
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
// 启动服务器
// ---------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`KnowledgeOS API Server running on http://localhost:${PORT}`);
  console.log(`Web UI: http://localhost:${PORT}/index.html`);
  console.log(`API Docs: http://localhost:${PORT}/api/health`);
});
