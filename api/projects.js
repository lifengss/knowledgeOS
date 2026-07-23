/**
 * 多项目管理模块
 * =================
 * 加载 config/projects.json，提供项目解析能力：
 *  - 每个项目拥有独立的 Brain 仓库目录（知识库隔离）
 *  - sharedBrain 为跨项目共享知识库（quality-rules / defect-experience 等通用知识）
 *  - 草稿库（SQLite）通过 drafts 表的 project_id 列实现隔离
 */

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(PROJECT_DIR, 'config', 'projects.json');

let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
} catch (e) {
  // 兜底配置：单项目
  config = {
    defaultProject: 'default',
    sharedBrain: 'brains/_shared',
    categories: ['quality-rules', 'defect-experience', 'project-wiki', 'test-cases', 'test-scripts'],
    projects: [{ id: 'default', name: '默认项目', brainPath: 'brain' }],
  };
}

const CATEGORIES = config.categories || ['quality-rules', 'defect-experience', 'project-wiki', 'test-cases', 'test-scripts'];

function getProjects() {
  return config.projects;
}

function getProject(id) {
  return config.projects.find((p) => p.id === id) || config.projects[0];
}

function getDefaultProject() {
  return getProject(config.defaultProject);
}

/** 项目私有 Brain 目录绝对路径 */
function resolveBrainDir(pid) {
  const p = getProject(pid);
  return path.resolve(PROJECT_DIR, p.brainPath);
}

/** 共享 Brain 目录绝对路径 */
function resolveSharedDir() {
  return path.resolve(PROJECT_DIR, config.sharedBrain || 'brains/_shared');
}

/** 读取/搜索时的 Brain 目录列表：[项目私有, 共享]（共享对所有项目可见） */
function resolveBrainDirs(pid) {
  const dirs = [resolveBrainDir(pid)];
  if (config.sharedBrain) dirs.push(resolveSharedDir());
  return dirs;
}

/** 写入时的目录（仅项目私有，共享库由人工维护或显式写入共享区） */
function resolveWriteDir(pid, category) {
  return path.join(resolveBrainDir(pid), category);
}

/**
 * 运行时新建项目：
 *  - 校验 id（非空、合法字符、不重复）
 *  - 创建 brains/<id> 目录及分类子目录
 *  - 写回 config/projects.json 并同步内存 config
 */
function addProject({ id, name, description, brainPath }) {
  const pid = (id || '').trim();
  if (!pid) throw new Error('项目 ID 不能为空');
  if (!/^[A-Za-z0-9_-]+$/.test(pid)) {
    throw new Error('项目 ID 只能包含字母、数字、下划线(_)和连字符(-)');
  }
  if (config.projects.some((p) => p.id === pid)) {
    throw new Error('项目 ID 已存在: ' + pid);
  }
  const bp = (brainPath || `brains/${pid}`).trim();
  const base = path.resolve(PROJECT_DIR, bp);
  fs.mkdirSync(base, { recursive: true });
  for (const cat of (config.categories || [])) {
    fs.mkdirSync(path.join(base, cat), { recursive: true });
  }
  const entry = { id: pid, name: name || pid, description: description || '', brainPath: bp };
  config.projects.push(entry);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  return entry;
}

/**
 * 运行时删除项目：
 *  - 禁止删除默认项目（默认项目为兜底，不可移除）
 *  - 删除 config/projects.json 中的条目并写回
 *  - 删除该项目私有的 Brain 目录（brains/<id>），共享库不受影响
 * 返回被删除项目的条目。
 */
function removeProject(id) {
  const pid = (id || '').trim();
  if (!pid) throw new Error('项目 ID 不能为空');
  if (pid === config.defaultProject) {
    throw new Error('默认项目不可删除');
  }
  const idx = config.projects.findIndex((p) => p.id === pid);
  if (idx === -1) {
    throw new Error('项目不存在: ' + pid);
  }
  const entry = config.projects[idx];
  // 仅删除该项目私有 Brain 目录（在 PROJECT_DIR 之内的 brains/<id> 才允许删除）
  const base = path.resolve(PROJECT_DIR, entry.brainPath);
  if (base.startsWith(PROJECT_DIR) && fs.existsSync(base)) {
    fs.rmSync(base, { recursive: true, force: true });
  }
  config.projects.splice(idx, 1);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  return entry;
}

module.exports = {
  config,
  CATEGORIES,
  getProjects,
  getProject,
  getDefaultProject,
  addProject,
  removeProject,
  resolveBrainDir,
  resolveSharedDir,
  resolveBrainDirs,
  resolveWriteDir,
  PROJECT_DIR,
};
