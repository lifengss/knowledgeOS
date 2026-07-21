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

const app = express();
const PORT = process.env.REST_API_PORT || process.env.PORT || 3000;

// 项目根目录
const PROJECT_ROOT = path.resolve(__dirname, '..');

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
app.post('/api/source-upload', async (req, res) => {
  try {
    const { type, content, note } = req.body;
    // 将上传内容作为草稿写入缓冲层
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
// 启动服务器
// ---------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`KnowledgeOS API Server running on http://localhost:${PORT}`);
  console.log(`Web UI: http://localhost:${PORT}/index.html`);
  console.log(`API Docs: http://localhost:${PORT}/api/health`);
});
