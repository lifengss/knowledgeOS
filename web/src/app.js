/**
 * KnowledgeOS Web UI - 真实 API 版本
 * ================================
 * 从 mock 数据切换到真实 REST API 调用。
 * API 基地址: http://localhost:3000/api
 */

const API_BASE = 'http://localhost:3000/api';

// 当前选中的项目知识库（持久化到 localStorage，刷新后保留）
let currentProject = localStorage.getItem('kb_currentProject') || 'default';
let PROJECTS = [];             // 项目列表缓存（来自 /api/projects）
let DEFAULT_PROJECT = 'default';

// GET 请求自动附带 ?project=（若 URL 已显式指定则尊重原值）
function projectQuery(url) {
  if (url.includes('project=')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}project=${encodeURIComponent(currentProject)}`;
}
// POST body 自动附带 project（若 body 已显式指定则尊重原值，便于弹窗覆盖）
function projectBody(body) {
  if (body && body.project) return body;
  return { ...(body || {}), project: currentProject };
}
// 解析 /api/projects 返回，填充顶部与导入弹窗的项目下拉
async function loadProjects() {
  try {
    const res = await fetch(`${API_BASE}/projects`);
    const json = await res.json();
    if (!json.success) return;
    PROJECTS = json.data.projects || [];
    DEFAULT_PROJECT = json.data.defaultProject || 'default';
    if (PROJECTS.length && !PROJECTS.some((p) => p.id === currentProject)) {
      currentProject = DEFAULT_PROJECT;
    }
    const items = PROJECTS.length
      ? PROJECTS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')
      : `<option value="default">default</option>`;
    const topSel = document.getElementById('project-select');
    const importSel = document.getElementById('import-project');
    if (topSel) { topSel.innerHTML = items; topSel.value = currentProject; }
    if (importSel) { importSel.innerHTML = items; importSel.value = currentProject; }
    updateProjectLabel();
  } catch (e) {
    console.error('加载项目列表失败', e);
  }
}
// 更新顶部“当前项目”标签
function updateProjectLabel() {
  const label = document.getElementById('current-project-label');
  if (!label) return;
  const p = PROJECTS.find((x) => x.id === currentProject);
  label.textContent = p ? `· ${p.name}` : `· ${currentProject}`;
}
// 切换项目：重置图表缓存与分页，并重渲染当前页面 + 刷新角标
function onProjectChange(pid) {
  currentProject = pid;
  localStorage.setItem('kb_currentProject', pid);
  const importSel = document.getElementById('import-project');
  if (importSel) importSel.value = pid;
  // 图谱按项目隔离，切换时强制重新拉取
  graphState.nodes = [];
  graphState.dataCache = { api: null, entity: null };
  graphState.focusNode = null;
  // 分页回到第一页，避免沿用其他项目的页码
  pages = { drafts: 1, conflicts: 1, brain: 1 };
  // 知识库页面列表按项目缓存，切换项目必须清空，否则会停留在上一项目的页面
  // （详情接口会按新项目重新拉取，导致"Page not found"）
  appState.brainLoaded = false;
  appState.brainPages = [];
  appState.selectedBrain.clear();
  updateProjectLabel();
  renderPage(location.hash.slice(1) || 'overview');
  if (location.hash.slice(1) === 'wiki') loadWikiIndex();
  refreshBadges();
}
// 刷新草稿/冲突角标（跨页面保持与当前项目一致）
async function refreshBadges() {
  try {
    const d = await apiGet('/drafts?limit=1000');
    if (d.success) {
      const pending = d.data.filter(x => x.status === 'pending').length;
      const el = document.getElementById('draft-badge');
      if (el) el.textContent = pending;
    }
    const c = await apiGet('/conflicts');
    if (c.success) {
      const el = document.getElementById('conflict-badge');
      if (el) el.textContent = c.data.length;
    }
  } catch (e) { /* 忽略角标刷新异常 */ }
}

// 主题切换
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') {
    document.body.classList.add('light');
  }
  updateThemeIcon();
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  updateThemeIcon();
  if (location.hash === '#graph') {
    renderGraph();
  } else if (location.hash === '#bizflow') {
    initBizflow();
  }
}

function updateThemeIcon() {
  // 图标通过 CSS .icon-moon / .icon-sun 控制显示，无需 JS 操作
}

// 通用 API 请求封装（自动注入当前项目维度，见 projectQuery/projectBody）
async function apiGet(endpoint) {
  const res = await fetch(`${API_BASE}${projectQuery(endpoint)}`);
  return res.json();
}

async function apiPost(endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectBody(body))
  });
  return res.json();
}

// ---------- 全局非阻塞通知 / 进度系统 ----------
// 固定在右下角，不拦截页面其它操作；长耗时操作用 showProgress 展示不确定进度，
// 普通提示用 showToast（info/success/warning/error，自动消失）。
let _toastSeq = 0;
function ensureToastContainer() {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
}
function showToast({ message, type = 'info', duration = 3200 }) {
  const c = ensureToastContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '!' : 'ℹ';
  el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg"></span>`;
  el.querySelector('.toast-msg').textContent = message;
  c.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-show'));
  const remove = () => { el.classList.remove('toast-show'); setTimeout(() => el.remove(), 250); };
  if (duration > 0) setTimeout(remove, duration);
  el.addEventListener('click', remove);
}
function showProgress({ title = '处理中', message = '' }) {
  const c = ensureToastContainer();
  const el = document.createElement('div');
  el.className = 'toast toast-progress';
  el.innerHTML = '<span class="toast-spinner"></span><div class="toast-prog-body"><div class="toast-prog-title"></div><div class="toast-prog-msg"></div></div>';
  el.querySelector('.toast-prog-title').textContent = title;
  el.querySelector('.toast-prog-msg').textContent = message;
  c.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-show'));
  return {
    update(msg) { const m = el.querySelector('.toast-prog-msg'); if (m && msg != null) m.textContent = msg; },
    done(msg, type = 'success') {
      const body = el.querySelector('.toast-prog-body');
      if (body) body.innerHTML = `<div class="toast-prog-title">${type === 'success' ? '✓ ' : ''}${escapeHtml(title)}</div><div class="toast-prog-msg">${escapeHtml(msg || '')}</div>`;
      el.classList.remove('toast-progress'); el.classList.add('toast-' + type);
      const sp = el.querySelector('.toast-spinner'); if (sp) sp.remove();
      setTimeout(() => { el.classList.remove('toast-show'); setTimeout(() => el.remove(), 250); }, 3000);
    },
    fail(msg) { this.done(msg, 'error'); },
    remove() { el.classList.remove('toast-show'); setTimeout(() => el.remove(), 250); }
  };
}

async function apiPut(endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function apiUpload(endpoint, formData) {
  if (!formData.has('project')) formData.append('project', currentProject);
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    body: formData
  });
  return res.json();
}

async function apiDelete(endpoint, body) {
  const opts = { method: 'DELETE' };
  if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(projectBody(body));
  }
  const res = await fetch(`${API_BASE}${projectQuery(endpoint)}`, opts);
  return res.json();
}

// 通用分页控件：每页 20/30/50 条，支持前后翻页（默认 20 条/页）
// onPrev/onNext/onSizeChange 为内联事件 JS 表达式字符串
function pagerControls({ totalItems, size, page, onPrev, onNext, onSizeChange }) {
  const totalPages = Math.max(1, Math.ceil((totalItems || 0) / size));
  const sizeOptions = [20, 30, 50].map(s =>
    `<option value="${s}" ${s === size ? 'selected' : ''}>${s} 条/页</option>`
  ).join('');
  return `
    <div class="pager-bar">
      <label class="pager-size"><span>每页</span>
        <select onchange="${onSizeChange}">${sizeOptions}</select>
      </label>
      <div class="pager-nav">
        <span class="pager-info">第 ${page} / ${totalPages} 页 · 共 ${totalItems} 条</span>
        <button class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="${onPrev}">上一页</button>
        <button class="btn btn-secondary btn-sm" ${page >= totalPages ? 'disabled' : ''} onclick="${onNext}">下一页</button>
      </div>
    </div>`;
}

// 客户端列表翻页（drafts / conflicts / brain）
function changeListPage(scope, page) {
  appState.pager[scope].page = Math.max(1, page);
  renderPage(scope);
}
function changeListSize(scope, size) {
  const p = appState.pager[scope];
  p.size = parseInt(size, 10) || 20;
  p.page = 1;
  renderPage(scope);
}
// 审计日志每页条数切换（服务端分页）
function changeAuditSize(size) {
  appState.auditSize = parseInt(size, 10) || 20;
  appState.auditPage = 1;
  renderPage('audit');
}

// 状态管理
let appState = {
  drafts: [],
  conflicts: [],
  auditLogs: [],
  brainPages: [],
  brainLoaded: false,
  stats: {},
  loading: false,
  auditPage: 1,
  auditFilter: {},
  // 列表选中状态（session 级，跨翻页保留）
  selectedDrafts: new Set(),
  selectedBrain: new Set(),
  // 列表分页状态（客户端分页，默认每页 20 条）
  pager: {
    drafts: { page: 1, size: 20 },
    conflicts: { page: 1, size: 20 },
    brain: { page: 1, size: 20 }
  },
  auditSize: 20,
  brainFilter: { category: 'all', kw: '' },
  brainSort: { key: 'id', dir: 'asc' }
};

// ---------------------------------------------------------------
// 页面模板
// ---------------------------------------------------------------

