// 知识管理系统 V1.0 Web UI Demo
// 使用 mock 数据展示各管理页面

const mockData = {
  stats: {
    pages: 128,
    drafts: 3,
    conflicts: 2,
    rules: 24,
    cases: 56,
    defects: 18
  },
  pages: [
    { id: 'QR-001', title: '编码规范：函数命名使用 camelCase', type: 'quality-rule', category: 'coding-standards', updated: '2026-07-15', status: 'active' },
    { id: 'QR-012', title: '接口响应必须包含 traceId', type: 'quality-rule', category: 'api-design', updated: '2026-07-14', status: 'active' },
    { id: 'DEF-001', title: '空指针异常：用户服务 getUserById', type: 'defect', category: 'null-pointer', updated: '2026-07-12', status: 'resolved' },
    { id: 'TC-001', title: '测试用例：用户登录', type: 'test-case', category: 'user-service', updated: '2026-07-15', status: 'active' },
    { id: 'TC-045', title: '测试用例：订单创建边界校验', type: 'test-case', category: 'order-service', updated: '2026-07-13', status: 'active' },
    { id: 'PW-003', title: 'API 契约：用户服务接口', type: 'project-wiki', category: 'api-contracts', updated: '2026-07-15', status: 'active' }
  ],
  drafts: [
    { id: 'D-20260715-001', source: 'human_edit', type: 'quality_rule', title: '新增：密码复杂度校验规则', status: 'pending', created: '2026-07-15 14:32' },
    { id: 'D-20260715-002', source: 'execution_feedback', type: 'defect_experience', title: '边界值：订单数量为 0 时的处理', status: 'pending', created: '2026-07-15 16:08' },
    { id: 'D-20260715-003', source: 'human_edit', type: 'test_case', title: '补充：账号锁定场景用例', status: 'pending', created: '2026-07-15 17:45' }
  ],
  conflicts: [
    { id: 'C-001', draftId: 'D-20260715-001', type: 'overlap', existing: 'QR-008 密码长度不得小于 8 位', newRule: '新增密码复杂度校验规则', status: 'pending' },
    { id: 'C-002', draftId: 'D-20260715-002', type: 'contradiction', existing: 'QR-015 订单数量必须大于 0', newRule: '订单数量为 0 时返回成功', status: 'pending' }
  ],
  audit: [
    { id: 'A-001', action: 'generate', operator: 'ai-platform', target: 'TC-102', detail: '生成用户登录用例', created: '2026-07-15 14:30' },
    { id: 'A-002', action: 'edit', operator: 'user-1', target: 'D-20260715-001', detail: '人工编辑优化规则草稿', created: '2026-07-15 14:32' },
    { id: 'A-003', action: 'commit', operator: 'user-1', target: 'QR-012', detail: '批量入库质量规则', created: '2026-07-15 10:15' },
    { id: 'A-004', action: 'conflict_detect', operator: 'system', target: 'C-001', detail: '检测到规则重叠', created: '2026-07-15 14:33' },
    { id: 'A-005', action: 'quality_check', operator: 'system', target: 'D-20260715-003', detail: '质量评分 78，通过', created: '2026-07-15 17:46' }
  ]
};

