/**
 * KnowledgeOS Web UI - 真实 API 版本
 * ================================
 * 从 mock 数据切换到真实 REST API 调用。
 * API 基地址: http://localhost:3000/api
 */

const API_BASE = 'http://localhost:3000/api';

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
  }
}

function updateThemeIcon() {
  // 图标通过 CSS .icon-moon / .icon-sun 控制显示，无需 JS 操作
}

// 通用 API 请求封装
async function apiGet(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`);
  return res.json();
}

async function apiPost(endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
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
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    body: formData
  });
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
  stats: {},
  loading: false,
  auditPage: 1,
  auditFilter: {},
  // 列表分页状态（客户端分页，默认每页 20 条）
  pager: {
    drafts: { page: 1, size: 20 },
    conflicts: { page: 1, size: 20 },
    brain: { page: 1, size: 20 }
  },
  auditSize: 20,
  brainFilter: { category: 'all', kw: '' }
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
          <div class="card"><h3>待处理冲突</h3><div class="value">${stats.pendingConflicts || 0}</div><div class="trend">需人工决策</div></div>
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
      const res = await apiGet('/brain/pages?limit=1000');
      const pages = res.success ? res.data : [];
      appState.brainPages = pages;

      // 应用分类 + 关键词筛选
      const f = appState.brainFilter || { category: 'all', kw: '' };
      const kw = (f.kw || '').toLowerCase();
      const filtered = pages.filter(p => {
        if (f.category && f.category !== 'all' && p.category !== f.category) return false;
        if (kw && !(`${p.id} ${p.title} ${p.category} ${p.preview}`.toLowerCase().includes(kw))) return false;
        return true;
      });

      // 客户端分页
      const pager = appState.pager.brain;
      const totalPages = Math.max(1, Math.ceil(filtered.length / pager.size));
      if (pager.page > totalPages) pager.page = totalPages;
      const start = (pager.page - 1) * pager.size;
      const pageItems = filtered.slice(start, start + pager.size);

      return `
        <div class="search-bar">
          <input type="text" id="brain-search" placeholder="搜索知识库页面..." value="${escapeHtml(f.kw || '')}" oninput="searchBrain()">
        </div>
        <div class="tabs">
          <div class="tab ${f.category === 'all' ? 'active' : ''}" onclick="filterBrain('all')">全部</div>
          <div class="tab ${f.category === 'quality-rules' ? 'active' : ''}" onclick="filterBrain('quality-rules')">质量规则</div>
          <div class="tab ${f.category === 'test-cases' ? 'active' : ''}" onclick="filterBrain('test-cases')">历史用例</div>
          <div class="tab ${f.category === 'defect-experience' ? 'active' : ''}" onclick="filterBrain('defect-experience')">缺陷经验</div>
          <div class="tab ${f.category === 'project-wiki' ? 'active' : ''}" onclick="filterBrain('project-wiki')">项目 Wiki</div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>标题</th><th>分类</th><th>预览</th></tr></thead>
            <tbody id="brain-table">
              ${pageItems.map(p => `
                <tr>
                  <td>${p.id}</td>
                  <td><a href="javascript:void(0)" onclick="showPageDetail('${p.category}', '${p.id}');return false;">${p.title}</a></td>
                  <td>${p.category}</td>
                  <td>${p.preview.slice(0, 60)}...</td>
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

      // 更新徽章
      const pendingCount = drafts.filter(d => d.status === 'pending').length;
      document.getElementById('draft-badge').textContent = pendingCount;

      // 客户端分页
      const pager = appState.pager.drafts;
      const totalPages = Math.max(1, Math.ceil(drafts.length / pager.size));
      if (pager.page > totalPages) pager.page = totalPages;
      const start = (pager.page - 1) * pager.size;
      const pageItems = drafts.slice(start, start + pager.size);

      return `
        <div class="section">
          <h3 class="section-title">待入库草稿（${drafts.length}）</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>来源</th><th>类型</th><th>标题</th><th>评分</th><th>创建时间</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                ${pageItems.map(d => `
                  <tr>
                    <td>${d.id}</td>
                    <td>${d.source === 'human_edit' ? '人工编辑' : d.source === 'execution_feedback' ? '执行回流' : d.source}</td>
                    <td>${typeLabel(d.type)}</td>
                    <td><a href="#" onclick="showDraftDetail('${d.id}');return false;">${d.title}</a></td>
                    <td>${d.qualityScore !== null && d.qualityScore !== undefined ? `<span style="font-weight:600;color:${d.qualityScore >= 60 ? 'var(--success)' : d.qualityScore >= 40 ? 'var(--warning)' : 'var(--danger)'}">${d.qualityScore}</span>` : '-'}</td>
                    <td>${d.created_at || '-'}</td>
                    <td><span class="tag tag-${d.status}">${d.status}</span></td>
                    <td>
                      <button class="btn btn-primary btn-sm" onclick="commitDraft('${d.id}')">入库</button>
                      <button class="btn btn-secondary btn-sm" onclick="discardDraft('${d.id}')">丢弃</button>
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
        <div class="section">
          <button class="btn btn-primary" onclick="batchCommit()">批量确认入库</button>
          <button class="btn btn-secondary" onclick="detectConflicts()">触发冲突检测</button>
          <button class="btn btn-secondary" onclick="runQualityGate()">运行质量门控</button>
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
          <div class="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>关联草稿</th><th>冲突类型</th><th>现有规则</th><th>新规则</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                ${pageItems.map(c => `
                  <tr>
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
      const modChecked = graphState.showModules ? 'checked' : '';
      const funcChecked = graphState.showFunctions ? 'checked' : '';
      const simChecked = graphState.showSimilar ? 'checked' : '';
      const hideIsoChecked = graphState.hideIsolated ? 'checked' : '';
      return `
        <div class="section">
          <h3 class="section-title">API 依赖图谱</h3>
          <div style="display:flex;gap:12px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">
            <label style="font-size:13px;color:var(--text-muted);white-space:nowrap;"><input type="checkbox" id="graph-show-modules" ${modChecked} onchange="renderGraph()"> 显示模块</label>
            <label style="font-size:13px;color:var(--text-muted);white-space:nowrap;"><input type="checkbox" id="graph-show-functions" ${funcChecked} onchange="renderGraph()"> 显示函数</label>
            <label style="font-size:13px;color:var(--text-muted);white-space:nowrap;"><input type="checkbox" id="graph-show-similar" ${simChecked} onchange="renderGraph()"> 显示相似关系</label>
            <label style="font-size:13px;color:var(--text-muted);white-space:nowrap;"><input type="checkbox" id="graph-hide-isolated" ${hideIsoChecked} onchange="renderGraph()"> 隐藏孤立节点</label>
            <button class="btn btn-secondary btn-sm" onclick="resetGraphView()">重置视图</button>
            <span style="font-size:12px;color:var(--text-muted);margin-left:auto;">滚轮缩放 · 拖拽节点 · 点击查看详情</span>
          </div>
          <div id="graph-container" style="background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden;position:relative;height:600px;">
            <svg id="graph-svg" style="width:100%;height:100%;cursor:grab;"></svg>
            <div id="graph-tooltip" style="position:absolute;display:none;background:var(--card-solid);color:var(--text);padding:6px 12px;border-radius:8px;font-size:12px;pointer-events:none;z-index:10;border:1px solid var(--border);box-shadow:var(--shadow);font-weight:500;"></div>
          </div>
          <div style="display:flex;gap:16px;margin-top:10px;font-size:12px;color:var(--text-muted);">
            <span><span style="display:inline-block;width:10px;height:10px;background:#00d4ff;border-radius:50%;margin-right:4px;"></span>模块</span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#8b9bb4;border-radius:50%;margin-right:4px;"></span>函数</span>
            <span><span style="display:inline-block;width:20px;height:2px;background:#5a6a82;margin-right:4px;vertical-align:middle;"></span>调用</span>
            <span><span style="display:inline-block;width:20px;height:2px;background:#ffaa00;margin-right:4px;vertical-align:middle;"></span>相似</span>
            <span><span style="display:inline-block;width:20px;height:2px;background:#00d4ff;border-bottom:1px dashed #00d4ff;margin-right:4px;vertical-align:middle;"></span>模块间调用</span>
          </div>
        </div>
      `;
    } catch (err) {
      return errorBox('加载图谱失败: ' + err.message);
    }
  },

  verify: () => `
    <div class="section">
      <h3 class="section-title">验证性推理测试</h3>
      <p style="color:var(--text-muted);margin-bottom:16px;">输入问题，调用知识库做单次检索验证。</p>
      <div class="search-bar">
        <input type="text" id="verify-input" placeholder="例如：用户登录接口需要校验哪些边界条件？">
        <button class="btn btn-primary" onclick="runVerify()">执行检索</button>
      </div>
      <div id="verify-result"></div>
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
                    <td>${a.createdAt || '-'}</td>
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
      const [draftsRes, statsRes] = await Promise.all([
        apiGet('/drafts?limit=200'),
        apiGet('/stats')
      ]);
      const drafts = draftsRes.success ? draftsRes.data : [];
      const stats = statsRes.success ? statsRes.data : {};

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

      // 类型覆盖率
      const typeCounts = {};
      drafts.forEach(d => { typeCounts[d.type] = (typeCounts[d.type] || 0) + 1; });
      const typeLabels = { quality_rule: '质量规则', test_case: '测试用例', defect_experience: '缺陷经验', project_wiki: '项目 Wiki' };
      const coverageHtml = Object.entries(typeCounts).map(([t, count]) => `
        <div class="card" style="padding:14px;text-align:center;">
          <div style="font-size:24px;font-weight:600;color:var(--primary);">${count}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${typeLabels[t] || t}</div>
        </div>
      `).join('');

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
        apiGet('/audit-log?limit=50'),
        apiGet('/brain/pages?limit=200')
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
        const day = (a.createdAt || '').slice(0, 10);
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

      // Brain 页面分类统计
      const brainCats = {};
      brainPages.forEach(p => { brainCats[p.category] = (brainCats[p.category] || 0) + 1; });
      const brainStatHtml = Object.entries(brainCats).map(([cat, count]) => `
        <div class="card" style="padding:14px;text-align:center;">
          <div style="font-size:22px;font-weight:600;">${count}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${cat}</div>
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
  }
};

const titles = {
  dashboard: '概览',
  brain: '知识库浏览',
  drafts: '草稿审核',
  conflicts: '冲突处理',
  graph: '图谱可视化',
  verify: '推理验证',
  audit: '审计日志',
  quality: '质量监控',
  dashboardStats: '审计大盘'
};

// ---------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------

function typeLabel(type) {
  const map = {
    'quality_rule': '质量规则',
    'defect_experience': '缺陷经验',
    'test_case': '测试用例',
    'project_wiki': '项目 Wiki'
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
      // graph 页面渲染后自动初始化力导向图
      if (page === 'graph') {
        setTimeout(() => renderGraph(), 50);
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

async function batchCommit() {
  if (!confirm('确定批量入库所有 pending/approved 草稿吗？')) return;
  try {
    const res = await apiPost('/drafts/batch-commit', {});
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
    const res = await apiGet(`/brain/pages/${category}/${id}`);
    if (!res.success) throw new Error(res.error);
    const content = res.data.content;

    document.getElementById('content').innerHTML = `
      <div class="page-detail">
        <pre style="white-space:pre-wrap;font-family:monospace;background:var(--bg-light);padding:16px;border-radius:8px;">${escapeHtml(content)}</pre>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-secondary" onclick="renderPage('${returnPage}')">返回${returnPage === 'graph' ? '图谱' : '列表'}</button>
          ${returnPage !== 'graph' ? '<button class="btn btn-secondary" onclick="renderPage(\'graph\')">返回图谱</button>' : ''}
        </div>
      </div>
    `;
  } catch (err) {
    alert('加载页面详情失败: ' + err.message);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function searchBrain() {
  const kw = document.getElementById('brain-search').value;
  appState.brainFilter.kw = kw;
  appState.pager.brain.page = 1;
  renderPage('brain');
}

function filterBrain(category) {
  appState.brainFilter.category = category;
  appState.pager.brain.page = 1;
  renderPage('brain');
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

async function runVerify() {
  const input = document.getElementById('verify-input').value;
  if (!input.trim()) { alert('请输入测试问题'); return; }

  const resultBox = document.getElementById('verify-result');
  resultBox.innerHTML = '<div class="loading">检索中...</div>';

  try {
    const res = await apiPost('/search', { query: input, mode: 'keyword', limit: 10 });
    const results = res.success ? res.data : [];

    resultBox.innerHTML = `
      <div class="result-box">
        <h4>检索结果</h4>
        <p><strong>问题：</strong>${escapeHtml(input)}</p>
        <ul style="margin-top:12px;padding-left:20px;">
          ${results.length ? results.map(r => `<li>${escapeHtml(r.title || r.id || JSON.stringify(r))}</li>`).join('') : '<li>未找到相关结果</li>'}
        </ul>
      </div>
    `;
  } catch (err) {
    resultBox.innerHTML = errorBox('检索失败: ' + err.message);
  }
}

// ---------------------------------------------------------------
// 导入弹窗
// ---------------------------------------------------------------
const importModal = document.getElementById('import-modal');
document.getElementById('btn-import').addEventListener('click', () => importModal.classList.add('show'));
document.getElementById('close-import').addEventListener('click', () => importModal.classList.remove('show'));
document.getElementById('cancel-import').addEventListener('click', () => importModal.classList.remove('show'));

// 根据数据类型动态更新文件接受类型与提示
function syncImportHint() {
  const type = document.getElementById('import-type').value;
  const fileInput = document.getElementById('import-file');
  const hint = document.getElementById('import-hint');
  if (type === 'code') {
    fileInput.accept = '.zip,.tar,.tgz,.tar.gz,.tar.bz2,.tar.xz,.7z,.py,.js,.ts,.java';
    hint.textContent = '支持上传压缩包（.zip / .tar.gz / .tgz / .tar.bz2 / .tar.xz / .7z，自动解压并解析）或单个代码文件（.py/.js/.ts/.java）。解析后将自动提取接口与调用关系并生成草稿。';
  } else {
    fileInput.accept = '';
    hint.textContent = '上传文件内容将作为文本直接存入草稿，可上传 .md/.txt/.json 等文本文件。';
  }
}
document.getElementById('import-type').addEventListener('change', syncImportHint);
syncImportHint();

document.getElementById('confirm-import').addEventListener('click', async () => {
  const type = document.getElementById('import-type').value;
  const fileInput = document.getElementById('import-file');
  const note = document.getElementById('import-note').value;

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
      res = await apiUpload('/source-upload', fd);
    } else {
      // 其它类型：读取为文本后以 JSON 写入
      const content = await fileInput.files[0].text();
      res = await apiPost('/source-upload', { type, content, note });
    }

    if (res.success) {
      const d = res.data || {};
      const detail = (d.files !== undefined)
        ? `代码解析完成：\n- 文件 ${d.files} 个\n- 接口 ${d.interfaces} 个\n- 调用关系 ${d.dependencies} 个\n- 生成草稿 ${d.draftsCreated} 条\n- 图谱页面 ${d.graphPages} 个`
        : `导入成功: ${d.id}`;
      alert(detail);
      importModal.classList.remove('show');
      renderPage('drafts');
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
// 路由
// ---------------------------------------------------------------
function route() {
  const hash = location.hash.replace('#', '') || 'dashboard';
  renderPage(hash);
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  route();
});

// ---------------------------------------------------------------
// 图谱可视化（SVG 力导向图）
// ---------------------------------------------------------------
let graphState = {
  nodes: [], edges: [], simNodes: [], simEdges: [],
  transform: { x: 0, y: 0, k: 1 },
  dragging: null, dragOffset: { x: 0, y: 0 },
  showModules: true, showFunctions: true, showSimilar: false,
  hideIsolated: false,
  needsFitView: true
};

async function renderGraph() {
  const svg = document.getElementById('graph-svg');
  if (!svg) return;
  const container = document.getElementById('graph-container');
  const viewW = container.clientWidth;
  const viewH = container.clientHeight;

  // 获取数据（只加载一次）
  if (!graphState.nodes.length) {
    try {
      const res = await apiGet('/graph-data');
      if (!res.success) throw new Error(res.error);
      const data = res.data;
      graphState.nodes = initializeNodePositions(data.nodes);
      graphState.edges = data.edges;
    } catch (err) {
      svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="#8b9bb4">加载图谱数据失败: ${escapeHtml(err.message)}</text>`;
      return;
    }
  }

  graphState.showModules = document.getElementById('graph-show-modules')?.checked ?? graphState.showModules;
  graphState.showFunctions = document.getElementById('graph-show-functions')?.checked ?? graphState.showFunctions;
  graphState.showSimilar = document.getElementById('graph-show-similar')?.checked ?? graphState.showSimilar;
  graphState.hideIsolated = document.getElementById('graph-hide-isolated')?.checked ?? graphState.hideIsolated;

  // 过滤节点和边
  let visibleNodes = new Map();
  for (const n of graphState.nodes) {
    if (n.type === 'module' && graphState.showModules) visibleNodes.set(n.id, n);
    else if (n.type === 'function' && graphState.showFunctions) visibleNodes.set(n.id, n);
  }

  const visibleEdges = graphState.edges.filter(e => {
    if (!visibleNodes.has(e.source) || !visibleNodes.has(e.target)) return false;
    if (e.type === 'similar' && !graphState.showSimilar) return false;
    return true;
  });

  // 隐藏孤立节点（没有任何边连接的节点）
  if (graphState.hideIsolated) {
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
  const colors = { module: isLight ? '#0088cc' : '#00d4ff', function: isLight ? '#5a6a82' : '#8b9bb4' };
  const edgeColors = { call: isLight ? '#8b9bb4' : '#5a6a82', similar: '#ffaa00', module_call: isLight ? '#0088cc' : '#00d4ff' };
  const graphBg = isLight ? '#f0f2f5' : '#0a1628';
  const labelColor = isLight ? '#1a1a2e' : '#e0e6ed';

  // 箭头 marker 定义
  let svgHtml = `
    <defs>
      <marker id="arrow-call" markerWidth="5" markerHeight="4" refX="4.5" refY="2" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L5,2 L0,4 L1.5,2 Z" fill="${edgeColors.call}" />
      </marker>
      <marker id="arrow-similar" markerWidth="5" markerHeight="4" refX="4.5" refY="2" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L5,2 L0,4 L1.5,2 Z" fill="#ffaa00" />
      </marker>
      <marker id="arrow-module" markerWidth="5" markerHeight="4" refX="4.5" refY="2" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L5,2 L0,4 L1.5,2 Z" fill="${edgeColors.module_call}" />
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
    const dash = e.type === 'module_call' ? 'stroke-dasharray="4,4"' : '';
    const marker = e.type === 'similar' ? 'url(#arrow-similar)' : e.type === 'module_call' ? 'url(#arrow-module)' : 'url(#arrow-call)';
    // 计算箭头终点偏移（避免箭头被节点遮挡）
    const dx = nb.x - na.x;
    const dy = nb.y - na.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
    const targetR = nb.type === 'module' ? 20 : 8;
    const endX = nb.x - (dx / dist) * targetR;
    const endY = nb.y - (dy / dist) * targetR;
    svgHtml += `<line class="graph-edge" data-source="${e.source}" data-target="${e.target}" data-type="${e.type}" x1="${na.x.toFixed(1)}" y1="${na.y.toFixed(1)}" x2="${endX.toFixed(1)}" y2="${endY.toFixed(1)}" stroke="${stroke}" stroke-width="${e.type === 'module_call' ? 2 : 1}" opacity="0.6" marker-end="${marker}" ${dash} />`;
  }

  // 节点
  for (const n of nodes) {
    const r = n.type === 'module' ? 18 : 6;
    const color = colors[n.type] || '#999';
    svgHtml += `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${r}" fill="${color}" stroke="${graphBg}" stroke-width="2" class="graph-node" data-id="${n.id}" style="cursor:pointer;" />`;
    if (n.type === 'module' || n.label.length < 20) {
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
      if (node.type === 'module') {
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