const pageTemplates = {
  dashboard: async () => {
    try {
      const statsRes = await apiGet('/stats');
      const auditRes = await apiGet('/audit-log?limit=5');
      const stats = statsRes.success ? statsRes.data : {};
      const audit = auditRes.success ? (auditRes.data.items || []) : [];

      return `
        <div class="grid">
          <div class="card"><h3>知识库页面</h3><div class="value">${stats.totalPages || 0}</div></div>
          <div class="card"><h3>待审核草稿</h3><div class="value">${stats.pendingDrafts || 0}</div><div class="trend">需尽快处理</div></div>
          <div class="card"><h3>待处理冲突</h3><div class="value">${stats.totalConflicts || 0}</div><div class="trend">需人工决策</div></div>
          <div class="card"><h3>质量规则</h3><div class="value">${stats.totalRules || 0}</div></div>
          <div class="card"><h3>历史用例</h3><div class="value">${stats.totalCases || 0}</div></div>
          <div class="card"><h3>缺陷经验</h3><div class="value">${stats.totalDefects || 0}</div></div>
        </div>
        <div class="section" style="margin-top:24px;">
          <h3 class="section-title">最近操作</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>时间</th><th>操作</th><th>操作者</th><th>对象</th><th>详情</th></tr></thead>
              <tbody>
                ${audit.map(a => `
                  <tr><td>${a.created_at || '-'}</td><td>${actionLabel(a.action)}</td><td>${a.operator || 'system'}</td><td>${a.target || '-'}</td><td>${a.detail || '-'}</td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      return errorBox('加载概览数据失败: ' + err.message);
    }
  },

  brain: async () => {
    try {
      let pages;
      if (!appState.brainLoaded) {
        const res = await apiGet('/brain/pages?limit=1000');
        pages = res.success ? res.data : [];
        appState.brainLoaded = true;
      } else {
        pages = appState.brainPages || [];
      }
      appState.brainPages = pages;

      // 应用分类 + 关键词筛选
      const f = appState.brainFilter || { category: 'all', kw: '' };
      const kw = (f.kw || '').toLowerCase();
      const filtered = pages.filter(p => {
        if (f.category && f.category !== 'all' && p.category !== f.category) return false;
        if (kw && !(`${p.id} ${p.title} ${p.category} ${p.preview}`.toLowerCase().includes(kw))) return false;
        return true;
      });

      // 表头排序
      const sort = appState.brainSort;
      filtered.sort((a, b) => {
        let av = (a[sort.key] == null ? '' : String(a[sort.key])).toLowerCase();
        let bv = (b[sort.key] == null ? '' : String(b[sort.key])).toLowerCase();
        if (av < bv) return -1; if (av > bv) return 1; return 0;
      });
      if (sort.dir === 'desc') filtered.reverse();

      // 客户端分页
      const pager = appState.pager.brain;
      const totalPages = Math.max(1, Math.ceil(filtered.length / pager.size));
      if (pager.page > totalPages) pager.page = totalPages;
      const start = (pager.page - 1) * pager.size;
      const pageItems = filtered.slice(start, start + pager.size);
      const brainAllChecked = pageItems.length > 0 && pageItems.every(p => appState.selectedBrain.has(p.id));
      const brainSelCount = appState.selectedBrain.size;

      // 分类筛选下拉选项（基于当前全部页面去重）
      const cats = [...new Set(pages.map(p => p.category))].sort();
      const catOpts = ['<option value="all">全部</option>']
        .concat(cats.map(c => `<option value="${escapeHtml(c)}" ${f.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`))
        .join('');

      return `
        <div class="search-bar">
          <input type="text" id="brain-search" placeholder="搜索知识库页面..." value="${escapeHtml(f.kw || '')}" onkeydown="if(event.key==='Enter'){event.preventDefault();searchBrain();}">
          <button class="btn btn-primary btn-sm" onclick="searchBrain()">搜索</button>
          ${f.kw ? '<button class="btn btn-ghost btn-sm" onclick="clearBrainSearch()">清除</button>' : ''}
          <button class="btn btn-secondary btn-sm" onclick="openPromoteModal()">晋升共享库</button>
          <button class="btn btn-primary btn-sm" onclick="openCreatePageModal()">新增条目</button>
          <button class="btn btn-secondary btn-sm" onclick="openBatchCreateModal()">批量增加</button>
        </div>
        <div class="tabs">
          <div class="tab ${f.category === 'all' ? 'active' : ''}" onclick="filterBrain('all')">全部</div>
          <div class="tab ${f.category === 'quality-rules' ? 'active' : ''}" onclick="filterBrain('quality-rules')">质量规则</div>
          <div class="tab ${f.category === 'test-cases' ? 'active' : ''}" onclick="filterBrain('test-cases')">历史用例</div>
          <div class="tab ${f.category === 'test-scripts' ? 'active' : ''}" onclick="filterBrain('test-scripts')">自动化脚本</div>
          <div class="tab ${f.category === 'defect-experience' ? 'active' : ''}" onclick="filterBrain('defect-experience')">缺陷经验</div>
          <div class="tab ${f.category === 'project-wiki' ? 'active' : ''}" onclick="filterBrain('project-wiki')">项目 Wiki</div>
        </div>
        <div class="batch-bar">
          <button class="btn btn-danger btn-sm" onclick="batchDeleteBrain()" ${brainSelCount ? '' : 'disabled'}>批量删除${brainSelCount ? `(${brainSelCount})` : ''}</button>
          <button class="btn btn-primary btn-sm" onclick="openExportModal()" ${brainSelCount ? '' : 'disabled'}>导出${brainSelCount ? `(${brainSelCount})` : ''}</button>
          <span class="sel-count">已选 ${brainSelCount} 项</span>
          ${brainSelCount ? '<button class="btn btn-ghost btn-sm" onclick="clearSelection(\'brain\')">清空选择</button>' : ''}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th style="width:36px;"><input type="checkbox" ${brainAllChecked ? 'checked' : ''} onchange="toggleSelectAll('brain', this.checked)"></th><th class="sortable" onclick="sortBrain('id')">ID${sortIndicator('id')}</th><th class="sortable" onclick="sortBrain('title')">标题${sortIndicator('title')}</th><th class="sortable" onclick="sortBrain('category')">分类${sortIndicator('category')}<br><select class="col-filter" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()" onchange="filterBrain(this.value)">${catOpts}</select></th><th class="sortable" onclick="sortBrain('preview')">预览${sortIndicator('preview')}</th><th>操作</th></tr></thead>
            <tbody id="brain-table">
              ${pageItems.map(p => `
                <tr>
                  <td><input type="checkbox" class="row-check" ${appState.selectedBrain.has(p.id) ? 'checked' : ''} onchange="onRowCheck('brain','${p.id}',this.checked)"></td>
                  <td>${p.id}</td>
                  <td><a href="javascript:void(0)" onclick="showPageDetail('${p.category}', '${p.id}');return false;">${p.title}</a></td>
                  <td>${p.category}</td>
                  <td>${p.preview.slice(0, 60)}...</td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="editBrainPage('${p.category}', '${p.id}', ()=>refreshBrain())">编辑</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteBrainPage('${p.category}', '${p.id}')">删除</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${pagerControls({
          totalItems: filtered.length,
          size: pager.size,
          page: pager.page,
          onPrev: `changeListPage('brain', ${pager.page - 1})`,
          onNext: `changeListPage('brain', ${pager.page + 1})`,
          onSizeChange: `changeListSize('brain', this.value)`
        })}
      `;
    } catch (err) {
      return errorBox('加载知识库失败: ' + err.message);
    }
  },

  drafts: async () => {
    try {
      const res = await apiGet('/drafts?limit=1000');
      const drafts = res.success ? res.data : [];
      appState.drafts = drafts;

      // 仅显示待处理草稿，已完结（merged/discarded/rejected）的不再悬挂于草稿箱
      const visibleDrafts = drafts.filter(d => d.status !== 'merged' && d.status !== 'discarded' && d.status !== 'rejected');

      // 更新徽章
      const pendingCount = drafts.filter(d => d.status === 'pending').length;
      document.getElementById('draft-badge').textContent = pendingCount;

      // 客户端分页
      const pager = appState.pager.drafts;
      const totalPages = Math.max(1, Math.ceil(visibleDrafts.length / pager.size));
      if (pager.page > totalPages) pager.page = totalPages;
      const start = (pager.page - 1) * pager.size;
      const pageItems = visibleDrafts.slice(start, start + pager.size);
      const draftAllChecked = pageItems.length > 0 && pageItems.every(d => appState.selectedDrafts.has(d.id));
      const draftSelCount = appState.selectedDrafts.size;

      return `
        <div class="section">
          <h3 class="section-title">待入库草稿（${pendingCount}）</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th style="width:36px;"><input type="checkbox" ${draftAllChecked ? 'checked' : ''} onchange="toggleSelectAll('drafts', this.checked)"></th><th>ID</th><th>来源</th><th>类型</th><th>标题</th><th>评分</th><th>创建时间</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                ${pageItems.map(d => `
                  <tr>
                    <td><input type="checkbox" class="row-check" ${appState.selectedDrafts.has(d.id) ? 'checked' : ''} onchange="onRowCheck('drafts','${d.id}',this.checked)"></td>
                    <td>${d.id}</td>
                    <td>${d.source === 'human_edit' ? '人工编辑' : d.source === 'execution_feedback' ? '执行回流' : d.source}</td>
                    <td>${typeLabel(d.type)}</td>
                    <td><a href="#" onclick="showDraftDetail('${d.id}');return false;">${d.title}</a></td>
                    <td>${d.qualityScore !== null && d.qualityScore !== undefined ? `<span style="font-weight:600;color:${d.qualityScore >= 60 ? 'var(--success)' : d.qualityScore >= 40 ? 'var(--warning)' : 'var(--danger)'}">${d.qualityScore}</span>` : '-'}</td>
                    <td>${d.createdAt || '-'}</td>
                    <td><span class="tag tag-${d.status}">${d.status}</span></td>
                    <td>
                      <button class="btn btn-secondary btn-sm" onclick="editDraft('${d.id}', ()=>renderPage('drafts'))">编辑</button>
                      <button class="btn btn-primary btn-sm" onclick="commitDraft('${d.id}')">入库</button>
                      <button class="btn btn-secondary btn-sm" onclick="discardDraft('${d.id}')">丢弃</button>
                      <button class="btn btn-danger btn-sm" onclick="deleteDraft('${d.id}')">删除</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${pagerControls({
            totalItems: drafts.length,
            size: pager.size,
            page: pager.page,
            onPrev: `changeListPage('drafts', ${pager.page - 1})`,
            onNext: `changeListPage('drafts', ${pager.page + 1})`,
            onSizeChange: `changeListSize('drafts', this.value)`
          })}
        </div>
        <div class="section batch-bar">
          <button class="btn btn-primary" onclick="batchCommit()">批量确认入库${draftSelCount ? `(${draftSelCount})` : ''}</button>
          <button class="btn btn-danger" onclick="batchDeleteDrafts()" ${draftSelCount ? '' : 'disabled'}>批量删除${draftSelCount ? `(${draftSelCount})` : ''}</button>
          <button class="btn btn-secondary" onclick="detectConflicts()">触发冲突检测</button>
          <button class="btn btn-secondary" onclick="runQualityGate()">运行质量门控</button>
          <span class="sel-count">已选 ${draftSelCount} 项</span>
          ${draftSelCount ? '<button class="btn btn-ghost btn-sm" onclick="clearSelection(\'drafts\')">清空选择</button>' : ''}
        </div>
      `;
    } catch (err) {
      return errorBox('加载草稿失败: ' + err.message);
    }
  },

  conflicts: async () => {
    try {
      const res = await apiGet('/conflicts?limit=1000');
      const conflicts = res.success ? res.data : [];
      appState.conflicts = conflicts;

      // 更新徽章（未处理冲突数）
      const pendingCount = conflicts.filter(c => !c.resolution).length;
      document.getElementById('conflict-badge').textContent = pendingCount;

      // 客户端分页
      const pager = appState.pager.conflicts;
      const totalPages = Math.max(1, Math.ceil(conflicts.length / pager.size));
      if (pager.page > totalPages) pager.page = totalPages;
      const start = (pager.page - 1) * pager.size;
      const pageItems = conflicts.slice(start, start + pager.size);

      return `
        <div class="section">
          <h3 class="section-title">冲突队列（${conflicts.length}）</h3>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:10px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;">
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
              <input type="checkbox" class="conflict-select-all"> 全选本页
            </label>
            <span id="conflict-selected-count" style="color:var(--text-muted);font-size:13px;">已选 0 项</span>
            <span style="flex:1"></span>
            <button class="btn btn-primary btn-sm" onclick="resolveConflicts('merge')">批量合并</button>
            <button class="btn btn-secondary btn-sm" onclick="resolveConflicts('overwrite')">批量覆盖</button>
            <button class="btn btn-danger btn-sm" onclick="resolveConflicts('discard')">批量丢弃</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th style="width:36px;"><input type="checkbox" class="conflict-select-all"></th><th>ID</th><th>关联草稿</th><th>冲突类型</th><th>现有规则</th><th>新规则</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                ${pageItems.map(c => `
                  <tr>
                    <td><input type="checkbox" class="conflict-check" value="${c.id}" ${c.resolution ? 'disabled' : ''}></td>
                    <td><a href="#" onclick="showConflictDetail('${c.id}');return false;">${c.id?.slice(0,8)}</a></td>
                    <td><a href="#" onclick="showDraftDetail('${c.draftId}');return false;">${c.draftId?.slice(0,8)}</a></td>
                    <td><a href="#" onclick="showConflictDetail('${c.id}');return false;">${conflictTypeLabel(c.conflictType)}</a></td>
                    <td>${escapeHtml(c.existingRule?.slice(0,40) || '-')}</td>
                    <td>${escapeHtml(c.newRule?.slice(0,40) || '-')}</td>
                    <td><span class="tag tag-${c.resolution ? 'merged' : 'pending'}">${c.resolution ? '已处理' : '待处理'}</span></td>
                    <td>
                      ${!c.resolution ? `
                        <button class="btn btn-primary btn-sm" onclick="resolveConflict('${c.id}', 'merge')">合并</button>
                        <button class="btn btn-secondary btn-sm" onclick="resolveConflict('${c.id}', 'overwrite')">覆盖</button>
                        <button class="btn btn-danger btn-sm" onclick="resolveConflict('${c.id}', 'discard')">丢弃</button>
                      ` : '<span style="color:var(--text-muted);font-size:12px;">'+escapeHtml(c.resolution)+'</span>'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${pagerControls({
            totalItems: conflicts.length,
            size: pager.size,
            page: pager.page,
            onPrev: `changeListPage('conflicts', ${pager.page - 1})`,
            onNext: `changeListPage('conflicts', ${pager.page + 1})`,
            onSizeChange: `changeListSize('conflicts', this.value)`
          })}
        </div>
      `;
    } catch (err) {
      return errorBox('加载冲突失败: ' + err.message);
    }
  },

  graph: async () => {
    try {
      const apiActive = graphState.mode === 'api' ? 'active' : '';
      const entActive = graphState.mode === 'entity' ? 'active' : '';
      return `
        <div class="section">
          <h3 class="section-title">图谱可视化</h3>
          <div class="graph-mode-tabs">
            <button class="graph-mode-tab ${apiActive}" onclick="switchGraphMode('api')">API 依赖图谱</button>
            <button class="graph-mode-tab ${entActive}" onclick="switchGraphMode('entity')">项目实体图谱</button>
          </div>
          <div id="graph-controls" style="display:flex;gap:12px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">
            ${graphControlsHtml()}
          </div>
          <div id="graph-container" style="background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden;position:relative;height:600px;">
            <svg id="graph-svg" style="width:100%;height:100%;cursor:grab;"></svg>
            <div id="graph-tooltip" style="position:absolute;display:none;background:var(--card-solid);color:var(--text);padding:6px 12px;border-radius:8px;font-size:12px;pointer-events:none;z-index:10;border:1px solid var(--border);box-shadow:var(--shadow);font-weight:500;"></div>
          </div>
          <div id="graph-legend" style="display:flex;gap:16px;margin-top:10px;font-size:12px;color:var(--text-muted);">
            ${graphLegendHtml()}
          </div>
        </div>
      `;
    } catch (err) {
      return errorBox('加载图谱失败: ' + err.message);
    }
  },

  bizflow: async () => {
    return `
      <div class="section">
        <h3 class="section-title">业务流程与依赖知识图谱</h3>
        <p class="muted" style="margin-bottom:14px;">业务步骤节点、依赖关系与可测试场景的可视化。生成测试用例时可据此理解业务上下文与调用链路。</p>
        <div id="bizflow-toolbar" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
          <select id="bizflow-scenario" class="input" style="max-width:300px;" onchange="bizflowHighlightScenario(this.value)">
            <option value="">— 选择可测试场景高亮 —</option>
          </select>
          <input id="bizflow-search" class="input" style="max-width:220px;" placeholder="搜索步骤 id / 名称…" oninput="bizflowFilter(this.value)">
          <button class="btn btn-secondary btn-sm" onclick="bizflowReset()">重置视图</button>
          <span id="bizflow-status" class="muted" style="font-size:12px;"></span>
        </div>
        <div id="bizflow-container" style="position:relative;height:660px;background:radial-gradient(1200px 600px at 50% -10%, rgba(99,102,241,.10), transparent 60%), var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
          <svg id="bizflow-svg" style="width:100%;height:100%;cursor:grab;display:block;"></svg>
          <div id="bizflow-legend" style="position:absolute;left:14px;bottom:14px;display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);background:rgba(15,18,28,.6);backdrop-filter:blur(6px);border:1px solid var(--border);border-radius:10px;padding:10px 12px;max-height:240px;overflow:auto;"></div>
          <div id="bizflow-detail" style="position:absolute;right:14px;top:14px;width:330px;max-height:calc(100% - 28px);overflow:auto;background:rgba(15,18,28,.74);backdrop-filter:blur(10px);border:1px solid var(--border);border-radius:12px;padding:14px 16px;color:var(--text);display:none;box-shadow:var(--shadow);"></div>
          <div id="bizflow-tooltip" style="position:absolute;display:none;background:var(--card-solid);color:var(--text);padding:6px 10px;border-radius:8px;font-size:12px;pointer-events:none;z-index:20;border:1px solid var(--border);box-shadow:var(--shadow);font-weight:500;white-space:nowrap;"></div>
        </div>
      </div>
    `;
  },

  wiki: async () => {
    return `
      <div class="wiki-layout">
        <aside class="wiki-sidebar">
          <div class="wiki-sidebar-head">
            <strong>项目 Wiki</strong>
            <button class="btn btn-secondary btn-sm" onclick="loadWikiIndex()">刷新</button>
          </div>
          <div id="wiki-index" class="wiki-index"><div class="loading">加载中...</div></div>
        </aside>
        <main class="wiki-content" id="wiki-content">
          <div class="empty-state">从左侧索引选择 Wiki 页面查看内容</div>
        </main>
      </div>
    `;
  },

  settings: async () => {
    try {
      const res = await apiGet('/ai-settings');
      const cfg = res.success ? res.data : { ai: {}, gbrain: {} };
      const ai = cfg.ai || {};
      const gb = cfg.gbrain || {};
      const st = cfg.storage || {};
      const kbPath = st.knowledgeBasePath || '';
      const kroot = cfg.knowledgeRoot || '';
      const f = (id, val) => escapeHtml(val || '');
      return `
        <div class="section">
          <h3 class="section-title">系统设置</h3>
          <p style="color:var(--text-muted);margin-bottom:16px;">配置 AI 平台对接与 GBrain 大模型（用于 Wiki 摘要、实体抽取、目录生成等智能能力）。配置保存在服务端 <code>ai_config.json</code>。</p>
          <div class="settings-layout">
            <nav class="settings-nav">
              <a class="settings-nav-item active" data-target="settings-ai" onclick="settingsNavClick('settings-ai')">AI 平台对接</a>
              <a class="settings-nav-item" data-target="settings-gbrain" onclick="settingsNavClick('settings-gbrain')">GBrain 大模型</a>
              <a class="settings-nav-item" data-target="settings-storage" onclick="settingsNavClick('settings-storage')">知识库落库路径</a>
            </nav>
            <div class="settings-body">
              <section class="settings-section" id="settings-ai">
                <h4 class="settings-section-title">AI 平台对接</h4>
                <div class="card settings-card">
                  <label>Provider</label>
                  <select id="ai-provider" class="form-input">
                    <option value="none" ${ai.provider === 'none' ? 'selected' : ''}>none（不调用 AI）</option>
                    <option value="openai" ${ai.provider === 'openai' ? 'selected' : ''}>openai（纯自定义 endpoint）</option>
                    <option value="codebuddy" ${ai.provider === 'codebuddy' ? 'selected' : ''}>codebuddy（CodeBuddy 平台）</option>
                  </select>
                  <label class="checkbox-label">
                    <input type="checkbox" id="ai-useCustomModel" ${ai.useCustomModel ? 'checked' : ''}>
                    使用自定义模型 endpoint（CodeBuddy 平台 + 自有模型）
                  </label>
                  <label>Endpoint</label>
                  <input id="ai-endpoint" class="form-input" value="${f('ai-endpoint', ai.endpoint)}" placeholder="https://.../v1">
                  <label>API Key</label>
                  <input id="ai-apikey" class="form-input" type="password" value="${f('ai-apikey', ai.apiKey)}" placeholder="sk-...">
                  <label>Model</label>
                  <input id="ai-model" class="form-input" value="${f('ai-model', ai.model)}" placeholder="gpt-4o / claude-sonnet-4 / 自有模型ID">
                  <p class="hint" style="margin-top:8px;">两种对接方式：① 纯自定义 endpoint（Provider=openai，直接填 OpenAI 兼容地址）；② CodeBuddy 平台 + 自有模型（Provider=codebuddy 且勾选上方选项，需在项目 <code>.codebuddy/models.json</code> 注册自有模型 endpoint，由 CodeBuddy 路由）。</p>
                </div>
              </section>
              <section class="settings-section" id="settings-gbrain">
                <h4 class="settings-section-title">GBrain 大模型</h4>
                <div class="card settings-card">
                  <label>Provider</label>
                  <input id="gb-provider" class="form-input" value="${f('gb-provider', gb.provider)}" placeholder="openai / none">
                  <label>Endpoint</label>
                  <input id="gb-endpoint" class="form-input" value="${f('gb-endpoint', gb.endpoint)}" placeholder="https://.../v1">
                  <label>API Key</label>
                  <input id="gb-apikey" class="form-input" type="password" value="${f('gb-apikey', gb.apiKey)}" placeholder="sk-...">
                  <label>Model</label>
                  <input id="gb-model" class="form-input" value="${f('gb-model', gb.model)}" placeholder="gpt-4o-mini">
                  <p class="hint" style="margin-top:8px;">GBrain 大模型已在项目 Wiki「生成 AI 摘要」中实时调用，并作为知识问答 / 推理验证的回答引擎。也用于后续实体抽取、目录生成等智能增强。</p>
                </div>
              </section>
              <section class="settings-section" id="settings-storage">
                <h4 class="settings-section-title">知识库落库路径</h4>
                <div class="card settings-card">
                  <label>知识库根目录 (Knowledge Base Path)</label>
                  <input id="kb-path" class="form-input" value="${f('kb-path', kbPath)}" placeholder="例如 D:\\gbrain_home" style="margin-top:6px;">
                  <p class="hint" style="margin-top:8px;">该路径为知识库（GBrain）落库根目录。修改并保存后，GBrain 的 <code>.gbrain</code> 数据会自动迁移到 <code>&lt;本路径&gt;/.gbrain</code>，并同步更新系统环境变量 <code>GBRAIN_HOME</code>。KS 自身知识库位于 <code>${kroot}</code>（已在 D 盘、随项目固定，不随本项变更迁移）。</p>
                </div>
              </section>
              <div class="settings-actions">
                <button class="btn btn-primary" onclick="saveSettings()">保存设置</button>
                <span id="settings-msg"></span>
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      return errorBox('加载设置失败: ' + err.message);
    }
  },

  verify: () => `
    <div class="section kb-qa-section">
      <h3 class="section-title">知识问答 · 推理验证</h3>
      <p style="color:var(--text-muted);margin-bottom:16px;">直接复用 GBrain 知识库做问答与推理验证：输入问题，系统检索相关素材，由 GBrain 大模型生成带引用 [n] 的回答。对话上下文保留在本页。</p>
      <div class="kb-qa-box">
        <div class="kb-qa-messages" id="kb-qa-messages"></div>
        <div class="kb-qa-input">
          <textarea id="kb-qa-input" placeholder="向知识库提问…（Enter 发送，Shift+Enter 换行）" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendKbQA();}"></textarea>
          <button class="btn btn-primary" onclick="sendKbQA()">发送</button>
        </div>
      </div>
    </div>
  `,

  audit: async () => {
    try {
      const page = appState.auditPage || 1;
      const pageSize = appState.auditSize || 20;
      const filter = appState.auditFilter || {};
      let url = `/audit-log?page=${page}&pageSize=${pageSize}`;
      if (filter.action) url += `&action=${encodeURIComponent(filter.action)}`;
      if (filter.target) url += `&target=${encodeURIComponent(filter.target)}`;

      const res = await apiGet(url);
      const result = res.success ? res.data : { items: [], total: 0, page: 1, pageSize };
      const logs = result.items || [];
      const total = result.total || 0;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      return `
        <div class="section">
          <h3 class="section-title">审计日志（${total} 条）</h3>
          <div class="search-bar" style="margin-bottom:12px;">
            <select id="audit-action-filter" onchange="filterAudit()">
              <option value="">全部操作</option>
              <option value="commit" ${filter.action === 'commit' ? 'selected' : ''}>入库</option>
              <option value="conflict_detect" ${filter.action === 'conflict_detect' ? 'selected' : ''}>冲突检测</option>
              <option value="quality_gate" ${filter.action === 'quality_gate' ? 'selected' : ''}>质量门控</option>
              <option value="search" ${filter.action === 'search' ? 'selected' : ''}>检索</option>
              <option value="reject" ${filter.action === 'reject' ? 'selected' : ''}>拒绝</option>
            </select>
            <input type="text" id="audit-target-filter" placeholder="对象关键词" value="${escapeHtml(filter.target || '')}" oninput="filterAudit()">
            <button class="btn btn-secondary" onclick="resetAuditFilter()">重置</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>时间</th><th>操作</th><th>操作者</th><th>对象</th><th>详情</th></tr></thead>
              <tbody>
                ${logs.map(a => `
                  <tr>
                    <td>${a.created_at || '-'}</td>
                    <td><span class="tag tag-${a.action === 'commit' ? 'merged' : a.action === 'reject' ? 'danger' : 'pending'}">${actionLabel(a.action)}</span></td>
                    <td>${a.operator || 'system'}</td>
                    <td>${a.target || '-'}</td>
                    <td style="font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;">${a.detail ? escapeHtml(JSON.stringify(a.detail)) : '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${pagerControls({
            totalItems: total,
            size: pageSize,
            page: result.page || page,
            onPrev: `changeAuditPage(${page - 1})`,
            onNext: `changeAuditPage(${page + 1})`,
            onSizeChange: `changeAuditSize(this.value)`
          })}
        </div>
      `;
    } catch (err) {
      return errorBox('加载审计日志失败: ' + err.message);
    }
  },

  quality: async () => {
    try {
  const [draftsRes, statsRes, brainRes] = await Promise.all([
    apiGet('/drafts?limit=200'),
    apiGet('/stats'),
    apiGet('/brain/pages?limit=1000')
  ]);
  const drafts = draftsRes.success ? draftsRes.data : [];
  const stats = statsRes.success ? statsRes.data : {};
  const brainPages = brainRes.success ? brainRes.data : [];

      // 质量评分分布
      const scoreBuckets = { '0-39': 0, '40-59': 0, '60-79': 0, '80-100': 0 };
      drafts.forEach(d => {
        const s = d.qualityScore;
        if (s === null || s === undefined) return;
        if (s < 40) scoreBuckets['0-39']++;
        else if (s < 60) scoreBuckets['40-59']++;
        else if (s < 80) scoreBuckets['60-79']++;
        else scoreBuckets['80-100']++;
      });
      const maxBucket = Math.max(...Object.values(scoreBuckets)) || 1;
      const barHtml = Object.entries(scoreBuckets).map(([range, count]) => {
        const pct = Math.round((count / maxBucket) * 100);
        const color = range === '0-39' ? 'var(--danger)' : range === '40-59' ? 'var(--warning)' : range === '60-79' ? 'var(--primary)' : 'var(--success)';
        return `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="width:50px;font-size:12px;">${range}</span>
            <div style="flex:1;background:var(--bg-lighter);border-radius:4px;height:20px;overflow:hidden;">
              <div style="width:${pct}%;background:${color};height:100%;border-radius:4px;transition:width 0.5s;"></div>
            </div>
            <span style="width:30px;font-size:12px;text-align:right;">${count}</span>
          </div>
        `;
      }).join('');

      // 状态分布饼图（用 CSS conic-gradient）
      const statusCounts = {};
      drafts.forEach(d => { statusCounts[d.status] = (statusCounts[d.status] || 0) + 1; });
      const statusColors = { pending: '#ffaa00', approved: '#00d4ff', merged: '#00d68f', rejected: '#ff4757', discarded: '#8b9bb4', conflict: '#a78bfa', expired: '#5a6a82' };
      const totalDrafts = drafts.length || 1;
      let currentDeg = 0;
      const gradientStops = Object.entries(statusCounts).map(([st, count]) => {
        const deg = (count / totalDrafts) * 360;
        const stop = `${statusColors[st] || '#5a6a82'} ${currentDeg}deg ${currentDeg + deg}deg`;
        currentDeg += deg;
        return stop;
      }).join(', ');
      const pieLegend = Object.entries(statusCounts).map(([st, count]) => `
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${statusColors[st] || '#5a6a82'};"></span>
          <span>${st} (${count})</span>
        </div>
      `).join('');

      // 类型覆盖：与「知识库浏览」保持一致，按已发布 Brain 页面分类统计
      // （避免与草稿类型混淆，并修复 test_script / automation_script 等同义类型被拆成中英两条的问题）
      const catLabels = {
        'quality-rules': '质量规则',
        'defect-experience': '缺陷经验',
        'defect_rule': '缺陷规则',
        'project-wiki': '项目 Wiki',
        'test-cases': '测试用例',
        'test-scripts': '自动化脚本'
      };
      const catCounts = {};
      brainPages.forEach(p => { const c = p.category || 'other'; catCounts[c] = (catCounts[c] || 0) + 1; });
      const coverageHtml = Object.keys(catLabels).map(cat => `
        <div class="card" style="padding:14px;text-align:center;">
          <div style="font-size:24px;font-weight:600;color:var(--primary);">${catCounts[cat] || 0}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${catLabels[cat]}</div>
        </div>
      `).join('') || '<div class="empty">暂无数据</div>';

      return `
        <div class="section">
          <h3 class="section-title">质量评分分布</h3>
          <div class="card" style="max-width:480px;">
            ${barHtml}
          </div>
        </div>
        <div class="section">
          <h3 class="section-title">草稿状态分布</h3>
          <div style="display:flex;align-items:center;gap:24px;">
            <div style="width:140px;height:140px;border-radius:50%;background:conic-gradient(${gradientStops || 'var(--bg-lighter) 0deg 360deg'});"></div>
            <div style="display:flex;flex-direction:column;gap:6px;">${pieLegend}</div>
          </div>
        </div>
        <div class="section">
          <h3 class="section-title">类型覆盖</h3>
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));">${coverageHtml}</div>
        </div>
        <div class="section">
          <h3 class="section-title">关键指标</h3>
          <div class="grid">
            <div class="card"><h3>平均质量分</h3><div class="value">${stats.qualityScoreAvg || 0}</div></div>
            <div class="card"><h3>总草稿数</h3><div class="value">${stats.totalDrafts || 0}</div></div>
            <div class="card"><h3>已合并</h3><div class="value" style="color:var(--success);">${stats.mergedDrafts || 0}</div></div>
            <div class="card"><h3>已拒绝</h3><div class="value" style="color:var(--danger);">${stats.rejectedDrafts || 0}</div></div>
          </div>
        </div>
      `;
    } catch (err) {
      return errorBox('加载质量监控失败: ' + err.message);
    }
  },

  dashboardStats: async () => {
    try {
      const [statsRes, auditRes, brainRes] = await Promise.all([
        apiGet('/stats'),
        apiGet('/audit-log?pageSize=200'),
        apiGet('/brain/pages?limit=1000')
      ]);
      const s = statsRes.success ? statsRes.data : {};
      const auditItems = auditRes.success ? (auditRes.data.items || []) : [];
      const brainPages = brainRes.success ? brainRes.data : [];

      // 最近7天趋势（按日期聚合 commit 和 search）
      const dayMap = {};
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        dayMap[d.toISOString().slice(0, 10)] = { commit: 0, search: 0, conflict: 0 };
      }
      auditItems.forEach(a => {
        const day = (a.created_at || '').slice(0, 10);
        if (!dayMap[day]) return;
        if (a.action === 'commit') dayMap[day].commit++;
        else if (a.action === 'search') dayMap[day].search++;
        else if (a.action === 'conflict_detect') dayMap[day].conflict++;
      });
      const days = Object.keys(dayMap);
      const maxDayVal = Math.max(...days.map(d => Math.max(dayMap[d].commit, dayMap[d].search, dayMap[d].conflict))) || 1;
      const trendBars = days.map(day => {
        const cH = Math.round((dayMap[day].commit / maxDayVal) * 80);
        const sH = Math.round((dayMap[day].search / maxDayVal) * 80);
        const fH = Math.round((dayMap[day].conflict / maxDayVal) * 80);
        return `
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;">
            <div style="display:flex;align-items:flex-end;gap:2px;height:100px;">
              <div style="width:8px;background:var(--success);border-radius:2px;height:${cH}px;" title="入库 ${dayMap[day].commit}"></div>
              <div style="width:8px;background:var(--primary);border-radius:2px;height:${sH}px;" title="检索 ${dayMap[day].search}"></div>
              <div style="width:8px;background:var(--danger);border-radius:2px;height:${fH}px;" title="冲突 ${dayMap[day].conflict}"></div>
            </div>
            <span style="font-size:10px;color:var(--text-muted);">${day.slice(5)}</span>
          </div>
        `;
      }).join('');

      // Brain 页面分类统计（与知识库浏览一致，使用中文分类名）
      const brainCatLabels = {
        'quality-rules': '质量规则', 'defect-experience': '缺陷经验', 'defect_rule': '缺陷规则',
        'project-wiki': '项目 Wiki', 'test-cases': '测试用例', 'test-scripts': '自动化脚本'
      };
      const brainCats = {};
      brainPages.forEach(p => { brainCats[p.category] = (brainCats[p.category] || 0) + 1; });
      const brainStatHtml = Object.entries(brainCats).map(([cat, count]) => `
        <div class="card" style="padding:14px;text-align:center;">
          <div style="font-size:22px;font-weight:600;">${count}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${brainCatLabels[cat] || cat}</div>
        </div>
      `).join('');

      return `
        <div class="section">
          <h3 class="section-title">核心指标</h3>
          <div class="grid" style="margin-bottom:24px;">
            <div class="card"><h3>知识库页面</h3><div class="value">${s.totalPages || 0}</div><div class="trend">Brain 已入库</div></div>
            <div class="card"><h3>总入库数</h3><div class="value">${s.totalCommits || 0}</div><div class="trend">今日 +${s.todayCommits || 0}</div></div>
            <div class="card"><h3>本周入库</h3><div class="value">${s.weekCommits || 0}</div></div>
            <div class="card"><h3>草稿堆积</h3><div class="value">${s.pendingDrafts || 0}</div></div>
            <div class="card"><h3>待处理冲突</h3><div class="value">${s.totalConflicts || 0}</div></div>
            <div class="card"><h3>平均质量分</h3><div class="value">${s.qualityScoreAvg || 0}</div></div>
          </div>
        </div>
        <div class="section">
          <h3 class="section-title">最近7天操作趋势</h3>
          <div class="card" style="padding:16px;">
            <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:8px;">
              ${trendBars}
            </div>
            <div style="display:flex;gap:16px;justify-content:center;font-size:12px;color:var(--text-muted);">
              <span><span style="display:inline-block;width:8px;height:8px;background:var(--success);border-radius:2px;margin-right:4px;"></span>入库</span>
              <span><span style="display:inline-block;width:8px;height:8px;background:var(--primary);border-radius:2px;margin-right:4px;"></span>检索</span>
              <span><span style="display:inline-block;width:8px;height:8px;background:var(--danger);border-radius:2px;margin-right:4px;"></span>冲突检测</span>
            </div>
          </div>
        </div>
        <div class="section">
          <h3 class="section-title">Brain 页面分类</h3>
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));">${brainStatHtml}</div>
        </div>
        <div class="section">
          <h3 class="section-title">草稿状态汇总</h3>
          <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:16px;">
            <div class="card" style="padding:16px;"><h3>总草稿</h3><div class="value" style="font-size:28px;">${s.totalDrafts || 0}</div></div>
            <div class="card" style="padding:16px;"><h3>已合并</h3><div class="value" style="font-size:28px;color:var(--success)">${s.mergedDrafts || 0}</div></div>
            <div class="card" style="padding:16px;"><h3>已拒绝</h3><div class="value" style="font-size:28px;color:var(--danger)">${s.rejectedDrafts || 0}</div></div>
            <div class="card" style="padding:16px;"><h3>冲突中</h3><div class="value" style="font-size:28px;color:var(--warning)">${s.conflictDrafts || 0}</div></div>
          </div>
        </div>
      `;
    } catch (err) {
      return errorBox('加载统计失败: ' + err.message);
    }
  },
  apidocs: () => window.renderApiDocs(),
  tutorial: async () => {
    try {
      const res = await fetch('/tutorial/manifest.json?t=' + Date.now());
      if (!res.ok) throw new Error('教程清单加载失败 (' + res.status + ')');
      const manifest = await res.json();
      let sysVer = '';
      try { const h = await apiGet('/health'); sysVer = h.version || ''; } catch (e) {}
      const tv = manifest.tutorialVersion || '?';
      const sv = manifest.systemVersion || '';
      let banner = '';
      if (sysVer && sv && sysVer !== sv) {
        banner = '<div class="tut-banner">⚠ 系统当前版本为 V' + sysVer + '，本教程基于 V' + sv + '，部分内容可能待复核与更新。</div>';
      }
      const chList = (manifest.chapters || []).map(c =>
        '<div class="tut-ch" data-file="' + escapeHtml(c.file) + '" onclick="tutorialLoadChapter(\'' + c.file + '\')">' +
          '<div class="tut-ch-title">' + escapeHtml(c.title) + '</div>' +
          '<div class="tut-ch-sum">' + escapeHtml(c.summary || '') + '</div>' +
        '</div>'
      ).join('');
      return '<div class="tut-wrap">' +
        '<aside class="tut-side">' +
          '<div class="tut-side-head"><span class="tut-ver">教程 V' + tv + '</span><span class="tut-sys">系统 V' + sv + '</span></div>' +
          chList +
        '</aside>' +
        '<section class="tut-main">' + banner + '<div id="tut-content"><div class="loading">正在加载教程…</div></div></section>' +
      '</div>';
    } catch (e) {
      return errorBox('加载教程失败: ' + e.message);
    }
  }
};

const titles = {
  apidocs: '接口文档',
  dashboard: '概览',
  brain: '知识库浏览',
  wiki: '项目 Wiki',
  drafts: '草稿审核',
  conflicts: '冲突处理',
  graph: '图谱可视化',
  verify: '知识问答',
  audit: '审计日志',
  quality: '质量监控',
  dashboardStats: '审计大盘',
  settings: '系统设置',
  tutorial: '使用教程'
};

// ---------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------

function typeLabel(type) {
  const map = {
    'quality_rule': '质量规则',
    'defect_experience': '缺陷经验',
    'test_case': '测试用例',
    'test_script': '自动化脚本',
    'project_wiki': '项目 Wiki',
    'knowledge_edit': '知识编辑'
  };
  return map[type] || type;
}

function actionLabel(action) {
  const map = {
    generate: '生成用例',
    edit: '编辑草稿',
    commit: '正式入库',
    conflict_detect: '冲突检测',
    quality_check: '质量检查',
    search: '检索查询',
    reject: '拒绝入库'
  };
  return map[action] || action;
}

function conflictTypeLabel(type) {
  const map = { duplicate: '重复', contradiction: '矛盾', overlap: '重叠' };
  return map[type] || type;
}

function errorBox(msg) {
  return `<div class="error-box">${msg}</div>`;
}

function successBox(msg) {
  return `<div class="success-box">${msg}</div>`;
}

function showResultModal(title, htmlBody) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:640px;">
      <div class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">关闭</button>
      </div>
      <div class="modal-body" style="max-height:60vh;overflow:auto;">
        ${htmlBody}
      </div>
      <div class="modal-footer" style="display:flex;justify-content:flex-end;padding-top:12px;border-top:1px solid var(--border);">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// ---------------------------------------------------------------
// 页面渲染
// ---------------------------------------------------------------

async function renderPage(page) {
  const contentEl = document.getElementById('content');
  const titleEl = document.getElementById('page-title');

  titleEl.textContent = titles[page] || page;
  contentEl.innerHTML = '<div class="loading">加载中...</div>';

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');

  if (pageTemplates[page]) {
    try {
      const html = await pageTemplates[page]();
      contentEl.innerHTML = html;
      // graph 页面渲染后自动初始化力导向图；wiki 页面渲染后加载索引
      if (page === 'graph') {
        setTimeout(() => renderGraph(), 50);
      } else if (page === 'bizflow') {
        setTimeout(() => initBizflow(), 50);
      } else if (page === 'wiki') {
        setTimeout(() => loadWikiIndex(), 50);
      } else if (page === 'verify') {
        setTimeout(() => renderVerify(), 50);
      } else if (page === 'tutorial') {
        setTimeout(() => tutorialAutoLoad(), 60);
      }
    } catch (err) {
      contentEl.innerHTML = errorBox('页面渲染失败: ' + err.message);
    }
  } else {
    contentEl.innerHTML = '<div class="empty-state">页面建设中</div>';
  }
}

// ---------------------------------------------------------------
// 交互操作
// ---------------------------------------------------------------

async function commitDraft(id) {
  if (!confirm(`确定入库草稿 ${id} 吗？`)) return;
  try {
    const res = await apiPost(`/drafts/${id}/commit`, {});
    if (res.success && res.data?.success) {
      const d = res.data;
      showResultModal('入库成功', `
        <div class="grid" style="grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:12px;">
          <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">草稿ID</small><div style="font-size:12px;word-break:break-all;">${d.draftId}</div></div>
          <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">Brain页面</small><div style="font-size:12px;word-break:break-all;">${d.committedPage}</div></div>
          <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">质量评分</small><div>${d.score ?? '-'}</div></div>
          <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">冲突ID</small><div>${d.conflictId ?? '无'}</div></div>
        </div>
      `);
    } else {
      alert(`入库失败: ${res.data?.reason || res.error || '未知错误'}`);
    }
    renderPage('drafts');
  } catch (err) {
    alert('入库失败: ' + err.message);
  }
}

async function discardDraft(id) {
  if (!confirm(`确定丢弃草稿 ${id} 吗？`)) return;
  try {
    const res = await apiPut(`/drafts/${id}/status`, { status: 'discarded' });
    alert(res.success ? `草稿 ${id} 已丢弃` : `丢弃失败: ${res.error}`);
    renderPage('drafts');
  } catch (err) {
    alert('丢弃失败: ' + err.message);
  }
}

// ---------------------------------------------------------------
// 列表多选 / 删除
// ---------------------------------------------------------------

function onRowCheck(scope, id, checked) {
  const set = scope === 'drafts' ? appState.selectedDrafts : appState.selectedBrain;
  if (checked) set.add(id); else set.delete(id);
  renderPage(scope);
}

function toggleSelectAll(scope, checked) {
  const set = scope === 'drafts' ? appState.selectedDrafts : appState.selectedBrain;
  const items = scope === 'drafts' ? appState.drafts : appState.brainPages;
  if (checked) items.forEach(it => set.add(it.id)); else set.clear();
  renderPage(scope);
}

function clearSelection(scope) {
  if (scope === 'drafts') appState.selectedDrafts.clear();
  else if (scope === 'brain') appState.selectedBrain.clear();
  renderPage(scope);
}

async function deleteDraft(id) {
  if (!confirm(`确定删除草稿 ${id} 吗？此操作不可恢复。`)) return;
  try {
    const res = await apiDelete(`/drafts/${id}`);
    if (res.success) {
      appState.selectedDrafts.delete(id);
    } else {
      alert(`删除失败: ${res.error}`);
    }
    renderPage('drafts');
  } catch (err) {
    alert('删除失败: ' + err.message);
  }
}

async function batchDeleteDrafts() {
  const ids = [...appState.selectedDrafts];
  if (!ids.length) return;
  if (!confirm(`确定删除选中的 ${ids.length} 条草稿吗？此操作不可恢复。`)) return;
  try {
    const res = await apiDelete('/drafts', { ids });
    if (res.success) {
      appState.selectedDrafts.clear();
    } else {
      alert(`删除失败: ${res.error}`);
    }
    renderPage('drafts');
  } catch (err) {
    alert('删除失败: ' + err.message);
  }
}

async function deleteBrainPage(category, id) {
  if (!confirm(`确定删除知识库页面 ${category}/${id} 吗？此操作不可恢复。`)) return;
  try {
    const res = await apiDelete(`/brain/pages/${category}/${id}`);
    if (res.success) {
      appState.selectedBrain.delete(id);
    } else {
      alert(`删除失败: ${res.error}`);
    }
    refreshBrain();
  } catch (err) {
    alert('删除失败: ' + err.message);
  }
}

async function batchDeleteBrain() {
  const byId = Object.fromEntries(appState.brainPages.map(p => [p.id, p.category]));
  const items = [...appState.selectedBrain]
    .map(id => ({ category: byId[id], id }))
    .filter(it => it.category);
  if (!items.length) return;
  if (!confirm(`确定删除选中的 ${items.length} 条知识库页面吗？此操作不可恢复。`)) return;
  try {
    const res = await apiDelete('/brain/pages', { items });
    if (res.success) {
      appState.selectedBrain.clear();
    } else {
      alert(`删除失败: ${res.error}`);
    }
    refreshBrain();
  } catch (err) {
    alert('删除失败: ' + err.message);
  }
}

// ===== 知识库页面导出 =====
// 导出格式：jira(Jira+Xray 兼容 CSV，推荐) / markdown(合并) / csv(通用) / excel(.xls)
function tsStamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

// 取回选中条目的完整正文（复用已有详情接口 /api/brain/pages/:category/:id）
async function fetchSelectedBrainPages() {
  const sel = appState.selectedBrain;
  const matched = appState.brainPages.filter(p => sel.has(p.id));
  const rows = [];
  for (const p of matched) {
    let body = p.body || p.preview || '';
    try {
      const res = await apiGet(`/brain/pages/${encodeURIComponent(p.category)}/${encodeURIComponent(p.id)}`);
      if (res && res.success && res.data) body = res.data.body || res.data.content || body;
    } catch (e) { /* 回退到列表 preview */ }
    rows.push({ id: p.id, title: p.title || p.id, category: p.category, preview: p.preview || '', body: body });
  }
  return rows;
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// CSV 单元格转义（引号/逗号/换行），并优先加 UTF-8 BOM 便于 Excel 识别中文
function csvEscape(v) {
  const s = (v == null ? '' : String(v));
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// 从 Markdown 正文尝试提取测试步骤，输出 Xray Manual Test Steps 的 JSON 数组
function extractJiraSteps(md) {
  const empty = [{ index: 1, fields: { Action: '', Data: '', 'Expected Result:': '' } }];
  if (!md) return JSON.stringify(empty);
  const lines = md.split(/\r?\n/);
  const steps = [];
  let idx = 0;
  const reStep = /^\s*(?:\d+[.、)）]|\*{0,2}\s*步骤\s*\d+\s*\*{0,2})\s*[:：]?\s*(.*)$/i;
  for (const line of lines) {
    const m = line.match(reStep);
    if (!m) continue;
    let text = m[1].trim();
    if (!text) continue;
    let expected = '';
    const em = text.match(/(?:预期结果|期望结果|预期|expected\s*result)\s*[:：]\s*(.+)$/i);
    if (em) { expected = em[1].trim(); text = text.slice(0, em.index).trim(); }
    idx++;
    steps.push({ index: idx, fields: { Action: text, Data: '', 'Expected Result': expected } });
  }
  if (!steps.length) {
    steps.push({ index: 1, fields: { Action: md.replace(/\s+/g, ' ').slice(0, 2000), Data: '', 'Expected Result': '' } });
  }
  return JSON.stringify(steps);
}

function exportJiraCsv(rows) {
  const headers = ['Summary', 'Issue Type', 'Test Type', 'Description', 'Manual Test Steps', 'Labels'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const cells = [r.title, 'Test', 'Manual', r.body, extractJiraSteps(r.body), r.category];
    lines.push(cells.map(csvEscape).join(','));
  }
  downloadBlob('﻿' + lines.join('\r\n'), `jira-testcases-${tsStamp()}.csv`, 'text/csv;charset=utf-8');
}

function exportGenericCsv(rows) {
  const headers = ['id', 'title', 'category', 'preview', 'body'];
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map(h => csvEscape(r[h])).join(','));
  downloadBlob('﻿' + lines.join('\r\n'), `knowledge-export-${tsStamp()}.csv`, 'text/csv;charset=utf-8');
}

function exportMarkdown(rows) {
  const blocks = rows.map(r => `# ${r.title}\n\n> 分类: ${r.category}  |  ID: ${r.id}\n\n${r.body || '(无正文)'}`);
  downloadBlob(blocks.join('\n\n---\n\n'), `knowledge-export-${tsStamp()}.md`, 'text/markdown;charset=utf-8');
}