const pageTemplates = {
  dashboard: () => `
    <div class="grid">
      <div class="card"><h3>知识库页面</h3><div class="value">${mockData.stats.pages}</div><div class="trend">↑ 较上周 +12</div></div>
      <div class="card"><h3>待审核草稿</h3><div class="value">${mockData.stats.drafts}</div><div class="trend">需尽快处理</div></div>
      <div class="card"><h3>待处理冲突</h3><div class="value">${mockData.stats.conflicts}</div><div class="trend">需人工决策</div></div>
      <div class="card"><h3>质量规则</h3><div class="value">${mockData.stats.rules}</div><div class="trend">↑ 较上周 +3</div></div>
      <div class="card"><h3>历史用例</h3><div class="value">${mockData.stats.cases}</div><div class="trend">↑ 较上周 +8</div></div>
      <div class="card"><h3>缺陷经验</h3><div class="value">${mockData.stats.defects}</div><div class="trend">↑ 较上周 +2</div></div>
    </div>
    <div class="section" style="margin-top:24px;">
      <h3 class="section-title">最近操作</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>时间</th><th>操作</th><th>操作者</th><th>对象</th><th>详情</th></tr></thead>
          <tbody>
            ${mockData.audit.slice(0, 5).map(a => `
              <tr><td>${a.created}</td><td>${actionLabel(a.action)}</td><td>${a.operator}</td><td>${a.target}</td><td>${a.detail}</td></tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `,

  brain: () => `
    <div class="search-bar">
      <input type="text" id="brain-search" placeholder="搜索知识库页面、规则、用例、缺陷...">
      <button class="btn btn-primary" onclick="searchBrain()">搜索</button>
    </div>
    <div class="tabs">
      <div class="tab active" data-filter="all">全部</div>
      <div class="tab" data-filter="quality-rule">质量规则</div>
      <div class="tab" data-filter="test-case">历史用例</div>
      <div class="tab" data-filter="defect">缺陷经验</div>
      <div class="tab" data-filter="project-wiki">项目 Wiki</div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>ID</th><th>标题</th><th>类型</th><th>分类</th><th>更新时间</th><th>状态</th></tr></thead>
        <tbody id="brain-table">
          ${mockData.pages.map(p => `
            <tr>
              <td>${p.id}</td>
              <td><a href="#" onclick="showPageDetail('${p.id}')">${p.title}</a></td>
              <td>${typeLabel(p.type)}</td>
              <td>${p.category}</td>
              <td>${p.updated}</td>
              <td><span class="tag tag-merged">${p.status}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `,

  drafts: () => `
    <div class="section">
      <h3 class="section-title">待入库草稿（${mockData.drafts.length}）</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>草稿 ID</th><th>来源</th><th>类型</th><th>标题</th><th>创建时间</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            ${mockData.drafts.map(d => `
              <tr>
                <td>${d.id}</td>
                <td>${d.source === 'human_edit' ? '人工编辑' : '执行回流'}</td>
                <td>${typeLabel(d.type)}</td>
                <td>${d.title}</td>
                <td>${d.created}</td>
                <td><span class="tag tag-pending">待审核</span></td>
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
    </div>
  `,

  conflicts: () => `
    <div class="section">
      <h3 class="section-title">待处理冲突（${mockData.conflicts.length}）</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>冲突 ID</th><th>关联草稿</th><th>冲突类型</th><th>已有规则</th><th>新规则</th><th>操作</th></tr></thead>
          <tbody>
            ${mockData.conflicts.map(c => `
              <tr>
                <td>${c.id}</td>
                <td>${c.draftId}</td>
                <td>${conflictTypeLabel(c.type)}</td>
                <td>${c.existing}</td>
                <td>${c.newRule}</td>
                <td>
                  <button class="btn btn-primary btn-sm" onclick="resolveConflict('${c.id}', 'merge')">合并</button>
                  <button class="btn btn-secondary btn-sm" onclick="resolveConflict('${c.id}', 'overwrite')">覆盖</button>
                  <button class="btn btn-danger btn-sm" onclick="resolveConflict('${c.id}', 'discard')">丢弃</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `,

  graph: () => `
    <div class="section">
      <h3 class="section-title">API 依赖图谱</h3>
      <div class="graph-placeholder">
        <div style="font-size:48px;margin-bottom:16px;">🕸️</div>
        <p>图谱可视化 Demo 区域</p>
        <p style="font-size:13px;margin-top:8px;">V1.0 使用静态示意，正式版接入 D3.js / Cytoscape.js 渲染实体关系</p>
        <div style="margin-top:24px;display:flex;gap:24px;font-size:13px;">
          <div><span style="display:inline-block;width:12px;height:12px;background:#2563eb;border-radius:50%;margin-right:6px;"></span>API 接口（12）</div>
          <div><span style="display:inline-block;width:12px;height:12px;background:#16a34a;border-radius:50%;margin-right:6px;"></span>方法（34）</div>
          <div><span style="display:inline-block;width:12px;height:12px;background:#d97706;border-radius:50%;margin-right:6px;"></span>模块（5）</div>
        </div>
      </div>
    </div>
  `,

  verify: () => `
    <div class="section">
      <h3 class="section-title">验证性推理测试</h3>
      <p style="color:var(--text-muted);margin-bottom:16px;">输入测试问题，调用知识库做单次检索/推理，验证知识库效果（不做多轮对话）。</p>
      <div class="search-bar">
        <input type="text" id="verify-input" placeholder="例如：用户登录接口需要校验哪些边界条件？">
        <button class="btn btn-primary" onclick="runVerify()">执行检索</button>
      </div>
      <div id="verify-result"></div>
    </div>
  `,

  audit: () => `
    <div class="section">
      <h3 class="section-title">质量监控</h3>
      <div class="grid" style="margin-bottom:24px;">
        <div class="card"><h3>今日生成</h3><div class="value">12</div></div>
        <div class="card"><h3>今日入库</h3><div class="value">5</div></div>
        <div class="card"><h3>平均质量评分</h3><div class="value">76</div></div>
        <div class="card"><h3>冲突率</h3><div class="value">8%</div></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>时间</th><th>操作</th><th>操作者</th><th>对象</th><th>详情</th></tr></thead>
          <tbody>
            ${mockData.audit.map(a => `
              <tr><td>${a.created}</td><td>${actionLabel(a.action)}</td><td>${a.operator}</td><td>${a.target}</td><td>${a.detail}</td></tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `,

  dashboardStats: () => `
    <div class="section">
      <h3 class="section-title">全局操作日志统计面板</h3>
      <p style="color:var(--text-muted);margin-bottom:16px;">基于 audit_log 表的轻量大盘，无需新增组件。</p>
      <div class="grid" style="margin-bottom:24px;">
        <div class="card"><h3>入库数量</h3><div class="value">156</div><div class="trend">↑ 较上周 +23</div></div>
        <div class="card"><h3>草稿堆积量</h3><div class="value">${mockData.stats.drafts}</div><div class="trend">需尽快处理</div></div>
        <div class="card"><h3>冲突次数</h3><div class="value">${mockData.stats.conflicts}</div><div class="trend">待人工决策</div></div>
        <div class="card"><h3>检索频次</h3><div class="value">342</div><div class="trend">↑ 较上周 +56</div></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>指标</th><th>今日</th><th>本周</th><th>本月</th><th>趋势</th></tr></thead>
          <tbody>
            <tr><td>入库数量</td><td>5</td><td>23</td><td>156</td><td class="trend">↑</td></tr>
            <tr><td>草稿堆积量</td><td>3</td><td>8</td><td>21</td><td class="trend">→</td></tr>
            <tr><td>冲突次数</td><td>2</td><td>6</td><td>18</td><td class="trend">↓</td></tr>
            <tr><td>检索频次</td><td>48</td><td>342</td><td>1280</td><td class="trend">↑</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `
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

function typeLabel(type) {
  const map = {
    'quality-rule': '<span class="tag tag-rule">质量规则</span>',
    'test-case': '<span class="tag tag-case">历史用例</span>',
    'defect': '<span class="tag tag-defect">缺陷经验</span>',
    'project-wiki': '<span class="tag">项目 Wiki</span>',
    'quality_rule': '质量规则',
    'defect_experience': '缺陷经验'
  };
  return map[type] || type;
}

function actionLabel(action) {
  const map = {
    generate: '生成用例',
    edit: '编辑草稿',
    commit: '正式入库',
    conflict_detect: '冲突检测',
    quality_check: '质量检查'
  };
  return map[action] || action;
}

function conflictTypeLabel(type) {
  const map = { duplicate: '重复', contradiction: '矛盾', overlap: '重叠' };
  return map[type] || type;
}

function renderPage(page) {
  document.getElementById('page-title').textContent = titles[page] || page;
  document.getElementById('content').innerHTML = pageTemplates[page] ? pageTemplates[page]() : '<div class="empty-state">页面建设中</div>';
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
}

function showPageDetail(id) {
  const page = mockData.pages.find(p => p.id === id);
  if (!page) return;
  document.getElementById('content').innerHTML = `
    <div class="page-detail">
      <h3>${page.title}</h3>
      <p><strong>ID:</strong> ${page.id} &nbsp;|&nbsp; <strong>类型:</strong> ${typeLabel(page.type)} &nbsp;|&nbsp; <strong>分类:</strong> ${page.category} &nbsp;|&nbsp; <strong>状态:</strong> ${page.status}</p>
      <pre>---
type: ${page.type}
id: ${page.id}
category: ${page.category}
status: ${page.status}
updated: ${page.updated}
---

# ${page.title}

## Compiled Truth（当前最佳理解）

此处为页面核心知识内容，由人工或 AI 生成并经过校验。

## Timeline（历史证据，只追加）

- ${page.updated}: 初始创建/更新
- 2026-07-10: 补充关联用例与规则
</pre>
      <div style="margin-top:16px;">
        <button class="btn btn-secondary" onclick="renderPage('brain')">返回列表</button>
        <button class="btn btn-primary">编辑页面</button>
      </div>
    </div>
  `;
}

function searchBrain() {
  const kw = document.getElementById('brain-search').value.toLowerCase();
  const rows = document.querySelectorAll('#brain-table tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(kw) ? '' : 'none';
  });
}

function commitDraft(id) {
  alert(`草稿 ${id} 已触发单条入库流程\n（实际将调用 conflict-detector → quality-gate → single-commit）`);
}

function discardDraft(id) {
  if (confirm(`确定丢弃草稿 ${id} 吗？`)) {
    alert(`草稿 ${id} 已丢弃`);
  }
}

function batchCommit() {
  alert('批量确认入库流程已触发\n（实际将调用 conflict-detector → quality-gate → batch-commit）');
}

function resolveConflict(id, resolution) {
  const labels = { merge: '合并', overwrite: '覆盖', discard: '丢弃' };
  alert(`冲突 ${id} 已选择处理方式：${labels[resolution]}\n（实际将更新 conflicts 表并重新触发入库）`);
}

function runVerify() {
  const input = document.getElementById('verify-input').value;
  if (!input.trim()) {
    alert('请输入测试问题');
    return;
  }
  const resultBox = document.getElementById('verify-result');
  resultBox.innerHTML = `
    <div class="result-box">
      <h4>检索结果</h4>
      <p><strong>问题：</strong>${input}</p>
      <ul style="margin-top:12px;padding-left:20px;">
        <li>质量规则 QR-001：函数命名使用 camelCase</li>
        <li>质量规则 QR-012：接口响应必须包含 traceId</li>
        <li>历史用例 TC-001：用户登录</li>
        <li>API 契约 PW-003：用户服务接口</li>
      </ul>
      <p style="margin-top:12px;color:var(--text-muted);font-size:13px;">以上为 RRF 混合搜索返回的知识上下文示意，正式版由 GBrain 内核实时检索。</p>
    </div>
  `;
}

// 导入弹窗
const importModal = document.getElementById('import-modal');
document.getElementById('btn-import').addEventListener('click', () => importModal.classList.add('show'));
document.getElementById('close-import').addEventListener('click', () => importModal.classList.remove('show'));
document.getElementById('cancel-import').addEventListener('click', () => importModal.classList.remove('show'));
document.getElementById('confirm-import').addEventListener('click', () => {
  const type = document.getElementById('import-type').value;
  const file = document.getElementById('import-file').files[0];
  if (!file) { alert('请选择文件'); return; }
  alert(`开始导入 ${type} 类型源数据：${file.name}\n（实际将调用 REST API /api/source-upload）`);
  importModal.classList.remove('show');
});

document.getElementById('btn-run-dream').addEventListener('click', () => {
  alert('Dream Cycle 已触发\n（实际将执行 gbrain sync + gbrain embed --stale）');
});

// 路由
function route() {
  const hash = location.hash.replace('#', '') || 'dashboard';
  renderPage(hash);
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);
