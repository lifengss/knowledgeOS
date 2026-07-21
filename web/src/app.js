/**
 * KnowledgeOS Web UI - 真实 API 版本
 * ================================
 * 从 mock 数据切换到真实 REST API 调用。
 * API 基地址: http://localhost:3000/api
 */

const API_BASE = 'http://localhost:3000/api';

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

// 状态管理
let appState = {
  drafts: [],
  conflicts: [],
  auditLogs: [],
  brainPages: [],
  stats: {},
  loading: false,
  auditPage: 1,
  auditFilter: {}
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
      const audit = auditRes.success ? auditRes.data : [];

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
      const res = await apiGet('/brain/pages?limit=100');
      const pages = res.success ? res.data : [];
      appState.brainPages = pages;

      return `
        <div class="search-bar">
          <input type="text" id="brain-search" placeholder="搜索知识库页面..." oninput="searchBrain()">
        </div>
        <div class="tabs">
          <div class="tab active" onclick="filterBrain('all')">全部</div>
          <div class="tab" onclick="filterBrain('quality-rules')">质量规则</div>
          <div class="tab" onclick="filterBrain('test-cases')">历史用例</div>
          <div class="tab" onclick="filterBrain('defect-experience')">缺陷经验</div>
          <div class="tab" onclick="filterBrain('project-wiki')">项目 Wiki</div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>标题</th><th>分类</th><th>预览</th></tr></thead>
            <tbody id="brain-table">
              ${pages.map(p => `
                <tr>
                  <td>${p.id}</td>
                  <td><a href="#" onclick="showPageDetail('${p.category}', '${p.id}')">${p.title}</a></td>
                  <td>${p.category}</td>
                  <td>${p.preview.slice(0, 60)}...</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      return errorBox('加载知识库失败: ' + err.message);
    }
  },

  drafts: async () => {
    try {
      const res = await apiGet('/drafts?limit=100');
      const drafts = res.success ? res.data : [];
      appState.drafts = drafts;

      // 更新徽章
      const pendingCount = drafts.filter(d => d.status === 'pending').length;
      document.getElementById('draft-badge').textContent = pendingCount;

      return `
        <div class="section">
          <h3 class="section-title">待入库草稿（${drafts.length}）</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>来源</th><th>类型</th><th>标题</th><th>评分</th><th>创建时间</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                ${drafts.map(d => `
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
      const res = await apiGet('/conflicts?limit=100');
      const conflicts = res.success ? res.data : [];
      appState.conflicts = conflicts;

      // 更新徽章（未处理冲突数）
      const pendingCount = conflicts.filter(c => !c.resolution).length;
      document.getElementById('conflict-badge').textContent = pendingCount;

      return `
        <div class="section">
          <h3 class="section-title">冲突队列（${conflicts.length}）</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>关联草稿</th><th>冲突类型</th><th>现有规则</th><th>新规则</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                ${conflicts.map(c => `
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
        </div>
      `;
    } catch (err) {
      return errorBox('加载冲突失败: ' + err.message);
    }
  },

  graph: () => `
    <div class="section">
      <h3 class="section-title">API 依赖图谱</h3>
      <div class="graph-placeholder">
        <p>图谱可视化区域</p>
        <p style="font-size:13px;color:var(--text-muted);">V1.0 使用静态示意，后续接入 D3.js 渲染</p>
      </div>
    </div>
  `,

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
      const pageSize = 10;
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
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
            <span style="font-size:13px;color:var(--text-muted);">第 ${result.page || page} / ${totalPages} 页</span>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="changeAuditPage(${page - 1})">上一页</button>
              <button class="btn btn-secondary btn-sm" ${page >= totalPages ? 'disabled' : ''} onclick="changeAuditPage(${page + 1})">下一页</button>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      return errorBox('加载审计日志失败: ' + err.message);
    }
  },

  dashboardStats: async () => {
    try {
      const res = await apiGet('/stats');
      const s = res.success ? res.data : {};

      return `
        <div class="section">
          <h3 class="section-title">监控大盘</h3>
          <div class="grid" style="margin-bottom:24px;">
            <div class="card"><h3>总入库数</h3><div class="value">${s.totalCommits || 0}</div><div class="trend">今日 +${s.todayCommits || 0}</div></div>
            <div class="card"><h3>本周入库</h3><div class="value">${s.weekCommits || 0}</div></div>
            <div class="card"><h3>草稿堆积</h3><div class="value">${s.pendingDrafts || 0}</div></div>
            <div class="card"><h3>待处理冲突</h3><div class="value">${s.totalConflicts || 0}</div></div>
            <div class="card"><h3>平均质量分</h3><div class="value">${s.qualityScoreAvg || 0}</div></div>
            <div class="card"><h3>总检索数</h3><div class="value">${s.totalSearches || 0}</div><div class="trend">今日 +${s.todaySearches || 0}</div></div>
          </div>
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
  audit: '质量监控',
  dashboardStats: '全局统计'
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
              <pre style="white-space:pre-wrap;font-family:monospace;background:#f8f9fa;padding:12px;border-radius:8px;font-size:12px;line-height:1.6;max-height:300px;overflow:auto;">${escapeHtml(c.existingRule || '-')}</pre>
            </div>
            <div>
              <h4 style="margin-bottom:8px;font-size:14px;color:var(--text-muted)">新规则（草稿）</h4>
              <pre style="white-space:pre-wrap;font-family:monospace;background:#f8f9fa;padding:12px;border-radius:8px;font-size:12px;line-height:1.6;max-height:300px;overflow:auto;">${escapeHtml(draft?.content || c.newRule || '-')}</pre>
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
      ? `<div style="margin-top:12px;padding:12px;background:#f8f9fa;border-radius:6px;">
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
          <pre style="white-space:pre-wrap;font-family:monospace;background:#f8f9fa;padding:16px;border-radius:8px;line-height:1.6;">${escapeHtml(d.content)}</pre>
          ${metaHtml}
          ${d.qualityScore !== null && d.qualityScore !== undefined ? `
            <div style="margin-top:16px;padding:16px;background:${d.qualityScore >= 60 ? '#f0fdf4' : '#fef2f2'};border:1px solid ${d.qualityScore >= 60 ? '#bbf7d0' : '#fecaca'};border-radius:8px;">
              <h4 style="margin-bottom:8px;font-size:14px;">质量评分：${d.qualityScore} ${d.qualityScore >= 60 ? '<span style="color:var(--success)">通过</span>' : '<span style="color:var(--danger)">拒绝</span>'}</h4>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:12px;">
                <div style="text-align:center;padding:8px;background:white;border-radius:6px;"><div style="font-size:18px;font-weight:600;">${d.metadata?._breakdown?.completeness ?? '-'}</div><small style="color:var(--text-muted)">完整性</small></div>
                <div style="text-align:center;padding:8px;background:white;border-radius:6px;"><div style="font-size:18px;font-weight:600;">${d.metadata?._breakdown?.length ?? '-'}</div><small style="color:var(--text-muted)">内容长度</small></div>
                <div style="text-align:center;padding:8px;background:white;border-radius:6px;"><div style="font-size:18px;font-weight:600;">${d.metadata?._breakdown?.format ?? '-'}</div><small style="color:var(--text-muted)">格式规范</small></div>
                <div style="text-align:center;padding:8px;background:white;border-radius:6px;"><div style="font-size:18px;font-weight:600;">${d.metadata?._breakdown?.source ?? '-'}</div><small style="color:var(--text-muted)">来源可信度</small></div>
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

async function showPageDetail(category, id) {
  try {
    const res = await apiGet(`/brain/pages/${category}/${id}`);
    if (!res.success) throw new Error(res.error);
    const content = res.data.content;

    document.getElementById('content').innerHTML = `
      <div class="page-detail">
        <pre style="white-space:pre-wrap;font-family:monospace;background:#f8f9fa;padding:16px;border-radius:8px;">${escapeHtml(content)}</pre>
        <div style="margin-top:16px;">
          <button class="btn btn-secondary" onclick="renderPage('brain')">返回列表</button>
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
  const kw = document.getElementById('brain-search').value.toLowerCase();
  const rows = document.querySelectorAll('#brain-table tr');
  rows.forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(kw) ? '' : 'none';
  });
}

function filterBrain(category) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');

  const rows = document.querySelectorAll('#brain-table tr');
  rows.forEach(row => {
    if (category === 'all') {
      row.style.display = '';
    } else {
      const catCell = row.cells[2];
      row.style.display = catCell && catCell.textContent === category ? '' : 'none';
    }
  });
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
document.getElementById('confirm-import').addEventListener('click', async () => {
  const type = document.getElementById('import-type').value;
  const fileInput = document.getElementById('import-file');
  const note = document.getElementById('import-note').value;

  if (!fileInput.files[0]) { alert('请选择文件'); return; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const res = await apiPost('/source-upload', {
        type,
        content: e.target.result,
        note
      });
      alert(res.success ? `导入成功: ${res.data.id}` : `导入失败: ${res.error}`);
      importModal.classList.remove('show');
      renderPage('drafts');
    } catch (err) {
      alert('导入失败: ' + err.message);
    }
  };
  reader.readAsText(fileInput.files[0]);
});

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
window.addEventListener('DOMContentLoaded', route);