function exportExcel(rows) {
  const headers = ['id', 'title', 'category', 'preview', 'body'];
  const esc = v => escapeHtml(String(v == null ? '' : v)).replace(/\n/g, '<br>');
  let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body><table border="1">';
  html += '<tr>' + headers.map(h => `<th>${escapeHtml(h)}</th>`).join('') + '</tr>';
  for (const r of rows) html += '<tr>' + headers.map(h => `<td>${esc(r[h])}</td>`).join('') + '</tr>';
  html += '</table></body></html>';
  downloadBlob(html, `knowledge-export-${tsStamp()}.xls`, 'application/vnd.ms-excel');
}

function openExportModal() {
  const sel = appState.selectedBrain;
  if (!sel || !sel.size) { alert('请先勾选要导出的条目'); return; }
  const n = sel.size;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:480px;">
      <div class="modal-header">
        <h3>导出选中条目 (${n})</h3>
        <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">关闭</button>
      </div>
      <div class="modal-body">
        <p style="color:var(--text-muted);font-size:13px;margin:0 0 14px;">导出范围为当前勾选的 ${n} 条知识库页面。选择导出格式：</p>
        <div class="export-options">
          <label class="export-opt"><input type="radio" name="expfmt" value="jira" checked>
            <span><b>Jira 兼容格式</b> <span class="rec-badge">推荐</span><br>
            <small>CSV（Xray Test Case Importer 布局：Summary / Issue Type / Test Type / Description / Manual Test Steps / Labels），可直接导入 Jira + Xray。</small></span>
          </label>
          <label class="export-opt"><input type="radio" name="expfmt" value="markdown">
            <span><b>Markdown</b><br><small>所有选中条目合并为一个 .md 文件。</small></span>
          </label>
          <label class="export-opt"><input type="radio" name="expfmt" value="csv">
            <span><b>CSV（通用）</b><br><small>id / title / category / preview / body 通用表格。</small></span>
          </label>
          <label class="export-opt"><input type="radio" name="expfmt" value="excel">
            <span><b>Excel</b><br><small>.xls（HTML 表格，Excel 可直接打开，无需额外依赖）。</small></span>
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" id="export-confirm-btn" onclick="confirmExport()">导出</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function confirmExport() {
  const fmt = (document.querySelector('input[name="expfmt"]:checked') || {}).value || 'jira';
  const btn = document.getElementById('export-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = '导出中…'; }
  try {
    const rows = await fetchSelectedBrainPages();
    if (!rows.length) { alert('没有可导出的数据'); return; }
    if (fmt === 'jira') exportJiraCsv(rows);
    else if (fmt === 'markdown') exportMarkdown(rows);
    else if (fmt === 'csv') exportGenericCsv(rows);
    else if (fmt === 'excel') exportExcel(rows);
    document.querySelector('.modal-overlay')?.remove();
  } catch (e) {
    alert('导出失败: ' + (e && e.message ? e.message : e));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '导出'; }
  }
}

