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
    categories: ['quality-rules', 'defect-experience', 'project-wiki', 'test-cases'],
    projects: [{ id: 'default', name: '默认项目', brainPath: 'brain' }],
  };
}

const CATEGORIES = config.categories || ['quality-rules', 'defect-experience', 'project-wiki', 'test-cases'];

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

module.exports = {
  config,
  CATEGORIES,
  getProjects,
  getProject,
  getDefaultProject,
  resolveBrainDir,
  resolveSharedDir,
  resolveBrainDirs,
  resolveWriteDir,
  PROJECT_DIR,
};