async function batchCommit() {
  const selected = [...appState.selectedDrafts];
  const promptText = selected.length
    ? `确定批量入库选中的 ${selected.length} 条草稿吗？`
    : '确定批量入库所有 pending/approved 草稿吗？';
  if (!confirm(promptText)) return;
  try {
    const body = selected.length ? { ids: selected } : {};
    const res = await apiPost('/drafts/batch-commit', body);
    if (res.success) {
      const d = res.data;
      showResultModal('批量入库完成', `
        <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px;">
          <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">处理数</small><div class="value" style="font-size:24px;">${d.processedDrafts}</div></div>
          <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">成功入库</small><div class="value" style="font-size:24px;color:var(--success)">${d.committed?.length || 0}</div></div>
          <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">冲突/拒绝</small><div class="value" style="font-size:24px;color:var(--danger)">${(d.conflicts?.length||0)+(d.rejected?.length||0)}</div></div>
        </div>
        ${d.committedPages?.length ? `<p style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">已写入 Brain 页面：</p><ul style="font-size:12px;padding-left:18px;line-height:1.8;">${d.committedPages.map(p=>`<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
      `);
    } else {
      alert(`批量入库失败: ${res.error}`);
    }
    appState.selectedDrafts.clear();
    renderPage('drafts');
  } catch (err) {
    alert('批量入库失败: ' + err.message);
  }
}

async function detectConflicts() {
  try {
    const res = await apiPost('/conflicts/detect', {});
    if (res.success) {
      const d = res.data;
      const conflictList = d.conflicts?.length
        ? `<ul style="font-size:12px;padding-left:18px;line-height:1.8;margin-top:8px;">${d.conflicts.map(c=>`<li><strong>${c.conflictType}</strong>：草稿 ${c.draftId?.slice(0,8)} 与 ${escapeHtml(c.existingRule)} 冲突</li>`).join('')}</ul>`
        : '<p style="color:var(--success);margin-top:8px;">未发现冲突</p>';
      showResultModal('冲突检测结果', `
        <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px;">
          <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">检测草稿</small><div class="value" style="font-size:24px;">${d.checkedDrafts}</div></div>
          <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">发现冲突</small><div class="value" style="font-size:24px;color:var(--danger)">${d.conflicts?.length || 0}</div></div>
          <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">通过检测</small><div class="value" style="font-size:24px;color:var(--success)">${d.passedDrafts?.length || 0}</div></div>
        </div>
        ${conflictList}
      `);
    } else {
      alert(`检测失败: ${res.error}`);
    }
    renderPage('conflicts');
  } catch (err) {
    alert('冲突检测失败: ' + err.message);
  }
}

async function runQualityGate() {
  try {
    const res = await apiPost('/quality-gate/check', {});
    if (res.success) {
      const d = res.data;
      const passedList = d.passed?.length
        ? `<p style="font-size:13px;color:var(--text-muted);margin:12px 0 4px;">通过（${d.passed.length}）：</p><ul style="font-size:12px;padding-left:18px;line-height:1.8;">${d.passed.map(p=>`<li>草稿 ${p.draftId?.slice(0,8)} — 评分 <strong>${p.score}</strong>（完整${p.breakdown.completeness}/长度${p.breakdown.length}/格式${p.breakdown.format}/来源${p.breakdown.source}）</li>`).join('')}</ul>`
        : '';
      const rejectedList = d.rejected?.length
        ? `<p style="font-size:13px;color:var(--text-muted);margin:12px 0 4px;">拒绝（${d.rejected.length}）：</p><ul style="font-size:12px;padding-left:18px;line-height:1.8;">${d.rejected.map(r=>`<li>草稿 ${r.draftId?.slice(0,8)} — 评分 <strong style="color:var(--danger)">${r.score}</strong>，原因：${escapeHtml(r.reason)}</li>`).join('')}</ul>`
        : '';
      showResultModal('质量门控结果', `
        <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px;">
          <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">检测草稿</small><div class="value" style="font-size:24px;">${d.checkedDrafts}</div></div>
          <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">通过</small><div class="value" style="font-size:24px;color:var(--success)">${d.passed?.length || 0}</div></div>
          <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">拒绝</small><div class="value" style="font-size:24px;color:var(--danger)">${d.rejected?.length || 0}</div></div>
        </div>
        ${passedList}
        ${rejectedList}
      `);
    } else {
      alert(`检查失败: ${res.error}`);
    }
    renderPage('drafts');
  } catch (err) {
    alert('质量门控失败: ' + err.message);
  }
}

async function resolveConflict(id, resolution) {
  const labels = { merge: '合并', overwrite: '覆盖', discard: '丢弃' };
  if (!confirm(`确定对冲突 ${id} 执行「${labels[resolution]}」吗？`)) return;
  try {
    const res = await apiPut(`/conflicts/${id}/resolve`, { resolution });
    if (res.success && res.data?.success) {
      showResultModal('冲突处理成功', `
        <p>冲突 <code>${id.slice(0,8)}</code> 已执行 <strong>${labels[resolution]}</strong>。</p>
        <p style="color:var(--text-muted);font-size:13px;margin-top:8px;">处理人：${escapeHtml(res.data.resolvedBy || 'system')}</p>
      `);
    } else {
      alert(`处理失败: ${res.error || res.data?.reason || '未知错误'}`);
    }
    renderPage('conflicts');
  } catch (err) {
    alert('处理失败: ' + err.message);
  }
}

async function resolveConflicts(resolution) {
  const ids = Array.from(document.querySelectorAll('.conflict-check:checked')).map(cb => cb.value);
  if (!ids.length) { alert('请先勾选要处理的冲突'); return; }
  const labels = { merge: '合并', overwrite: '覆盖', discard: '丢弃' };
  if (!confirm(`确定对选中的 ${ids.length} 个冲突执行「${labels[resolution]}」吗？`)) return;
  try {
    const res = await apiPut('/conflicts/resolve-batch', { ids, resolution });
    if (res.success && res.data?.success) {
      const ok = res.data.resolvedCount ?? ids.length;
      const fail = res.data.failedCount ?? 0;
      showResultModal('批量冲突处理完成', `
        <p>共处理 <strong>${ids.length}</strong> 个冲突，执行 <strong>${labels[resolution]}</strong>。</p>
        <p style="color:var(--text-muted);font-size:13px;margin-top:8px;">成功 ${ok}，失败 ${fail}</p>
      `);
    } else {
      alert(`处理失败: ${res.error || res.data?.reason || '未知错误'}`);
    }
    renderPage('conflicts');
  } catch (err) {
    alert('处理失败: ' + err.message);
  }
}

function updateConflictSelectedCount() {
  const n = document.querySelectorAll('.conflict-check:checked').length;
  const el = document.getElementById('conflict-selected-count');
  if (el) el.textContent = `已选 ${n} 项`;
}

// 批量选择：全选框（表头 + 批量栏）联动 + 计数更新
document.addEventListener('change', (e) => {
  if (e.target.classList && e.target.classList.contains('conflict-select-all')) {
    const checked = e.target.checked;
    document.querySelectorAll('.conflict-check').forEach(cb => { if (!cb.disabled) cb.checked = checked; });
    updateConflictSelectedCount();
  } else if (e.target.classList && e.target.classList.contains('conflict-check')) {
    updateConflictSelectedCount();
  }
});

async function showConflictDetail(id) {
  try {
    const c = appState.conflicts.find(x => x.id === id);
    if (!c) throw new Error('冲突未找到');

    // 获取关联草稿内容
    const draftRes = await apiGet(`/drafts/${c.draftId}`);
    const draft = draftRes.success ? draftRes.data : null;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:800px;">
        <div class="modal-header">
          <h3>冲突详情</h3>
          <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">关闭</button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow:auto;">
          <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
            <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">冲突ID</small><div style="font-size:12px;word-break:break-all;">${c.id}</div></div>
            <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">类型</small><div>${conflictTypeLabel(c.conflictType)}</div></div>
            <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">状态</small><div><span class="tag tag-${c.resolution ? 'merged' : 'pending'}">${c.resolution ? '已处理' : '待处理'}</span></div></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
              <h4 style="margin-bottom:8px;font-size:14px;color:var(--text-muted)">现有规则</h4>
              <pre style="white-space:pre-wrap;font-family:monospace;background:var(--bg-light);padding:12px;border-radius:8px;font-size:12px;line-height:1.6;max-height:300px;overflow:auto;">${escapeHtml(c.existingRule || '-')}</pre>
            </div>
            <div>
              <h4 style="margin-bottom:8px;font-size:14px;color:var(--text-muted)">新规则（草稿）</h4>
              <pre style="white-space:pre-wrap;font-family:monospace;background:var(--bg-light);padding:12px;border-radius:8px;font-size:12px;line-height:1.6;max-height:300px;overflow:auto;">${escapeHtml(draft?.content || c.newRule || '-')}</pre>
            </div>
          </div>
          ${draft ? `<div style="margin-top:12px;"><small style="color:var(--text-muted)">草稿标题：</small>${escapeHtml(draft.title)}</div>` : ''}
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding-top:12px;border-top:1px solid var(--border);">
          ${!c.resolution ? `
            ${c.draftId ? `<button class="btn btn-secondary" onclick="editDraft('${c.draftId}', ()=>showConflictDetail('${c.id}'))">编辑新规则</button>` : ''}
            <button class="btn btn-primary" onclick="resolveConflict('${c.id}', 'merge');this.closest('.modal-overlay').remove();">合并</button>
            <button class="btn btn-secondary" onclick="resolveConflict('${c.id}', 'overwrite');this.closest('.modal-overlay').remove();">覆盖</button>
            <button class="btn btn-danger" onclick="resolveConflict('${c.id}', 'discard');this.closest('.modal-overlay').remove();">丢弃</button>
          ` : ''}
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } catch (err) {
    alert('加载冲突详情失败: ' + err.message);
  }
}

// ===== 通用编辑器模态框 =====
// openEditModal: 打开一个标题(可选)+正文编辑器，保存时回调 onSave({title, content})
function openEditModal({ title = '编辑', initialTitle = '', initialContent = '', showTitle = true, saveLabel = '保存', category, categories, onSave, onSaved }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const categoryOptionsHtml = (categories && categories.length)
    ? `<div class="edit-field"><label>分类</label><select class="edit-category">${categories.map(c => `<option value="${escapeHtml(c)}" ${c === (category || '') ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select></div>`
    : '';
  overlay.innerHTML = `
    <div class="modal-box edit-modal">
      <div class="modal-header">
        <span>${escapeHtml(title)}</span>
        <button class="modal-close" aria-label="关闭">×</button>
      </div>
      <div class="modal-body">
        ${showTitle ? `<div class="edit-field"><label>标题</label><input type="text" class="edit-title" value="${escapeHtml(initialTitle)}" /></div>` : ''}
        ${categoryOptionsHtml}
        <div class="edit-field">
          <label>内容 (Markdown)</label>
          <textarea class="edit-content" rows="18" placeholder="支持 Markdown 语法…">${escapeHtml(initialContent)}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary edit-cancel">取消</button>
        <button class="btn btn-primary edit-save">${escapeHtml(saveLabel)}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').onclick = close;
  overlay.querySelector('.edit-cancel').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const ta = overlay.querySelector('.edit-content');
  setTimeout(() => { if (showTitle) overlay.querySelector('.edit-title').focus(); else ta.focus(); }, 30);

  overlay.querySelector('.edit-save').onclick = async () => {
    const payload = {
      content: ta.value,
    };
    if (showTitle) payload.title = overlay.querySelector('.edit-title').value;
    const catSel = overlay.querySelector('.edit-category');
    if (catSel) payload.category = catSel.value;
    const btn = overlay.querySelector('.edit-save');
    btn.disabled = true;
    btn.textContent = '保存中…';
    try {
      const saved = await onSave(payload);
      close();
      // 清理可能压在下方的详情模态框，再触发刷新（仅在保存成功时）
      document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
      if (typeof onSaved === 'function') onSaved(saved);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = saveLabel;
      alert('保存失败: ' + err.message);
    }
  };
}

// openViewModal: 以弹窗形式查看正文，可选 onEdit 在弹窗内触发编辑（统一为弹窗交互）
function openViewModal({ title = '查看', content = '', html, onEdit }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box view-modal">
      <div class="modal-header">
        <span>${escapeHtml(title)}</span>
        <button class="modal-close" aria-label="关闭">×</button>
      </div>
      <div class="modal-body">
        ${html ? `<div class="view-content md wiki-md">${html}</div>` : `<pre class="view-content">${escapeHtml(content)}</pre>`}
      </div>
      <div class="modal-footer">
        ${typeof onEdit === 'function' ? '<button class="btn btn-secondary view-edit">编辑</button>' : ''}
        <button class="btn btn-secondary view-close">关闭</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').onclick = close;
  overlay.querySelector('.view-close').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  if (typeof onEdit === 'function') overlay.querySelector('.view-edit').onclick = () => onEdit();
}

// 编辑草稿（人工修改缓冲层条目）
async function editDraft(id, refreshFn) {
  const res = await apiGet(`/drafts/${id}`);
  if (!res.success) { alert('加载草稿失败: ' + res.error); return; }
  const d = res.data;
  openEditModal({
    title: '编辑草稿',
    initialTitle: d.title || '',
    initialContent: d.content || '',
    showTitle: true,
    saveLabel: '保存修改',
    onSave: async ({ title, content }) => {
      const r = await apiPut(`/drafts/${id}`, { title, content });
      if (!r.success) throw new Error(r.error || '更新失败');
    },
    onSaved: () => { if (typeof refreshFn === 'function') refreshFn(); },
  });
}

// 编辑知识库页面（人工修改已发布条目，写回原仓库）
async function editBrainPage(category, id, refreshFn) {
  const res = await apiGet(`/brain/pages/${encodeURIComponent(category)}/${encodeURIComponent(id)}`);
  if (!res.success) { alert('加载页面失败: ' + res.error); return; }
  const data = res.data;
  let chosenCategory = category;
  openEditModal({
    title: '编辑知识页面',
    initialTitle: '',
    initialContent: data.content || '',
    showTitle: false,
    category: category,
    categories: BRAIN_CATEGORIES,
    saveLabel: '提交修改(进草稿箱)',
    onSave: async ({ content, category: selectedCategory }) => {
      chosenCategory = selectedCategory || category;
      const body = { content, repo: data.repo };
      if (chosenCategory !== category) body.category = chosenCategory;
      const r = await apiPost(`/brain/pages/${encodeURIComponent(category)}/${encodeURIComponent(id)}/propose-edit`, body);
      if (!r.success) throw new Error(r.error || '提交失败');
      return r.data;
    },
    onSaved: (saved) => {
      const hasRule = saved && saved.ruleDraftId;
      const reclassified = chosenCategory !== category;
      const dest = reclassified ? `「${chosenCategory}」分类` : '原仓库';
      alert('已生成编辑草稿' + (hasRule ? '与质量规则草稿' : '') + '，请到「草稿箱」确认入库。\n知识条目将在确认后' + (reclassified ? '从「' + category + '」移动至' : '写回') + dest + '，原分类下的旧文件将被删除；质量规则将沉淀至质量规则库。');
      if (typeof refreshFn === 'function') refreshFn();
    },
  });
}

async function showDraftDetail(id) {
  try {
    const res = await apiGet(`/drafts/${id}`);
    if (!res.success) throw new Error(res.error);
    const d = res.data;

    const metaHtml = d.metadata
      ? `<div style="margin-top:12px;padding:12px;background:var(--bg-light);border-radius:8px;">
           <strong>元数据:</strong>
           <pre style="margin:8px 0 0 0;font-size:12px;">${escapeHtml(JSON.stringify(d.metadata, null, 2))}</pre>
         </div>`
      : '';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:720px;">
        <div class="modal-header">
          <h3>草稿详情</h3>
          <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">关闭</button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow:auto;">
          <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
            <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">ID</small><div style="font-size:12px;word-break:break-all;">${d.id}</div></div>
            <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">来源</small><div>${d.source}</div></div>
            <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">类型</small><div>${typeLabel(d.type)}</div></div>
            <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">状态</small><div><span class="tag tag-${d.status}">${d.status}</span></div></div>
            <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">质量分</small><div>${d.qualityScore ?? '-'}</div></div>
            <div class="card" style="padding:12px;"><small style="color:var(--text-muted)">创建时间</small><div>${d.createdAt || '-'}</div></div>
          </div>
          <h4 style="margin:16px 0 8px;">${escapeHtml(d.title)}</h4>
          <pre style="white-space:pre-wrap;font-family:monospace;background:var(--bg-light);padding:16px;border-radius:8px;line-height:1.6;">${escapeHtml(d.content)}</pre>
          ${metaHtml}
          ${d.qualityScore !== null && d.qualityScore !== undefined ? `
            <div style="margin-top:16px;padding:16px;background:${d.qualityScore >= 60 ? 'rgba(0,214,143,0.08)' : 'rgba(255,71,87,0.08)'};border:1px solid ${d.qualityScore >= 60 ? 'rgba(0,214,143,0.25)' : 'rgba(255,71,87,0.25)'};border-radius:8px;">
              <h4 style="margin-bottom:8px;font-size:14px;">质量评分：${d.qualityScore} ${d.qualityScore >= 60 ? '<span style="color:var(--success)">通过</span>' : '<span style="color:var(--danger)">拒绝</span>'}</h4>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:12px;">
                <div style="text-align:center;padding:8px;background:var(--bg-lighter);border-radius:8px;"><div style="font-size:18px;font-weight:600;">${d.metadata?._breakdown?.completeness ?? '-'}</div><small style="color:var(--text-muted)">完整性</small></div>
                <div style="text-align:center;padding:8px;background:var(--bg-lighter);border-radius:8px;"><div style="font-size:18px;font-weight:600;">${d.metadata?._breakdown?.length ?? '-'}</div><small style="color:var(--text-muted)">内容长度</small></div>
                <div style="text-align:center;padding:8px;background:var(--bg-lighter);border-radius:8px;"><div style="font-size:18px;font-weight:600;">${d.metadata?._breakdown?.format ?? '-'}</div><small style="color:var(--text-muted)">格式规范</small></div>
                <div style="text-align:center;padding:8px;background:var(--bg-lighter);border-radius:8px;"><div style="font-size:18px;font-weight:600;">${d.metadata?._breakdown?.source ?? '-'}</div><small style="color:var(--text-muted)">来源可信度</small></div>
              </div>
            </div>
          ` : ''}
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding-top:12px;border-top:1px solid var(--border);">
          <button class="btn btn-secondary" onclick="editDraft('${d.id}', ()=>showDraftDetail('${d.id}'))">编辑</button>
          <button class="btn btn-primary" onclick="commitDraft('${d.id}');this.closest('.modal-overlay').remove();">入库</button>
          <button class="btn btn-secondary" onclick="discardDraft('${d.id}');this.closest('.modal-overlay').remove();">丢弃</button>
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } catch (err) {
    alert('加载草稿详情失败: ' + err.message);
  }
}

async function showPageDetail(category, id, returnPage = 'brain') {
  try {
    const res = await apiGet(`/brain/pages/${encodeURIComponent(category)}/${encodeURIComponent(id)}`);
    if (!res.success) throw new Error(res.error);
    const data = res.data;
    const body = (data.body != null) ? data.body : (data.content || '');
    const md = (typeof renderMarkdown === 'function') ? renderMarkdown(body) : escapeHtml(body);
    openViewModal({
      title: data.title || `${category} / ${id}`,
      html: md,
      onEdit: () => editBrainPage(category, id, () => showPageDetail(category, id, returnPage)),
    });
  } catch (err) {
    alert('加载页面详情失败: ' + err.message);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 强制重新拉取知识库页面列表（数据变更后调用），可选直接跳到某分类筛选
function refreshBrain(category) {
  if (category) appState.brainFilter.category = category;
  appState.brainLoaded = false;
  renderPage('brain');
}

function searchBrain() {
  const el = document.getElementById('brain-search');
  appState.brainFilter.kw = el ? el.value : '';
  appState.pager.brain.page = 1;
  renderPage('brain');
}

function clearBrainSearch() {
  appState.brainFilter.kw = '';
  appState.pager.brain.page = 1;
  renderPage('brain');
}

function sortBrain(key) {
  const s = appState.brainSort;
  if (s.key === key) s.dir = (s.dir === 'asc' ? 'desc' : 'asc');
  else { s.key = key; s.dir = 'asc'; }
  appState.pager.brain.page = 1;
  renderPage('brain');
}

function sortIndicator(key) {
  const s = appState.brainSort || { key: 'id', dir: 'asc' };
  if (s.key !== key) return ' <span class="sort-ind">⇅</span>';
  return ' <span class="sort-ind sort-ind-' + s.dir + '">' + (s.dir === 'asc' ? '▲' : '▼') + '</span>';
}

function filterBrain(category) {
  appState.brainFilter.category = category;
  appState.pager.brain.page = 1;
  renderPage('brain');
}

// 知识库所有可浏览分类（与后端 config/projects.json 的 categories 一致）
const BRAIN_CATEGORIES = ['quality-rules', 'defect-experience', 'project-wiki', 'test-cases', 'test-scripts'];
function brainCategoryOptions(selected) {
  const def = (selected && selected !== 'all') ? selected : 'quality-rules';
  return BRAIN_CATEGORIES.map(c => `<option value="${c}" ${c === def ? 'selected' : ''}>${c}</option>`).join('');
}

// 新增单条知识库页面（人工维护/补充内容）
function openCreatePageModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header"><span>新增知识库条目</span><button class="modal-close" aria-label="关闭">×</button></div>
      <div class="modal-body">
        <div class="form-row">
          <label>分类</label>
          <select id="cp-category" class="form-control">${brainCategoryOptions(appState.brainFilter.category)}</select>
        </div>
        <div class="form-row">
          <label>标题</label>
          <input id="cp-title" type="text" class="form-control" placeholder="请输入条目标题" />
        </div>
        <div class="form-row">
          <label>内容（Markdown）</label>
          <textarea id="cp-content" class="form-control" rows="12" placeholder="支持 Markdown：# 标题、## 小节、- 列表、\`代码\` 等"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary cp-cancel">取消</button>
        <button class="btn btn-primary cp-save">保存</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').onclick = close;
  overlay.querySelector('.cp-cancel').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.cp-save').onclick = () => submitCreatePage(overlay, close);
}

async function submitCreatePage(overlay, close) {
  const btn = overlay.querySelector('.cp-save');
  const category = overlay.querySelector('#cp-category').value;
  const title = overlay.querySelector('#cp-title').value.trim();
  const content = overlay.querySelector('#cp-content').value;
  if (!title) { alert('标题不能为空'); return; }
  btn.disabled = true; btn.textContent = '保存中...';
  try {
    const res = await apiPost('/brain/pages', { category, title, content });
    if (!res.success) throw new Error(res.error || '保存失败');
    alert('已新增条目：' + title);
    close();
    refreshBrain(category);
  } catch (err) {
    alert('新增失败: ' + err.message);
    btn.disabled = false; btn.textContent = '保存';
  }
}

// 批量新增知识库页面（人工维护）
// 文本格式：每条以单独一行的 4 个及以上短横线（----）分隔；块内首行作为标题（可带 #/## 前缀）
function openBatchCreateModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header"><span>批量新增知识库条目</span><button class="modal-close" aria-label="关闭">×</button></div>
      <div class="modal-body">
        <div class="form-row">
          <label>分类</label>
          <select id="bc-category" class="form-control">${brainCategoryOptions(appState.brainFilter.category)}</select>
        </div>
        <div class="form-row">
          <label>条目内容</label>
          <textarea id="bc-content" class="form-control" rows="14" placeholder="每条之间用单独一行的 ---- 分隔&#10;例如：&#10;接口A说明&#10;- 要点1&#10;----&#10;## 接口B说明&#10;- 要点2"></textarea>
        </div>
        <div class="form-hint">提示：每条之间用单独一行的 <code>----</code> 分隔；块内首行作为标题（可带 # / ## 前缀），其余为正文。</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary bc-cancel">取消</button>
        <button class="btn btn-primary bc-save">批量保存</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').onclick = close;
  overlay.querySelector('.bc-cancel').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.bc-save').onclick = () => submitBatchCreate(overlay, close);
}

function parseBatchEntries(text) {
  const blocks = text.split(/^\s*-{4,}\s*$/m).map(b => b.trim()).filter(Boolean);
  const entries = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    let title = '';
    let startIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i].trim();
      if (ln) {
        title = ln.replace(/^#{1,6}\s*/, '').trim();
        startIdx = i + 1;
        break;
      }
    }
    if (!title) continue;
    const body = lines.slice(startIdx).join('\n').trim();
    entries.push({ title, content: body });
  }
  return entries;
}

async function submitBatchCreate(overlay, close) {
  const btn = overlay.querySelector('.bc-save');
  const category = overlay.querySelector('#bc-category').value;
  const raw = overlay.querySelector('#bc-content').value;
  const entries = parseBatchEntries(raw);
  if (entries.length === 0) { alert('未解析到任何条目，请按提示用 ---- 分隔每条'); return; }
  if (!confirm(`将向「${category}」批量新增 ${entries.length} 条，确认？`)) return;
  btn.disabled = true; btn.textContent = '保存中...';
  try {
    const res = await apiPost('/brain/pages/batch', { category, entries });
    if (!res.success) throw new Error(res.error || '批量保存失败');
    const n = res.data ? res.data.created : entries.length;
    alert(`已批量新增 ${n} 条到「${category}」`);
    close();
    refreshBrain(category);
  } catch (err) {
    alert('批量新增失败: ' + err.message);
    btn.disabled = false; btn.textContent = '批量保存';
  }
}

function changeAuditPage(page) {
  appState.auditPage = page;
  renderPage('audit');
}

function filterAudit() {
  const action = document.getElementById('audit-action-filter').value;
  const target = document.getElementById('audit-target-filter').value;
  appState.auditFilter = { action, target };
  appState.auditPage = 1;
  renderPage('audit');
}

function resetAuditFilter() {
  document.getElementById('audit-action-filter').value = '';
  document.getElementById('audit-target-filter').value = '';
  appState.auditFilter = {};
  appState.auditPage = 1;
  renderPage('audit');
}

let kbMessages = [];

function renderVerify() {
  const box = document.getElementById('kb-qa-messages');
  if (!box) return;
  if (!kbMessages.length) {
    box.innerHTML = '<div class="empty-state">向知识库提问，验证其推理能力。例如：用户登录接口需要校验哪些边界条件？\n\n所有 PRD / 代码 / 缺陷 / 质量规则 / 测试用例均已沉淀到 GBrain 知识库，问答将基于这些素材并给出引用。</div>';
    return;
  }
  box.innerHTML = kbMessages.map(m => {
    if (m.role === 'user') {
      return `<div class="kb-msg kb-msg-user"><div class="kb-bubble">${escapeHtml(m.content)}</div></div>`;
    }
    const sourcesHtml = (m.sources && m.sources.length)
      ? `<div class="kb-sources"><div class="kb-sources-title">参考资料</div>${m.sources.map(s => `<div class="kb-source" onclick="openWikiPage('${s.id}')"><span class="kb-ref">[${s.ref}]</span> ${escapeHtml(s.title)} <span class="kb-src-cat">${escapeHtml(s.category)}</span></div>`).join('')}</div>`
      : '';
    return `<div class="kb-msg kb-msg-bot"><div class="kb-bubble kb-md">${renderMarkdown(m.content)}</div>${sourcesHtml}</div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

async function sendKbQA() {
  const input = document.getElementById('kb-qa-input');
  if (!input) return;
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  kbMessages.push({ role: 'user', content: q });
  renderVerify();
  try {
    const res = await apiPost('/kb-qa', { question: q });
    if (!res.success) {
      kbMessages.push({ role: 'bot', content: '⚠️ ' + (res.error || '请求失败') });
    } else {
      kbMessages.push({ role: 'bot', content: res.data.answer || '(无回答)', sources: res.data.sources || [] });
    }
  } catch (e) {
    kbMessages.push({ role: 'bot', content: '⚠️ ' + e.message });
  }
  renderVerify();
}

// ---------------------------------------------------------------
// 导入弹窗
// ---------------------------------------------------------------
const importModal = document.getElementById('import-modal');
document.getElementById('btn-import').addEventListener('click', () => {
  const sel = document.getElementById('import-project');
  if (sel) sel.value = currentProject;
  importModal.classList.add('show');
});
document.getElementById('close-import').addEventListener('click', () => importModal.classList.remove('show'));
document.getElementById('cancel-import').addEventListener('click', () => importModal.classList.remove('show'));

// ---------------------------------------------------------------
// 新建项目弹窗
// ---------------------------------------------------------------
const newProjectModal = document.getElementById('new-project-modal');
document.getElementById('btn-new-project').addEventListener('click', () => {
  document.getElementById('np-id').value = '';
  document.getElementById('np-name').value = '';
  document.getElementById('np-desc').value = '';
  newProjectModal.classList.add('show');
});
document.getElementById('close-new-project').addEventListener('click', () => newProjectModal.classList.remove('show'));
document.getElementById('cancel-new-project').addEventListener('click', () => newProjectModal.classList.remove('show'));

document.getElementById('confirm-new-project').addEventListener('click', async () => {
  const id = document.getElementById('np-id').value.trim();
  const name = document.getElementById('np-name').value.trim();
  const desc = document.getElementById('np-desc').value.trim();
  if (!id) { alert('请填写项目 ID'); return; }
  const btn = document.getElementById('confirm-new-project');
  btn.disabled = true;
  btn.textContent = '创建中...';
  try {
    // 新建项目本身不带 project 维度，用原生 fetch 避免被自动注入 project
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, description: desc })
    });
    const json = await res.json();
    if (json.success) {
      await loadProjects();      // 刷新下拉，含新项目
      onProjectChange(id);       // 创建后直接切换到新项目
      newProjectModal.classList.remove('show');
    } else {
      alert('创建失败: ' + (json.error || '未知错误'));
    }
  } catch (e) {
    alert('创建失败: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '创建';
  }
});

// ---------------------------------------------------------------
// 删除项目
// ---------------------------------------------------------------
const delProjectBtn = document.getElementById('btn-delete-project');
if (delProjectBtn) {
  delProjectBtn.addEventListener('click', async () => {
    if (currentProject === DEFAULT_PROJECT) {
      alert('默认项目不可删除');
      return;
    }
    if (!confirm(`确定删除项目「${currentProject}」吗？\n该项目私有知识库（brains/${currentProject}）将一并删除，共享知识库不受影响。此操作不可恢复。`)) return;
    try {
      const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(currentProject)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        await loadProjects();
        onProjectChange(DEFAULT_PROJECT);
        alert(`项目「${currentProject}」已删除`);
      } else {
        alert('删除失败: ' + (json.error || '未知错误'));
      }
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  });
}

// ---------------------------------------------------------------
// 晋升私有知识到共享库
// ---------------------------------------------------------------
const promoteModal = document.getElementById('promote-modal');
document.getElementById('close-promote').addEventListener('click', () => promoteModal.classList.remove('show'));
document.getElementById('cancel-promote').addEventListener('click', () => promoteModal.classList.remove('show'));
document.getElementById('confirm-promote').addEventListener('click', confirmPromote);

async function openPromoteModal() {
  const nameEl = document.getElementById('promote-project-name');
  if (nameEl) nameEl.textContent = currentProject;
  const listEl = document.getElementById('promote-list');
  listEl.innerHTML = '<div class="loading">加载中...</div>';
  document.getElementById('promote-count').textContent = '0';
  promoteModal.classList.add('show');
  try {
    const res = await apiGet('/brain/private-pages');
    if (!res.success) throw new Error(res.error);
    const pages = res.data.pages || [];
    if (!pages.length) {
      listEl.innerHTML = '<div class="empty-state">当前项目私有知识库暂无已入库页面</div>';
      return;
    }
    listEl.innerHTML = pages.map((p) => `
      <label class="promote-item">
        <input type="checkbox" class="promote-check" value="${escapeHtml(p.path)}">
        <span class="promote-meta">
          <span class="promote-title">${escapeHtml(p.title)}</span>
          <span class="promote-sub">${escapeHtml(p.category)} / ${escapeHtml(p.filename)}</span>
        </span>
      </label>
    `).join('');
    document.getElementById('promote-count').textContent = pages.length;
  } catch (err) {
    listEl.innerHTML = errorBox('加载私有页面失败: ' + err.message);
  }
}

async function confirmPromote() {
  const checks = Array.from(document.querySelectorAll('.promote-check:checked'));
  if (!checks.length) { alert('请至少选择一页'); return; }
  const mode = document.getElementById('promote-mode').value;
  const btn = document.getElementById('confirm-promote');
  btn.disabled = true;
  btn.textContent = '晋升中...';
  let ok = 0, fail = 0;
  try {
    for (const c of checks) {
      const res = await apiPost('/brain/promote', { pagePath: c.value, mode });
      if (res.success) ok++; else fail++;
    }
    alert(`晋升完成：成功 ${ok} 页，失败 ${fail} 页`);
    promoteModal.classList.remove('show');
    if (ok > 0) refreshBrain();
  } catch (err) {
    alert('晋升失败: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '晋升选中';
  }
}

// 根据数据类型动态更新文件接受类型与提示
function syncImportHint() {
  const type = document.getElementById('import-type').value;
  const fileInput = document.getElementById('import-file');
  const hint = document.getElementById('import-hint');
  if (type === 'code') {
    fileInput.accept = '.zip,.tar,.tgz,.tar.gz,.tar.bz2,.tar.xz,.7z,.py,.js,.ts,.java';
    hint.textContent = '支持上传压缩包（.zip / .tar.gz / .tgz / .tar.bz2 / .tar.xz / .7z，自动解压并解析）或单个代码文件（.py/.js/.ts/.java）。解析后将自动提取接口与调用关系并生成草稿。';
  } else if (type === 'prd' || type === 'requirement') {
    fileInput.accept = '.md,.txt,.json,.pdf';
    hint.textContent = 'PRD / 需求文档将直接沉淀为「项目 Wiki」（GBrain，project-wiki 分类），用于「按功能模块」选测试范围；上传后无需进草稿箱，直接在知识库-项目 Wiki 可见。';
  } else {
    fileInput.accept = '';
    hint.textContent = '上传文件内容将作为文本存入草稿，可上传 .md/.txt/.json 等文本文件，提交后在草稿箱确认入库。';
  }
}
document.getElementById('import-type').addEventListener('change', syncImportHint);
syncImportHint();

document.getElementById('confirm-import').addEventListener('click', async () => {
  const type = document.getElementById('import-type').value;
  const fileInput = document.getElementById('import-file');
  const note = document.getElementById('import-note').value;
  const importProject = document.getElementById('import-project').value || currentProject;

  if (!fileInput.files[0]) { alert('请选择文件'); return; }

  const btn = document.getElementById('confirm-import');
  btn.disabled = true;
  btn.textContent = '导入中...';

  try {
    let res;
    if (type === 'code') {
      // 业务代码：以 multipart 上传，后端自动解压 + 解析
      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      fd.append('type', type);
      fd.append('note', note);
      fd.append('project', importProject);
      res = await apiUpload('/source-upload', fd);
    } else {
      // 其它类型：读取为文本后以 JSON 写入
      const content = await fileInput.files[0].text();
      res = await apiPost('/source-upload', { type, content, note, filename: fileInput.files[0]?.name, project: importProject });
    }

    if (res.success) {
      const d = res.data || {};
      let detail;
      if (d.category === 'project-wiki') {
        detail = `已沉淀为项目 Wiki：${d.slug}.md（类型 ${d.uploadType}）\n可在「知识库 → 项目 Wiki」查看，并用于「按功能模块」选择测试范围。`;
      } else if (d.files !== undefined) {
        detail = `代码解析完成：\n- 文件 ${d.files} 个\n- 接口 ${d.interfaces} 个\n- 调用关系 ${d.dependencies} 个\n- 生成草稿 ${d.draftsCreated} 条\n- 图谱页面 ${d.graphPages} 个`;
      } else {
        detail = `已生成草稿（${d.id || '未知'}），请在草稿箱确认入库。`;
      }
      alert(detail);
      importModal.classList.remove('show');
      if (d.category === 'project-wiki') {
        refreshBrain('project-wiki');
      } else {
        renderPage('drafts');
      }
    } else {
      alert('导入失败: ' + res.error);
    }
  } catch (err) {
    alert('导入失败: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '开始导入';
  }
});

document.getElementById('btn-theme').addEventListener('click', toggleTheme);

document.getElementById('btn-run-dream').addEventListener('click', () => {
  alert('Dream Cycle 功能待实现');
});

// ---------------------------------------------------------------
// 图谱模式切换与图例/控件
// ---------------------------------------------------------------
function switchGraphMode(mode) {
  if (graphState.mode === mode) return;
  graphState.mode = mode;
  graphState.focusNode = null;
  graphState.needsFitView = true;
  renderPage('graph');
}

function graphControlsHtml() {
  const chk = (id, label, st) =>
    `<label style="font-size:13px;color:var(--text-muted);white-space:nowrap;"><input type="checkbox" id="${id}" ${st ? 'checked' : ''} onchange="renderGraph()"> ${label}</label>`;
  if (graphState.mode === 'entity') {
    return [
      chk('ent-show-doc', '显示文档', graphState.entShowDoc),
      chk('ent-show-entity', '显示实体', graphState.entShowEntity),
      chk('ent-show-related', '显示关联', graphState.entShowRelated),
      chk('ent-show-ref', '显示引用', graphState.entShowRef),
      chk('ent-hide-isolated', '隐藏孤立', graphState.entHideIsolated),
      `<button class="btn btn-secondary btn-sm" onclick="resetGraphView()">重置视图</button>`,
      `<span style="font-size:12px;color:var(--text-muted);margin-left:auto;">滚轮缩放 · 拖拽节点 · 点击文档节点查看 Wiki</span>`
    ].join('');
  }
  return [
    chk('graph-show-modules', '显示模块', graphState.showModules),
    chk('graph-show-functions', '显示函数', graphState.showFunctions),
    chk('graph-show-similar', '显示相似关系', graphState.showSimilar),
    chk('graph-hide-isolated', '隐藏孤立节点', graphState.hideIsolated),
    `<button class="btn btn-secondary btn-sm" onclick="resetGraphView()">重置视图</button>`,
    `<span style="font-size:12px;color:var(--text-muted);margin-left:auto;">滚轮缩放 · 拖拽节点 · 点击查看详情</span>`
  ].join('');
}

function graphLegendHtml() {
  if (graphState.mode === 'entity') {
    return `
      <span><span class="dot" style="background:#a855f7"></span>文档</span>
      <span><span class="dot" style="background:#22c55e"></span>实体</span>
      <span><span class="bar" style="background:#5a6a82"></span>包含</span>
      <span><span class="bar" style="background:#22c55e"></span>关联(共现)</span>
      <span><span class="bar" style="background:#00d4ff"></span>引用</span>`;
  }
  return `
    <span><span class="dot" style="background:#00d4ff"></span>模块</span>
    <span><span class="dot" style="background:#8b9bb4"></span>函数</span>
    <span><span class="bar" style="background:#5a6a82"></span>调用</span>
    <span><span class="bar" style="background:#ffaa00"></span>相似</span>
    <span><span class="bar" style="background:#00d4ff"></span>模块间调用</span>`;
}

// ---------------------------------------------------------------
// 项目 Wiki：索引 / 渲染 / API 依赖列表
// ---------------------------------------------------------------
async function loadWikiIndex() {
  const el = document.getElementById('wiki-index');
  if (!el) return;
  el.innerHTML = '<div class="loading">加载中...</div>';
  try {
    const res = await apiGet('/brain/pages?category=project-wiki&limit=1000');
    const pages = res.success ? (res.data || []) : [];
    const groups = { prd: [], req: [], api: [], entity: [], other: [] };
    for (const p of pages) {
      if (p.id.startsWith('api-')) groups.api.push(p);
      else if (p.id.startsWith('prd-')) groups.prd.push(p);
      else if (p.id.startsWith('req-')) groups.req.push(p);
      else if (p.id.startsWith('entity-')) groups.entity.push(p);
      else groups.other.push(p);
    }
    const item = (p) => `<div class="wiki-index-item" onclick="openWikiPage('${p.id}')">${escapeHtml(p.title || p.id)}</div>`;
    const sec = (title, list) => list.length
      ? `<details class="wiki-index-group" open><summary class="wiki-index-group-title">${title} <span class="wiki-count">${list.length}</span></summary>${list.map(item).join('')}</details>`
      : '';
    let html = '';
    html += sec('文档与需求 (PRD / 需求)', [...groups.prd, ...groups.req]);
    html += sec('实体（GBrain 抽取）', groups.entity);
    html += `<details class="wiki-index-group" open><summary class="wiki-index-group-title">API 依赖 <span class="wiki-count">${groups.api.length}</span></summary>` +
      `<div class="wiki-index-item wiki-index-special" onclick="openApiDepsPage()">API 调用依赖（列表视图）</div>` +
      groups.api.map(item).join('') + `</details>`;
    html += sec('其它', groups.other);
    html += `<details class="wiki-index-group" open><summary class="wiki-index-group-title">图谱</summary>` +
      `<div class="wiki-index-item wiki-index-special" onclick="switchGraphMode('entity')">项目实体图谱 →</div></details>`;
    el.innerHTML = html || '<div class="empty-state">暂无 Wiki 页面</div>';
  } catch (err) {
    el.innerHTML = `<div class="error-box">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

async function openWikiPage(id) {
  const main = document.getElementById('wiki-content');
  if (!main) return;
  main.innerHTML = '<div class="loading">加载中...</div>';
  try {
    const res = await apiGet(`/brain/pages/project-wiki/${encodeURIComponent(id)}`);
    if (!res.success) { main.innerHTML = `<div class="empty-state">未找到 Wiki 页面：${escapeHtml(id)}</div>`; return; }
    const data = res.data;
    const { fm, body } = parseFrontmatter(data.content);
    const aiSummary = fm.aiSummary || '';
    main.innerHTML = `<article class="wiki-article">
      <div class="wiki-article-head">
        <h1>${escapeHtml(data.title || id)}</h1>
        <div class="wiki-article-actions">
          ${id && id.startsWith('api-') ? `<button class="btn btn-secondary btn-sm" onclick="openGraphForModule('${id}')">在图谱中查看</button>` : ''}
          ${(id.startsWith('prd-') || id.startsWith('req-')) ? `<button class="btn btn-secondary btn-sm" onclick="extractEntities('${id}')">抽取实体（GBrain）</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="loadWikiIndex()">返回索引</button>
        </div>
      </div>
      ${aiSummary
        ? `<div class="wiki-summary">
            <div class="wiki-summary-head">
              <span class="wiki-summary-badge">GBrain AI 摘要</span>
              <button class="btn btn-secondary btn-sm" onclick="generateWikiSummary('${id}')">重新生成</button>
            </div>
            <div class="wiki-md">${renderMarkdown(aiSummary)}</div>
          </div>`
        : `<div class="wiki-summary-empty">
            <span>尚未生成 AI 摘要</span>
            <button class="btn btn-primary btn-sm" onclick="generateWikiSummary('${id}')">生成 AI 摘要</button>
          </div>`}
      <div class="wiki-article-body">
      ${buildToc(body)}
      <div class="wiki-md">${renderMarkdown(body)}</div>
      </div>
    </article>`;
  } catch (err) {
    main.innerHTML = `<div class="error-box">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

// raw 溯源区已隔离，不再提供前端「查看原始文档」入口（见安全约束）

async function extractEntities(id) {
  if (!confirm('将调用 GBrain 从本文档语义抽取实体并生成实体页，可能需要 1-2 分钟，确定继续？')) return;
  const prog = showProgress({ title: '抽取实体中', message: '正在调用 GBrain 语义抽取实体，请稍候（可能需要 1-2 分钟）…' });
  try {
    const res = await apiPost(`/wiki/project-wiki/${encodeURIComponent(id)}/extract-entities`, {});
    if (!res.success) throw new Error(res.error || '未知错误');
    prog.done(`已抽取 ${res.data.count} 个实体，可在左侧索引「实体（GBrain 抽取）」分组查看；实体索引页：${res.data.indexId}`, 'success');
    loadWikiIndex();
  } catch (err) {
    prog.fail('抽取失败：' + err.message);
  }
}

async function generateWikiSummary(id) {
  const main = document.getElementById('wiki-content');
  const btn = main && main.querySelector('.wiki-summary .btn, .wiki-summary-empty .btn');
  if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }
  const prog = showProgress({ title: '生成 AI 摘要', message: '正在调用 GBrain 生成摘要，请稍候…' });
  try {
    const res = await apiPost(`/wiki/project-wiki/${encodeURIComponent(id)}/ai-summary`, {});
    if (!res.success) throw new Error(res.error || '未知错误');
    await openWikiPage(id);
    prog.done('AI 摘要已生成', 'success');
  } catch (err) {
    prog.fail('生成失败：' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '生成 AI 摘要'; }
  }
}

// 解析 Markdown frontmatter（支持带引号多行值的 aiSummary 转义）
function parseFrontmatter(md) {
  const m = (md || '').match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { fm: {}, body: md };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) {
      v = v.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    fm[k] = v;
  }
  return { fm, body: md.slice(m[0].length) };
}

async function openApiDepsPage() {
  const main = document.getElementById('wiki-content');
  if (!main) return;
  main.innerHTML = '<div class="loading">加载中...</div>';
  try {
    const res = await apiGet('/wiki/api-deps');
    if (!res.success) { main.innerHTML = `<div class="error-box">${escapeHtml(res.error || '加载失败')}</div>`; return; }
    const d = res.data || {};
    const ov = d.overview || {};
    const stats = ov.stats || {};
    const mods = d.modules || [];
    let html = `<article class="wiki-article">
      <div class="wiki-article-head"><h1>API 调用依赖</h1>
        <div class="wiki-article-actions"><button class="btn btn-secondary btn-sm" onclick="loadWikiIndex()">返回索引</button></div>
      </div>
      <div class="wiki-md">`;
    if (Object.keys(stats).length) {
      html += '<div class="api-stats">' + Object.entries(stats).map(([k, v]) => `<span class="api-stat"><b>${v}</b> ${escapeHtml(k)}</span>`).join('') + '</div>';
    }
    html += '<p class="hint">以下为各模块的接口与调用关系列表（以列表方式展示）。点击「在图谱中查看」可跳转到图谱可视化的 API 依赖图谱并聚焦该模块。</p>';
    for (const m of mods) {
      html += `<section class="api-module">
        <h2>${escapeHtml(m.title || m.module)} <span class="api-module-id">${escapeHtml(m.id)}</span>
          <button class="btn btn-secondary btn-sm" onclick="openGraphForModule('${m.id}')">在图谱中查看</button></h2>`;
      if (m.interfaces && m.interfaces.length) {
        html += '<h3>接口列表</h3><ul class="api-iface">' +
          m.interfaces.map(it => `<li><code>${escapeHtml(it.name)}</code>${it.params ? ' <span class="api-params">(' + escapeHtml(it.params) + ')</span>' : (it.returns ? ' → <code>' + escapeHtml(it.returns) + '</code>' : '')}</li>`).join('') + '</ul>';
      }
      if (m.calls && m.calls.length) {
        html += '<h3>调用关系</h3><ul class="api-call">' +
          m.calls.map(c => `<li><code>${escapeHtml(c.from)}</code> → <code>${escapeHtml(c.to)}</code> <span class="api-call-type">(${escapeHtml(c.type)})</span></li>`).join('') + '</ul>';
      }
      html += '</section>';
    }
    html += '</div></article>';
    main.innerHTML = html;
  } catch (err) {
    main.innerHTML = `<div class="error-box">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

function openGraphForModule(id) {
  graphState.mode = 'api';
  graphState.focusNode = id;
  graphState.needsFitView = true;
  location.hash = '#graph';
  renderPage('graph');
}

function scrollToHeading(id) {
  const el = document.getElementById(id);
  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------
// 使用教程
// ---------------------------------------------------------------
function tutorialAutoLoad() {
  fetch('/tutorial/manifest.json?t=' + Date.now())
    .then(r => r.json())
    .then(m => { const first = (m.chapters || [])[0]; if (first) tutorialLoadChapter(first.file); })
    .catch(() => {});
}

async function tutorialLoadChapter(file) {
  const c = document.getElementById('tut-content');
  if (!c) return;
  c.innerHTML = '<div class="loading">加载中...</div>';
  try {
    const res = await fetch('/tutorial/chapters/' + encodeURIComponent(file) + '?t=' + Date.now());
    if (!res.ok) throw new Error('章节加载失败 (' + res.status + ')');
    const md = await res.text();
    c.innerHTML = '<article class="tut-article">' + renderTutorialMarkdown(md) + '</article>';
    document.querySelectorAll('.tut-ch').forEach(el => el.classList.toggle('active', el.dataset.file === file));
    c.scrollTop = 0;
  } catch (e) {
    c.innerHTML = '<div class="error-box">' + escapeHtml(e.message) + '</div>';
  }
}

function renderTutorialMarkdown(md) {
  const toc = buildToc(md);
  const body = renderMarkdown(md);
  return toc + '<div class="tut-body">' + body + '</div>';
}

function slugify(s) {
  return (s || '').trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w一-龥-]/g, '')
    .replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function inlineMd(text) {
  if (!text) return '';
  let s = escapeHtml(text);
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, a, u) => `<img class="md-img" src="${u.trim().replace(/"/g, '%22')}" alt="${escapeHtml(a)}" loading="lazy">`);
  s = s.replace(/`([^`]+)`/g, (m, c) => `<code class="md-code">${c}</code>`);
  s = s.replace(/\[\[([^\]]+)\]\]/g, (m, p) => `<a class="md-wikilink" href="javascript:void(0)" onclick="openWikiPage('${slugify(p)}')">${escapeHtml(p)}</a>`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => `<a class="md-link" href="${u}" target="_blank" rel="noopener">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s;
}

function splitMdRow(row) {
  let s = row.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}
function renderMdTable(headers, rows) {
  const head = '<thead><tr>' + headers.map(h => `<th>${inlineMd(h)}</th>`).join('') + '</tr></thead>';
  const body = rows.map(r => '<tr>' + headers.map((_, idx) => `<td>${inlineMd(r[idx] || '')}</td>`).join('') + '</tr>').join('');
  return `<table class="md-table">${head}<tbody>${body}</tbody></table>`;
}

function renderMarkdown(md) {
  if (!md) return '';
  const lines = md.split(/\r?\n/);
  let html = '';
  let i = 0;
  let inList = false, listType = '';
  let paragraph = [];
  const flushP = () => { if (paragraph.length) { html += `<p>${inlineMd(paragraph.join(' '))}</p>`; paragraph = []; } };
  const closeList = () => { if (inList) { html += `</${listType}>`; inList = false; } };
  while (i < lines.length) {
    const line = lines[i];
    const imgLine = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgLine) { flushP(); closeList(); html += `<figure class="md-figure"><img class="md-img" src="${imgLine[2].trim().replace(/"/g, '%22')}" alt="${escapeHtml(imgLine[1])}" loading="lazy"></figure>`; i++; continue; }
    if (/^```/.test(line)) {
      flushP(); closeList();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      html += `<pre class="md-pre"><code>${escapeHtml(buf.join('\n'))}</code></pre>`;
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flushP(); closeList(); const lv = h[1].length; html += `<h${lv} class="md-h md-h${lv}" id="${slugify(h[2])}">${inlineMd(h[2])}</h${lv}>`; i++; continue; }
    // GFM 表格：当前行以 | 起始，且下一行是分隔线（仅含 | - : 与空白）
    if (/^\|/.test(line)) {
      const next = lines[i + 1] || '';
      if (/^[\s|]*-+[\s|:-]*$/.test(next) && /-/.test(next)) {
        flushP(); closeList();
        const headers = splitMdRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) { rows.push(splitMdRow(lines[i])); i++; }
        html += renderMdTable(headers, rows);
        continue;
      }
    }
    // 分隔线 或 内嵌 frontmatter 元信息块（--- key: value ... ---）
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      if (/^-{3,}\s*$/.test(line)) {
        let j = i + 1; let isMeta = true; const metaLines = [];
        while (j < lines.length && !/^-{3,}\s*$/.test(lines[j])) {
          if (/^\s*[\w一-龥-]+:\s*/.test(lines[j])) { metaLines.push(lines[j]); j++; }
          else { isMeta = false; break; }
        }
        if (isMeta && metaLines.length && j < lines.length) {
          flushP(); closeList();
          const dl = metaLines.map(l => {
            const idx = l.indexOf(':');
            const k = l.slice(0, idx).trim();
            const v = l.slice(idx + 1).trim();
            return `<dt>${escapeHtml(k)}</dt><dd>${inlineMd(v)}</dd>`;
          }).join('');
          html += `<dl class="md-meta">${dl}</dl>`;
          i = j + 1;
          continue;
        }
      }
      flushP(); closeList(); html += '<hr>'; i++; continue;
    }
    if (/^>\s?/.test(line)) {
      flushP(); closeList();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      html += `<blockquote class="md-quote">${inlineMd(buf.join(' '))}</blockquote>`;
      continue;
    }
    const ul = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (ul) { flushP(); if (!inList || listType !== 'ul') { closeList(); html += '<ul class="md-ul">'; inList = true; listType = 'ul'; } html += `<li>${inlineMd(ul[2])}</li>`; i++; continue; }
    const ol = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (ol) { flushP(); if (!inList || listType !== 'ol') { closeList(); html += '<ol class="md-ol">'; inList = true; listType = 'ol'; } html += `<li>${inlineMd(ol[2])}</li>`; i++; continue; }
    if (!line.trim()) { flushP(); closeList(); i++; continue; }
    paragraph.push(line.trim());
    i++;
  }
  flushP(); closeList();
  return html;
}

function buildToc(md) {
  if (!md) return '';
  const lines = md.split(/\r?\n/);
  const items = [];
  for (const line of lines) {
    const m = line.match(/^(#{2,3})\s+(.*)$/);
    if (m) {
      const text = m[2].trim();
      items.push(`<li class="toc-l${m[1].length}"><a href="javascript:void(0)" onclick="scrollToHeading('${slugify(text)}')">${escapeHtml(text)}</a></li>`);
    }
  }
  if (!items.length) return '';
  return `<div class="wiki-toc"><div class="wiki-toc-title">目录</div><ul>${items.join('')}</ul></div>`;
}

// ---------------------------------------------------------------
// 系统设置
// ---------------------------------------------------------------
function settingsNavClick(target) {
  const el = document.getElementById(target);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelectorAll('.settings-nav-item').forEach(n =>
    n.classList.toggle('active', n.dataset.target === target));
}

async function saveSettings() {
  const msg = document.getElementById('settings-msg');
  const val = (id) => (document.getElementById(id).value || '').trim();
  const payload = {
    ai: { provider: val('ai-provider'), useCustomModel: document.getElementById('ai-useCustomModel').checked, endpoint: val('ai-endpoint'), apiKey: document.getElementById('ai-apikey').value, model: val('ai-model') },
    gbrain: { provider: val('gb-provider'), endpoint: val('gb-endpoint'), apiKey: document.getElementById('gb-apikey').value, model: val('gb-model') },
    storage: { knowledgeBasePath: val('kb-path') }
  };
  try {
    const res = await apiPut('/ai-settings', payload);
    if (res.success) { msg.textContent = '✓ 已保存'; msg.style.color = 'var(--accent, #22c55e)'; }
    else { msg.textContent = '保存失败: ' + (res.error || '未知错误'); msg.style.color = '#ef4444'; }
  } catch (e) {
    msg.textContent = '保存失败: ' + e.message; msg.style.color = '#ef4444';
  }
  setTimeout(() => { if (msg) msg.textContent = ''; }, 3000);
}

// ---------------------------------------------------------------
// 路由
// ---------------------------------------------------------------
function route() {
  const hash = location.hash.replace('#', '') || 'dashboard';
  renderPage(hash);
}

window.addEventListener('hashchange', route);
window.addEventListener('scroll', () => {
  const items = document.querySelectorAll('.settings-nav-item');
  if (!items.length) return;
  const offset = 140;
  let current = null;
  document.querySelectorAll('.settings-section').forEach(s => {
    if (s.getBoundingClientRect().top - offset <= 0) current = s.id;
  });
  if (!current) current = document.querySelector('.settings-section')?.id;
  items.forEach(n => n.classList.toggle('active', n.dataset.target === current));
}, { passive: true });
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadProjects();
  const sel = document.getElementById('project-select');
  if (sel) sel.addEventListener('change', (e) => onProjectChange(e.target.value));
  route();
});

// ---------------------------------------------------------------
// 图谱可视化（SVG 力导向图）
// ---------------------------------------------------------------
let graphState = {
  mode: 'api',                 // 'api' | 'entity'
  nodes: [], edges: [], simNodes: [], simEdges: [],
  dataCache: { api: null, entity: null },
  transform: { x: 0, y: 0, k: 1 },
  dragging: null, dragOffset: { x: 0, y: 0 },
  showModules: true, showFunctions: true, showSimilar: false,
  hideIsolated: false,
  // 实体图谱过滤项
  entShowDoc: true, entShowEntity: true, entShowRelated: true, entShowRef: true, entHideIsolated: false,
  focusNode: null,             // 从 Wiki 的 API 依赖跳转聚焦的模块节点
  needsFitView: true
};

async function renderGraph() {
  const svg = document.getElementById('graph-svg');
  if (!svg) return;
  const container = document.getElementById('graph-container');
  const viewW = container.clientWidth;
  const viewH = container.clientHeight;

  // 获取数据（按模式分别缓存，仅加载一次）
  if (!graphState.dataCache[graphState.mode]) {
    try {
      const url = graphState.mode === 'entity' ? '/graph-data?mode=entity' : '/graph-data';
      const res = await apiGet(url);
      if (!res.success) throw new Error(res.error);
      const data = res.data;
      graphState.dataCache[graphState.mode] = { nodes: initializeNodePositions(data.nodes), edges: data.edges };
    } catch (err) {
      svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="#8b9bb4">加载图谱数据失败: ${escapeHtml(err.message)}</text>`;
      return;
    }
  }
  graphState.nodes = graphState.dataCache[graphState.mode].nodes;
  graphState.edges = graphState.dataCache[graphState.mode].edges;

  if (graphState.mode === 'entity') {
    graphState.entShowDoc = document.getElementById('ent-show-doc')?.checked ?? graphState.entShowDoc;
    graphState.entShowEntity = document.getElementById('ent-show-entity')?.checked ?? graphState.entShowEntity;
    graphState.entShowRelated = document.getElementById('ent-show-related')?.checked ?? graphState.entShowRelated;
    graphState.entShowRef = document.getElementById('ent-show-ref')?.checked ?? graphState.entShowRef;
    graphState.entHideIsolated = document.getElementById('ent-hide-isolated')?.checked ?? graphState.entHideIsolated;
  } else {
    graphState.showModules = document.getElementById('graph-show-modules')?.checked ?? graphState.showModules;
    graphState.showFunctions = document.getElementById('graph-show-functions')?.checked ?? graphState.showFunctions;
    graphState.showSimilar = document.getElementById('graph-show-similar')?.checked ?? graphState.showSimilar;
    graphState.hideIsolated = document.getElementById('graph-hide-isolated')?.checked ?? graphState.hideIsolated;
  }

  // 过滤节点和边
  let visibleNodes = new Map();
  if (graphState.mode === 'entity') {
    for (const n of graphState.nodes) {
      if (n.type === 'doc' && graphState.entShowDoc) visibleNodes.set(n.id, n);
      else if (n.type === 'entity' && graphState.entShowEntity) visibleNodes.set(n.id, n);
    }
  } else {
    for (const n of graphState.nodes) {
      if (n.type === 'module' && graphState.showModules) visibleNodes.set(n.id, n);
      else if (n.type === 'function' && graphState.showFunctions) visibleNodes.set(n.id, n);
    }
  }

  // 聚焦：从 Wiki 跳转时仅显示该节点及其邻居（即使对应显示开关关闭也强制展示）
  if (graphState.focusNode) {
    const nb = new Set([graphState.focusNode]);
    for (const e of graphState.edges) {
      if (e.source === graphState.focusNode) nb.add(e.target);
      if (e.target === graphState.focusNode) nb.add(e.source);
    }
    const f = new Map();
    for (const id of nb) {
      if (visibleNodes.has(id)) f.set(id, visibleNodes.get(id));
      else {
        const n = graphState.nodes.find(x => x.id === id);
        if (n) f.set(id, n);
      }
    }
    if (f.size) visibleNodes = f;
  }

  const visibleEdges = graphState.edges.filter(e => {
    if (!visibleNodes.has(e.source) || !visibleNodes.has(e.target)) return false;
    if (graphState.mode === 'entity') {
      if (e.type === 'related' && !graphState.entShowRelated) return false;
      if (e.type === 'ref' && !graphState.entShowRef) return false;
    } else {
      if (e.type === 'similar' && !graphState.showSimilar) return false;
    }
    return true;
  });

  // 隐藏孤立节点（没有任何边连接的节点）
  const hideIso = graphState.mode === 'entity' ? graphState.entHideIsolated : graphState.hideIsolated;
  if (hideIso) {
    const connectedIds = new Set();
    for (const e of visibleEdges) {
      connectedIds.add(e.source);
      connectedIds.add(e.target);
    }
    const filtered = new Map();
    for (const [id, n] of visibleNodes) {
      if (connectedIds.has(id)) filtered.set(id, n);
    }
    visibleNodes = filtered;
  }

  // 运行力导向模拟（无边界限制）
  const nodes = Array.from(visibleNodes.values());
  const edges = visibleEdges.filter(e => visibleNodes.has(e.source) && visibleNodes.has(e.target));
  runForceSimulation(nodes, edges, visibleNodes);

  // 首次渲染或需要适配时，自动调整视口
  if (graphState.needsFitView && nodes.length > 0) {
    fitView(nodes, viewW, viewH);
    graphState.needsFitView = false;
  }

  // 渲染 SVG
  const { x: tx, y: ty, k } = graphState.transform;
  const isLight = document.body.classList.contains('light');
  let colors, edgeColors, graphBg, labelColor;
  if (graphState.mode === 'entity') {
    colors = { doc: isLight ? '#9333ea' : '#a855f7', entity: isLight ? '#16a34a' : '#22c55e' };
    edgeColors = { contains: isLight ? '#aab3c5' : '#5a6a82', related: isLight ? '#16a34a' : '#22c55e', ref: isLight ? '#0088cc' : '#00d4ff' };
    graphBg = isLight ? '#f0f2f5' : '#0a1628';
    labelColor = isLight ? '#1a1a2e' : '#e0e6ed';
  } else {
    colors = { module: isLight ? '#0088cc' : '#00d4ff', function: isLight ? '#5a6a82' : '#8b9bb4' };
    edgeColors = { call: isLight ? '#8b9bb4' : '#5a6a82', similar: '#ffaa00', module_call: isLight ? '#0088cc' : '#00d4ff' };
    graphBg = isLight ? '#f0f2f5' : '#0a1628';
    labelColor = isLight ? '#1a1a2e' : '#e0e6ed';
  }

  // 箭头 marker 定义
  let svgHtml = `
    <defs>
      <marker id="arrow-call" markerWidth="5" markerHeight="4" refX="4.5" refY="2" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L5,2 L0,4 L1.5,2 Z" fill="${edgeColors.call || '#5a6a82'}" />
      </marker>
      <marker id="arrow-similar" markerWidth="5" markerHeight="4" refX="4.5" refY="2" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L5,2 L0,4 L1.5,2 Z" fill="#ffaa00" />
      </marker>
      <marker id="arrow-module" markerWidth="5" markerHeight="4" refX="4.5" refY="2" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L5,2 L0,4 L1.5,2 Z" fill="${edgeColors.module_call || '#00d4ff'}" />
      </marker>
      <marker id="arrow-contains" markerWidth="5" markerHeight="4" refX="4.5" refY="2" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L5,2 L0,4 L1.5,2 Z" fill="${edgeColors.contains}" />
      </marker>
      <marker id="arrow-ref" markerWidth="5" markerHeight="4" refX="4.5" refY="2" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L5,2 L0,4 L1.5,2 Z" fill="${edgeColors.ref}" />
      </marker>
    </defs>
    <g transform="translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${k.toFixed(4)})">
  `;

  // 边（带箭头）
  for (const e of edges) {
    const na = visibleNodes.get(e.source);
    const nb = visibleNodes.get(e.target);
    if (!na || !nb) continue;
    const stroke = edgeColors[e.type] || '#ccc';
    const dash = (e.type === 'module_call' || e.type === 'related') ? 'stroke-dasharray="4,4"' : '';
    let marker = 'url(#arrow-call)';
    if (e.type === 'similar') marker = 'url(#arrow-similar)';
    else if (e.type === 'module_call') marker = 'url(#arrow-module)';
    else if (e.type === 'contains') marker = 'url(#arrow-contains)';
    else if (e.type === 'ref') marker = 'url(#arrow-ref)';
    else if (e.type === 'related') marker = '';
    // 计算箭头终点偏移（避免箭头被节点遮挡）
    const dx = nb.x - na.x;
    const dy = nb.y - na.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
    const targetR = graphState.mode === 'entity'
      ? (nb.type === 'doc' ? 20 : 9)
      : (nb.type === 'module' ? 20 : 8);
    const endX = nb.x - (dx / dist) * targetR;
    const endY = nb.y - (dy / dist) * targetR;
    svgHtml += `<line class="graph-edge" data-source="${e.source}" data-target="${e.target}" data-type="${e.type}" x1="${na.x.toFixed(1)}" y1="${na.y.toFixed(1)}" x2="${endX.toFixed(1)}" y2="${endY.toFixed(1)}" stroke="${stroke}" stroke-width="${e.type === 'module_call' ? 2 : 1}" opacity="0.6" marker-end="${marker}" ${dash} />`;
  }

  // 节点
  for (const n of nodes) {
    const r = graphState.mode === 'entity'
      ? (n.type === 'doc' ? 20 : 9)
      : (n.type === 'module' ? 18 : 6);
    const color = colors[n.type] || '#999';
    svgHtml += `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${r}" fill="${color}" stroke="${graphBg}" stroke-width="2" class="graph-node" data-id="${n.id}" data-type="${n.type}" style="cursor:pointer;" />`;
    const showLabel = graphState.mode === 'entity'
      ? (n.type === 'doc' || n.label.length < 16)
      : (n.type === 'module' || n.label.length < 20);
    if (showLabel) {
      svgHtml += `<text class="graph-label" data-for="${n.id}" x="${n.x.toFixed(1)}" y="${(n.y + r + 12).toFixed(1)}" text-anchor="middle" font-size="11" fill="${labelColor}" style="pointer-events:none;">${escapeHtml(n.label)}</text>`;
    }
  }

  svgHtml += '</g>';
  svg.innerHTML = svgHtml;

  // 事件绑定
  svg.querySelectorAll('.graph-node').forEach(circle => {
    circle.addEventListener('click', (ev) => {
      const id = ev.target.dataset.id;
      const node = graphState.nodes.find(n => n.id === id);
      if (!node) return;
      if (graphState.mode === 'entity') {
        if (node.type === 'doc') {
          openWikiPage(node.id.replace(/\.md$/, ''));
        } else {
          const related = edges.filter(e => e.source === id || e.target === id);
          showResultModal('实体详情', `<p><strong>${escapeHtml(node.label)}</strong></p>
            <p style="color:var(--text-muted);font-size:13px;margin-top:6px;">项目领域实体，由 Wiki 文档标题抽取。共 ${related.length} 条关联。</p>`);
        }
      } else if (node.type === 'module') {
        showPageDetail('project-wiki', node.id, 'graph');
      } else {
        const related = edges.filter(e => e.source === id || e.target === id);
        const html = `<p><strong>${escapeHtml(node.label)}</strong> (${node.type})</p>
          <p style="color:var(--text-muted);font-size:12px;margin-top:4px;">模块: ${escapeHtml(node.module || '-')}</p>
          <p style="color:var(--text-muted);font-size:12px;margin-top:4px;">关联关系: ${related.length} 条</p>
          ${related.length ? '<ul style="font-size:12px;margin-top:8px;padding-left:16px;">' + related.map(e => {
            const other = e.source === id ? e.target : e.source;
            const otherNode = graphState.nodes.find(n => n.id === other);
            return `<li>${e.type === 'call' ? '调用' : '相似'} ${escapeHtml(otherNode ? otherNode.label : other)} ${e.label ? '(' + e.label + ')' : ''}</li>`;
          }).join('') + '</ul>' : ''}`;
        showResultModal('节点详情', html);
      }
    });
    circle.addEventListener('mouseenter', (ev) => {
      const id = ev.target.dataset.id;
      const node = graphState.nodes.find(n => n.id === id);
      const tooltip = document.getElementById('graph-tooltip');
      tooltip.textContent = node ? node.label : id;
      tooltip.style.display = 'block';
      highlightGraph(id);
    });
    circle.addEventListener('mousemove', (ev) => {
      const tooltip = document.getElementById('graph-tooltip');
      const rect = container.getBoundingClientRect();
      tooltip.style.left = (ev.clientX - rect.left + 10) + 'px';
      tooltip.style.top = (ev.clientY - rect.top + 10) + 'px';
    });
    circle.addEventListener('mouseleave', () => {
      document.getElementById('graph-tooltip').style.display = 'none';
      unhighlightGraph();
    });
  });
}

/**
 * 高亮与指定节点关联的节点和边，其他元素淡化
 * 区分方向：hover 节点作为 source（调用出去）和 target（被调用进来）用不同颜色
 */
function highlightGraph(hoverId) {
  const svg = document.getElementById('graph-svg');
  if (!svg) return;

  // 收集所有关联的节点 id
  const relatedIds = new Set([hoverId]);
  svg.querySelectorAll('.graph-edge').forEach(line => {
    const s = line.dataset.source;
    const t = line.dataset.target;
    if (s === hoverId || t === hoverId) {
      relatedIds.add(s);
      relatedIds.add(t);
    }
  });

  // 淡化不相关的节点
  svg.querySelectorAll('.graph-node').forEach(node => {
    if (relatedIds.has(node.dataset.id)) {
      node.style.opacity = '1';
      node.setAttribute('stroke-width', '3');
    } else {
      node.style.opacity = '0.12';
      node.setAttribute('stroke-width', '1');
    }
  });

  // 淡化不相关的边，高亮时区分方向
  svg.querySelectorAll('.graph-edge').forEach(line => {
    const s = line.dataset.source;
    const t = line.dataset.target;
    const type = line.dataset.type;
    if (s === hoverId) {
      // hover 节点是调用方（source）→  outgoing，用绿色
      line.style.opacity = '1';
      line.setAttribute('stroke-width', type === 'module_call' ? '3' : '2');
      line.setAttribute('stroke', '#22c55e');
    } else if (t === hoverId) {
      // hover 节点是被调用方（target）→  incoming，用红色
      line.style.opacity = '1';
      line.setAttribute('stroke-width', type === 'module_call' ? '3' : '2');
      line.setAttribute('stroke', '#ef4444');
    } else {
      line.style.opacity = '0.06';
      // 恢复原始颜色
      const orig = type === 'similar' ? '#ffaa00' : type === 'module_call' ? '#00d4ff' : '#5a6a82';
      line.setAttribute('stroke', orig);
    }
  });

  // 淡化不相关的标签
  svg.querySelectorAll('.graph-label').forEach(label => {
    label.style.opacity = relatedIds.has(label.dataset.for) ? '1' : '0.12';
  });
}

/**
 * 取消高亮，恢复所有元素正常显示
 */
function unhighlightGraph() {
  const svg = document.getElementById('graph-svg');
  if (!svg) return;
  svg.querySelectorAll('.graph-node').forEach(node => {
    node.style.opacity = '1';
    node.setAttribute('stroke-width', '2');
  });
  svg.querySelectorAll('.graph-edge').forEach(line => {
    line.style.opacity = '0.6';
    const type = line.dataset.type;
      const orig = type === 'similar' ? '#ffaa00' : type === 'module_call' ? '#00d4ff' : '#5a6a82';
      line.setAttribute('stroke', orig);
      const w = type === 'module_call' ? '2' : '1';
      line.setAttribute('stroke-width', w);
  });
  svg.querySelectorAll('.graph-label').forEach(label => {
    label.style.opacity = '1';
  });
}

/**
 * 初始布局：所有节点在原点周围随机分布
 * 世界坐标系是无限的，初始位置不依赖视口大小
 */
function initializeNodePositions(nodes) {
  const spread = 400; // 初始散布半径（世界坐标）
  return nodes.map(n => {
    const angle = Math.random() * 2 * Math.PI;
    const radius = spread * Math.sqrt(Math.random());
    return {
      ...n,
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
      vx: 0, vy: 0
    };
  });
}

/**
 * 力导向模拟（无限画布版本）
 * 无边界限制、无中心引力，节点自由分布
 * 靠斥力和边引力自然形成布局
 */
function runForceSimulation(nodes, edges, visibleNodes) {
  const iterations = 500;

  function nodeRadius(n) {
    if (graphState.mode === 'entity') return n.type === 'doc' ? 20 : 9;
    return n.type === 'module' ? 20 : 7;
  }

  const degree = new Map();
  for (const n of nodes) degree.set(n.id, 0);
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }

  let temperature = 80;
  const cooling = 0.97;
  const repulsionCutoff = 200;
  const baseRepulsion = 600;

  for (let i = 0; i < iterations; i++) {
    // 1. 节点间斥力（截断距离）
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const na = nodes[a], nb = nodes[b];
        let dx = na.x - nb.x, dy = na.y - nb.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.1;

        if (dist >= repulsionCutoff) continue;

        const decay = 1 - dist / repulsionCutoff;
        const degFactor = 1 / Math.sqrt((degree.get(na.id) || 1) + (degree.get(nb.id) || 1));
        const force = baseRepulsion * decay * decay * degFactor;

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        na.vx += fx; na.vy += fy;
        nb.vx -= fx; nb.vy -= fy;
      }
    }

    // 2. 边引力
    for (const e of edges) {
      const na = visibleNodes.get(e.source);
      const nb = visibleNodes.get(e.target);
      if (!na || !nb) continue;

      let dx = nb.x - na.x, dy = nb.y - na.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 0.1;

      let targetLen = 100;
      if (e.type === 'module_call') targetLen = 180;
      else if (e.type === 'similar') targetLen = 80;
      else if (e.type === 'call') targetLen = 60;

      const force = (dist - targetLen) * 0.01;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      na.vx += fx; na.vy += fy;
      nb.vx -= fx; nb.vy -= fy;
    }

    // 3. 碰撞检测
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const na = nodes[a], nb = nodes[b];
        let dx = nb.x - na.x, dy = nb.y - na.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const minDist = nodeRadius(na) + nodeRadius(nb) + 6;

        if (dist < minDist) {
          const overlap = minDist - dist;
          const fx = (dx / dist) * overlap * 0.35;
          const fy = (dy / dist) * overlap * 0.35;
          na.vx -= fx; na.vy -= fy;
          nb.vx += fx; nb.vy += fy;
        }
      }
    }

    // 4. 更新位置（无边界限制）
    for (const n of nodes) {
      n.vx *= 0.86;
      n.vy *= 0.86;

      const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (speed > temperature) {
        n.vx = (n.vx / speed) * temperature;
        n.vy = (n.vy / speed) * temperature;
      }

      n.x += n.vx;
      n.y += n.vy;
    }

    temperature *= cooling;
  }
}

/**
 * 自动调整视口，使所有节点刚好显示在窗口内
 */
function fitView(nodes, viewW, viewH) {
  if (nodes.length === 0) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const r = n.type === 'module' ? 25 : 10;
    minX = Math.min(minX, n.x - r);
    minY = Math.min(minY, n.y - r);
    maxX = Math.max(maxX, n.x + r);
    maxY = Math.max(maxY, n.y + r);
  }

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  if (contentW <= 0 || contentH <= 0) return;

  const padding = 60;
  const scaleX = (viewW - padding * 2) / contentW;
  const scaleY = (viewH - padding * 2) / contentH;
  const k = Math.min(scaleX, scaleY, 2); // 最大放大到 2 倍

  graphState.transform.k = k;
  graphState.transform.x = viewW / 2 - (minX + maxX) / 2 * k;
  graphState.transform.y = viewH / 2 - (minY + maxY) / 2 * k;
}

function resetGraphView() {
  graphState.nodes = initializeNodePositions(graphState.nodes);
  graphState.needsFitView = true;
  renderGraph();
}

// 缩放（以鼠标位置为中心）
window.addEventListener('wheel', (e) => {
  const container = document.getElementById('graph-container');
  if (!container || !container.contains(e.target)) return;
  e.preventDefault();

  const rect = container.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const oldK = graphState.transform.k;
  const delta = e.deltaY > 0 ? 0.88 : 1.12;
  const newK = Math.max(0.1, Math.min(8, oldK * delta));

  // 以鼠标位置为中心缩放：保持鼠标指向的世界坐标不变
  graphState.transform.x = mouseX - (mouseX - graphState.transform.x) * (newK / oldK);
  graphState.transform.y = mouseY - (mouseY - graphState.transform.y) * (newK / oldK);
  graphState.transform.k = newK;

  renderGraph();
}, { passive: false });

// 拖拽画布平移
window.addEventListener('mousedown', (e) => {
  const svg = document.getElementById('graph-svg');
  if (!svg || !svg.contains(e.target)) return;
  if (e.target.classList.contains('graph-node')) {
    graphState.dragging = e.target.dataset.id;
  } else {
    graphState.dragging = 'canvas';
    graphState.dragOffset = { x: e.clientX, y: e.clientY };
  }
});
window.addEventListener('mousemove', (e) => {
  if (!graphState.dragging) return;
  if (graphState.dragging === 'canvas') {
    graphState.transform.x += e.clientX - graphState.dragOffset.x;
    graphState.transform.y += e.clientY - graphState.dragOffset.y;
    graphState.dragOffset = { x: e.clientX, y: e.clientY };
    renderGraph();
  } else {
    const node = graphState.nodes.find(n => n.id === graphState.dragging);
    if (node) {
      const rect = document.getElementById('graph-container').getBoundingClientRect();
      node.x = (e.clientX - rect.left - graphState.transform.x) / graphState.transform.k;
      node.y = (e.clientY - rect.top - graphState.transform.y) / graphState.transform.k;
      renderGraph();
    }
  }
});
window.addEventListener('mouseup', () => { graphState.dragging = null; });

// ---------------------------------------------------------------
// 业务流程与依赖知识图谱（SVG 力导向，精致渲染）
// ---------------------------------------------------------------
const BIZFLOW_NS = 'http://www.w3.org/2000/svg';
const BIZFLOW_EDGE_COLOR = {
  prereq: '#94a3b8', sequence: '#38bdf8', produces: '#34d399', context: '#fbbf24'
};
let bizflow = null;
let BIZFLOW_WIRED = false;

async function initBizflow() {
  const container = document.getElementById('bizflow-container');
  if (!container) return;
  if (bizflow && bizflow.raf) cancelAnimationFrame(bizflow.raf);
  try {
    const res = await apiGet('/business-graph');
    if (!res.success || !res.data) {
      container.innerHTML = '<div class="empty-state" style="padding:48px;text-align:center;">未找到业务图谱。请先生成 <code>business-flows.json</code>（节点/边/场景）并执行入库，写入 project-wiki。</div>';
      return;
    }
    bizflow = buildBizflowModel(res.data);
    renderBizflow();
    const sel = document.getElementById('bizflow-scenario');
    if (sel) sel.innerHTML = '<option value="">— 选择可测试场景高亮 —</option>' +
      bizflow.flows.map(f => `<option value="${f.id}">${escapeHtml(f.id)} · ${escapeHtml(f.name)}</option>`).join('');
    const st = document.getElementById('bizflow-status');
    if (st) st.textContent = `${bizflow.nodes.length} 节点 / ${bizflow.edges.length} 边 / ${bizflow.flows.length} 场景`;
    renderBizflowLegend();
  } catch (err) {
    container.innerHTML = '<div class="error-box">加载失败: ' + escapeHtml(err.message) + '</div>';
  }
}

function buildBizflowModel(data) {
  const domains = (data.domains || []).map(d => ({ id: d.id, name: d.name, color: d.color }));
  const domainMap = {};
  domains.forEach(d => domainMap[d.id] = d);
  const nodes = (data.nodes || []).map(n => ({
    id: n.id,
    domain: n.domain,
    title: n.title || n.label || n.id,
    method: n.method, path: n.path,
    api: n.api || (n.method && n.path ? n.method + ' ' + n.path : '—'),
    role: n.role || '', summary: n.summary || '',
    produces: n.produces || [], consumes: n.consumes || [],
    notes: n.notes || '',
    color: (domainMap[n.domain] && domainMap[n.domain].color) || '#888'
  }));
  const nodeMap = {};
  nodes.forEach(n => nodeMap[n.id] = n);
  const edges = (data.edges || []).map((e, i) => ({
    id: 'e' + i, from: e.from, to: e.to,
    type: e.type || 'sequence', label: e.label || '',
    color: BIZFLOW_EDGE_COLOR[e.type] || '#94a3b8'
  })).filter(e => nodeMap[e.from] && nodeMap[e.to]);
  const flows = (data.flows || []).map(f => ({
    id: f.id, name: f.name || f.id, description: f.description || '', steps: f.steps || []
  }));
  const neighbors = {};
  nodes.forEach(n => neighbors[n.id] = new Set());
  edges.forEach(e => { neighbors[e.from].add(e.to); neighbors[e.to].add(e.from); });
  nodes.forEach(n => n._deg = neighbors[n.id].size);
  return {
    meta: data.meta || {}, domains, domainMap, nodes, nodeMap, edges, flows, neighbors,
    tf: { x: 0, y: 0, k: 1 }, selected: null, highlight: null, scenario: null, filter: null,
    alpha: 1, raf: null, drag: null
  };
}

function renderBizflow() {
  const svg = document.getElementById('bizflow-svg');
  if (!svg || !bizflow) return;
  const w = svg.clientWidth || 900, h = svg.clientHeight || 640;
  bizflow.W = w; bizflow.H = h;
  if (bizflow.nodes[0] && bizflow.nodes[0].x === undefined) {
    const R = Math.min(w, h) * 0.42;
    bizflow.nodes.forEach((n, i) => {
      const a = (i / bizflow.nodes.length) * Math.PI * 2;
      n.x = w / 2 + R * Math.cos(a); n.y = h / 2 + R * Math.sin(a);
      n.vx = 0; n.vy = 0; n.fixed = false;
    });
  }
  drawBizflow();
  startBizflowSim();
}

function drawBizflow() {
  const svg = document.getElementById('bizflow-svg');
  if (!svg || !bizflow) return;
  svg.innerHTML = '';
  const defs = document.createElementNS(BIZFLOW_NS, 'defs');
  Object.keys(BIZFLOW_EDGE_COLOR).forEach(t => {
    const m = document.createElementNS(BIZFLOW_NS, 'marker');
    m.setAttribute('id', 'bf-arrow-' + t);
    m.setAttribute('viewBox', '0 0 10 10');
    m.setAttribute('refX', '9'); m.setAttribute('refY', '5');
    m.setAttribute('markerWidth', '7'); m.setAttribute('markerHeight', '7');
    m.setAttribute('orient', 'auto-start-reverse');
    const p = document.createElementNS(BIZFLOW_NS, 'path');
    p.setAttribute('d', 'M0,0 L10,5 L0,10 z');
    p.setAttribute('fill', BIZFLOW_EDGE_COLOR[t]);
    m.appendChild(p); defs.appendChild(m);
  });
  svg.appendChild(defs);
  const root = document.createElementNS(BIZFLOW_NS, 'g');
  root.setAttribute('id', 'bizflow-root');
  root.setAttribute('transform', `translate(${bizflow.tf.x},${bizflow.tf.y}) scale(${bizflow.tf.k})`);
  const eg = document.createElementNS(BIZFLOW_NS, 'g');
  const ng = document.createElementNS(BIZFLOW_NS, 'g');
  bizflow.edges.forEach(e => {
    const p = document.createElementNS(BIZFLOW_NS, 'path');
    p.setAttribute('class', 'bf-edge');
    p.setAttribute('data-id', e.id);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', e.color);
    p.setAttribute('marker-end', `url(#bf-arrow-${e.type})`);
    p.style.cursor = 'pointer';
    p.addEventListener('mouseenter', ev => showBizflowTooltip(`${e.from} → ${e.to} 〔${e.type}〕`, ev));
    p.addEventListener('mouseleave', hideBizflowTooltip);
    eg.appendChild(p);
  });
  bizflow.nodes.forEach(n => {
    const r = 12 + Math.min(9, n._deg || 0);
    const g = document.createElementNS(BIZFLOW_NS, 'g');
    g.setAttribute('class', 'bf-node');
    g.setAttribute('data-id', n.id);
    g.style.cursor = 'pointer';
    const c1 = document.createElementNS(BIZFLOW_NS, 'circle');
    c1.setAttribute('r', r); c1.setAttribute('fill', n.color); c1.setAttribute('fill-opacity', '0.18');
    c1.setAttribute('stroke', n.color); c1.setAttribute('stroke-width', '1.6');
    const c2 = document.createElementNS(BIZFLOW_NS, 'circle');
    c2.setAttribute('r', r * 0.42); c2.setAttribute('fill', n.color);
    const t1 = document.createElementNS(BIZFLOW_NS, 'text');
    t1.setAttribute('x', '0'); t1.setAttribute('y', r + 13); t1.setAttribute('text-anchor', 'middle');
    t1.setAttribute('font-size', '11'); t1.style.fontWeight = '600'; t1.style.fill = 'var(--text)';
    t1.style.pointerEvents = 'none'; t1.textContent = n.id;
    const t2 = document.createElementNS(BIZFLOW_NS, 'text');
    const lbl = n.title.length > 9 ? n.title.slice(0, 8) + '…' : n.title;
    t2.setAttribute('x', '0'); t2.setAttribute('y', r + 25); t2.setAttribute('text-anchor', 'middle');
    t2.setAttribute('font-size', '10'); t2.style.fill = 'var(--text-muted)';
    t2.style.pointerEvents = 'none'; t2.textContent = lbl;
    g.appendChild(c1); g.appendChild(c2); g.appendChild(t1); g.appendChild(t2);
    g.addEventListener('mouseenter', ev => { onBizflowHover(n.id, ev); });
    g.addEventListener('mouseleave', onBizflowHoverEnd);
    g.addEventListener('click', ev => { ev.stopPropagation(); bizflowSelectNode(n.id); });
    ng.appendChild(g);
  });
  root.appendChild(eg); root.appendChild(ng); svg.appendChild(root);
  svg.addEventListener('mousedown', onBizDown);
  svg.addEventListener('wheel', onBizWheel, { passive: false });
  if (!BIZFLOW_WIRED) {
    window.addEventListener('mousemove', onBizMove);
    window.addEventListener('mouseup', onBizUp);
    BIZFLOW_WIRED = true;
  }
  updateBizflow();
}

function bizflowVisible() {
  const bright = new Set(bizflow.nodes.map(n => n.id));
  let hlEdges = new Set();
  if (bizflow.highlight) {
    bright.clear(); bright.add(bizflow.highlight);
    bizflow.neighbors[bizflow.highlight].forEach(id => bright.add(id));
  }
  if (bizflow.scenario) {
    const f = bizflow.flows.find(x => x.id === bizflow.scenario);
    bright.clear();
    if (f) {
      f.steps.forEach(s => bright.add(s));
      for (let i = 0; i < f.steps.length - 1; i++) {
        const a = f.steps[i], b = f.steps[i + 1];
        const e = bizflow.edges.find(e => (e.from === a && e.to === b) || (e.from === b && e.to === a));
        if (e) hlEdges.add(e.id);
      }
    }
  }
  if (bizflow.filter) {
    const q = bizflow.filter.toLowerCase();
    bright.clear();
    bizflow.nodes.forEach(n => {
      if (n.id.toLowerCase().includes(q) || n.title.toLowerCase().includes(q)) bright.add(n.id);
    });
  }
  return { bright, hlEdges };
}

function updateBizflow() {
  const svg = document.getElementById('bizflow-svg');
  if (!svg || !bizflow) return;
  const root = document.getElementById('bizflow-root');
  if (root) root.setAttribute('transform', `translate(${bizflow.tf.x},${bizflow.tf.y}) scale(${bizflow.tf.k})`);
  const { bright, hlEdges } = bizflowVisible();
  bizflow.edges.forEach(e => {
    const a = bizflow.nodeMap[e.from], b = bizflow.nodeMap[e.to];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const off = 16;
    const cx = (a.x + b.x) / 2 - (dy / len) * off;
    const cy = (a.y + b.y) / 2 + (dx / len) * off;
    const p = svg.querySelector(`.bf-edge[data-id="${e.id}"]`);
    if (!p) return;
    p.setAttribute('d', `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`);
    const dim = !(bright.has(e.from) && bright.has(e.to));
    const hl = hlEdges.has(e.id);
    p.setAttribute('stroke-width', hl ? 2.6 : 1.3);
    p.setAttribute('stroke-opacity', dim ? 0.06 : (hl ? 1 : 0.55));
    p.style.filter = hl ? 'drop-shadow(0 0 4px ' + e.color + ')' : 'none';
  });
  bizflow.nodes.forEach(n => {
    const g = svg.querySelector(`.bf-node[data-id="${n.id}"]`);
    if (!g) return;
    g.setAttribute('transform', `translate(${n.x},${n.y})`);
    const dim = !bright.has(n.id);
    const hl = bizflow.highlight === n.id;
    const sel = bizflow.selected === n.id;
    g.setAttribute('opacity', dim ? 0.16 : 1);
    const c1 = g.firstChild;
    c1.setAttribute('stroke-width', sel ? 3 : (hl ? 2.6 : 1.6));
    c1.setAttribute('fill-opacity', hl || sel ? 0.32 : 0.18);
  });
}

function startBizflowSim() {
  if (bizflow.raf) cancelAnimationFrame(bizflow.raf);
  bizflow.alpha = 1;
  const step = () => {
    simulateBizflow();
    updateBizflow();
    if (bizflow.alpha > 0.02) {
      bizflow.alpha *= 0.985;
      bizflow.raf = requestAnimationFrame(step);
    }
  };
  bizflow.raf = requestAnimationFrame(step);
}

function simulateBizflow() {
  const nodes = bizflow.nodes, edges = bizflow.edges, k = 150, cx = bizflow.W / 2, cy = bizflow.H / 2;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = Math.random(); dy = Math.random(); d2 = dx * dx + dy * dy; }
      const d = Math.sqrt(d2);
      const f = (k * k) / d2 * 0.5;
      const fx = dx / d * f, fy = dy / d * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
  }
  edges.forEach(e => {
    const a = bizflow.nodeMap[e.from], b = bizflow.nodeMap[e.to];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d - k) * 0.02;
    const fx = dx / d * f, fy = dy / d * f;
    a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
  });
  nodes.forEach(n => { n.vx += (cx - n.x) * 0.003; n.vy += (cy - n.y) * 0.003; });
  const damp = 0.85, alpha = bizflow.alpha;
  nodes.forEach(n => {
    if (n.fixed) { n.vx = 0; n.vy = 0; return; }
    n.x += n.vx * alpha; n.y += n.vy * alpha;
    n.vx *= damp; n.vy *= damp;
  });
}

function onBizDown(e) {
  if (!bizflow) return;
  const nodeG = e.target.closest && e.target.closest('.bf-node');
  const rect = document.getElementById('bizflow-svg').getBoundingClientRect();
  if (nodeG) {
    const id = nodeG.dataset.id;
    bizflow.nodeMap[id].fixed = true;
    bizflow.drag = { type: 'node', id, rect };
  } else {
    bizflow.drag = { type: 'canvas', x: e.clientX, y: e.clientY };
    e.currentTarget.style.cursor = 'grabbing';
  }
}

function onBizMove(e) {
  if (!bizflow || !bizflow.drag) return;
  const rect = document.getElementById('bizflow-svg').getBoundingClientRect();
  if (bizflow.drag.type === 'node') {
    const n = bizflow.nodeMap[bizflow.drag.id];
    n.x = (e.clientX - rect.left - bizflow.tf.x) / bizflow.tf.k;
    n.y = (e.clientY - rect.top - bizflow.tf.y) / bizflow.tf.k;
    bizflow.alpha = Math.max(bizflow.alpha, 0.3);
    updateBizflow();
  } else {
    bizflow.tf.x += e.clientX - bizflow.drag.x;
    bizflow.tf.y += e.clientY - bizflow.drag.y;
    bizflow.drag.x = e.clientX; bizflow.drag.y = e.clientY;
    updateBizflow();
  }
}

function onBizUp() {
  if (!bizflow) return;
  if (bizflow.drag && bizflow.drag.type === 'node') bizflow.nodeMap[bizflow.drag.id].fixed = false;
  bizflow.drag = null;
  const svg = document.getElementById('bizflow-svg');
  if (svg) svg.style.cursor = 'grab';
}

function onBizWheel(e) {
  if (!bizflow) return;
  e.preventDefault();
  const rect = e.currentTarget.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const oldK = bizflow.tf.k;
  const newK = Math.max(0.3, Math.min(3, oldK * (e.deltaY < 0 ? 1.12 : 0.89)));
  bizflow.tf.x = mx - (mx - bizflow.tf.x) * (newK / oldK);
  bizflow.tf.y = my - (my - bizflow.tf.y) * (newK / oldK);
  bizflow.tf.k = newK;
  updateBizflow();
}

function onBizflowHover(id, e) {
  if (!bizflow) return;
  bizflow.highlight = id;
  updateBizflow();
  const n = bizflow.nodeMap[id];
  showBizflowTooltip(`${id} · ${n.title}`, e);
}

function onBizflowHoverEnd() {
  if (!bizflow) return;
  bizflow.highlight = null;
  updateBizflow();
  hideBizflowTooltip();
}

function bizflowSelectNode(id) {
  if (!bizflow) return;
  bizflow.selected = id;
  updateBizflow();
  const el = document.getElementById('bizflow-detail');
  if (!id) { el.style.display = 'none'; return; }
  const n = bizflow.nodeMap[id];
  const deps = [...bizflow.neighbors[id]];
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
      <h3 style="margin:0;font-size:15px;line-height:1.3;">${escapeHtml(n.id)} · ${escapeHtml(n.title)}</h3>
      <button class="btn btn-secondary btn-sm" onclick="bizflowSelectNode(null)">×</button>
    </div>
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
      <span class="tag" style="background:${n.color}33;color:${n.color};">${escapeHtml(n.domain)}</span>
      ${n.role ? `<span class="tag">${escapeHtml(n.role)}</span>` : ''}
    </div>
    <dl style="margin:12px 0 0;font-size:12px;line-height:1.7;">
      <dt style="color:var(--text-muted)">接口</dt><dd style="margin:0 0 6px;"><code>${escapeHtml(n.api)}</code></dd>
      <dt style="color:var(--text-muted)">摘要</dt><dd style="margin:0 0 6px;">${escapeHtml(n.summary)}</dd>
      ${n.produces.length ? `<dt style="color:var(--text-muted)">产出</dt><dd style="margin:0 0 6px;">${n.produces.map(escapeHtml).join('、')}</dd>` : ''}
      ${n.consumes.length ? `<dt style="color:var(--text-muted)">前置资源</dt><dd style="margin:0 0 6px;">${n.consumes.map(escapeHtml).join('、')}</dd>` : ''}
      <dt style="color:var(--text-muted)">直接依赖 / 被依赖</dt><dd style="margin:0;">${deps.length ? escapeHtml(deps.join('、')) : '(无)'}</dd>
      ${n.notes ? `<dt style="color:var(--text-muted);margin-top:6px;">备注</dt><dd style="margin:0;">${escapeHtml(n.notes)}</dd>` : ''}
    </dl>`;
  el.style.display = 'block';
}

function bizflowHighlightScenario(flowId) {
  if (!bizflow) return;
  bizflow.scenario = flowId || null;
  updateBizflow();
}

function bizflowFilter(q) {
  if (!bizflow) return;
  bizflow.filter = q.trim() || null;
  updateBizflow();
}

function bizflowReset() {
  if (!bizflow) return;
  bizflow.highlight = null; bizflow.scenario = null; bizflow.filter = null; bizflow.selected = null;
  bizflow.tf = { x: 0, y: 0, k: 1 };
  const el = document.getElementById('bizflow-detail'); if (el) el.style.display = 'none';
  const sf = document.getElementById('bizflow-search'); if (sf) sf.value = '';
  const sc = document.getElementById('bizflow-scenario'); if (sc) sc.value = '';
  bizflow.alpha = 0.5;
  updateBizflow();
}

function renderBizflowLegend() {
  const el = document.getElementById('bizflow-legend');
  if (!el || !bizflow) return;
  let html = '<div style="font-weight:600;margin-bottom:4px;color:var(--text);">业务域</div>';
  bizflow.domains.forEach(d => {
    html += `<div style="display:flex;align-items:center;gap:7px;"><span style="width:10px;height:10px;border-radius:50%;background:${d.color};display:inline-block;"></span>${escapeHtml(d.id)} · ${escapeHtml(d.name)}</div>`;
  });
  html += '<div style="font-weight:600;margin:8px 0 4px;color:var(--text);">依赖类型</div>';
  const labels = { prereq: '前置', sequence: '顺序', produces: '产出', context: '上下文' };
  Object.keys(BIZFLOW_EDGE_COLOR).forEach(t => {
    html += `<div style="display:flex;align-items:center;gap:7px;"><span style="width:18px;height:0;border-top:2px solid ${BIZFLOW_EDGE_COLOR[t]};display:inline-block;"></span>${labels[t]}</div>`;
  });
  el.innerHTML = html;
}

function showBizflowTooltip(text, e) {
  const tip = document.getElementById('bizflow-tooltip');
  if (!tip) return;
  const rect = document.getElementById('bizflow-container').getBoundingClientRect();
  tip.textContent = text;
  tip.style.display = 'block';
  tip.style.left = (e.clientX - rect.left + 12) + 'px';
  tip.style.top = (e.clientY - rect.top + 12) + 'px';
}

function hideBizflowTooltip() {
  const tip = document.getElementById('bizflow-tooltip');
  if (tip) tip.style.display = 'none';
}
