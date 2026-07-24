# test-knowledge-system 全量测试用例目录

> 测试对象：test-knowledge-system（KS API `http://localhost:3000/api`，Web UI 同址）
> 执行方式：`node tests/comprehensive/run-tests.cjs`
> 测试脚本：`run-tests.cjs`（每个检查独立 try/catch，单点异常不影响整体；结果写入 `results/summary.json` 与 `REPORT.md`）
> 安全区说明：涉及数据写/改的「功能闭环」用例全部在 `demo` 项目内执行，结束后自动清理，不污染 default / testCaseGenerator 真实数据。

## 一、数据一致性（前后端 / 知识系统不一致）

| 编号 | 检查项 | 方法 | 期望 |
|------|--------|------|------|
| A1 | `stats.pendingDrafts` == 实际 pending 草稿数 | 对每个项目：`/api/stats` 的 `pendingDrafts` 与 `/api/drafts` 中 `status==='pending'` 的计数比对 | 相等 |
| A2 | `stats.totalConflicts` == 未处理冲突数 | `/api/stats.totalConflicts` 与 `/api/conflicts`（未处理）长度比对 | 相等 |
| A3 | `stats.totalPages` == 知识库页面数 | `/api/stats.totalPages` 与 `/api/brain/pages` 长度比对 | 相等 |
| A4 | `stats.totalCases` == test-cases 页数 | stats 与 brain pages 按 category 过滤计数比对 | 相等 |
| A5 | `stats.totalRules` == quality-rules 页数 | 同上 | 相等 |
| A6 | 草稿角标前后一致 | 侧边栏角标（`refreshBadges` 用草稿总数） vs 草稿列表页角标（用 pending 数） | 应一致（实际不一致 → 缺陷） |
| A7 | 「待入库草稿(N)」标题数 == 角标 pending 数 | 列表标题 N=visible(pending+approved+conflict)，角标=pending | 应一致（实际不一致 → 缺陷） |
| A8 | 冲突角标前后一致 | 侧边栏角标（`/api/conflicts` 长度） vs 冲突列表页角标（未处理数） | 应一致（对照项，预期通过） |

## 二、展示错配（未关联正确意义的显示内容）

| 编号 | 检查项 | 方法 | 期望 |
|------|--------|------|------|
| B1 | overview 绑定的 `stats.*` 字段均真实存在 | 静态扫描 `app.js` 中 `${stats.X}`，逐一校验 `/api/stats` 返回含该 key | 全部存在（`pendingConflicts` 缺失 → 缺陷） |

## 三、流程逻辑（不合理的功能/交互）

| 编号 | 检查项 | 方法 | 期望 |
|------|--------|------|------|
| B2 | 冲突页「全选本页」复选框已绑定事件 | 静态检查 `conflict-select-all` 出现次数 + 是否存在 `toggleConflictSelectAll` 或内联 `onchange/onclick` | 有事件绑定（无 → 缺陷：全选失效） |
| B3 | 草稿页「全选本页」复选框已绑定事件（正向对照） | 检查 `toggleSelectAll` 函数存在且模板使用 | 有事件绑定 |
| C1 | 草稿提交闭环 | demo：建草稿→commit→brain 出现该页且草稿状态 merged | 闭环成功 |
| C2 | 冲突处理闭环 | demo：提交重叠草稿→检测冲突→resolve(merge)→冲突消失且草稿入库 | 闭环成功 |

## 四、重复 / 冗余变量名

| 编号 | 检查项 | 方法 | 期望 |
|------|--------|------|------|
| B4 | 草稿角标计算无重复/语义分歧实现 | 静态检查 `app.js` 中 `draft-badge` 是否被两处用不同公式赋值（总数 vs pending） | 单处统一（两处 → 缺陷） |
| B5 | 模板内 `id` 属性无重复 | 静态扫描 `id="..."` 统计重复，列出供人工复核 | 无重复（重复 → WARN 复核） |

## 五、项目隔离

| 编号 | 检查项 | 方法 | 期望 |
|------|--------|------|------|
| E1 | demo 草稿不出现在 default 草稿列表 | demo 建草稿后查 default `/api/drafts` 不应包含该 id | 不可见 |

---

## 关联用户关注点

- 「草稿审核、冲突处理后面标记的数量经常是错的」→ 主要由 **A6 / A7 / B1** 覆盖（角标用总数、列表页用 pending、标题把 approved/conflict 也算入；overview 字段名错配导致恒为 0）。
- 「展示性显示内容未关联正确意义」→ **B1 / B4**。
- 「重复、冗余的变量名」→ **B4 / B5**。
- 「不合理的流程逻辑」→ **B2 / C1 / C2**。
- 「前后端、知识系统不一致的数据」→ **A1~A8 / E1**。

---

## 七、知识库浏览：详情修复 + 新增/批量功能回归（2026-07-24）

回应"测试不充分"的批评：本轮补做浏览器级 UI 验证（playwright 真实点击各分类记录）+ 新增功能回归脚本 `feature-tests.cjs`。

### 修复的详情显示缺陷
| 编号 | 缺陷 | 根因 | 修复 |
|------|------|------|------|
| D1 | 列表/详情标题显示占位符"标题" | 列表仅取正文 `# H1`，未用 frontmatter `title:` | `api/server.js` 列表 `title` 优先 frontmatter，回退 `# H1`→文件名 |
| D2 | 早期文件 CRLF 导致 frontmatter 解析失败 | `parseFrontmatter` 正则不兼容 CRLF | 正则改为 `^---\r?\n...\r?\n---` |
| D3 | 详情模态吐出原始 frontmatter | `showPageDetail` 原样展示 `content` | 详情接口返回 `body`（去 frontmatter）；前端渲染 Markdown |

### 新增功能（各分类「新增条目」/「批量增加」）
- 后端：`POST /api/brain/pages`（单条）、`POST /api/brain/pages/batch`（批量），写入项目私有库，附 frontmatter + 审计。
- 前端：工具栏两按钮 + 弹窗；批量以单独一行 `----` 分隔，块首行为标题（去 `#`/`##` 前缀）。

### 回归结果
- `feature-tests.cjs`（本轮新增）：**PASS=16 FAIL=0 WARN=0**，覆盖详情真实标题/去 frontmatter、列表标题修复、单条新增、批量新增、参数校验，自动清理测试数据。
- `regression-tests.cjs`（综合，重跑）：**PASS=29 FAIL=0 WARN=0**，确认改动未破坏页面数一致性。
- 报告：`FEATURE-REPORT.md`；入库产物：`feature-tests.cjs` + `FEATURE-REPORT.md`。

---

## 六、修复与回归（2026-07-23）

发现阶段（基线报告 `REPORT.md`）共 **PASS=18 / FAIL=15 / WARN=0**，15 项 FAIL 中 14 项为真实可复现问题，B2 为误报。已全部修复并回归：

### 已修复
| 编号 | 缺陷 | 根因 | 修复 |
|------|------|------|------|
| A9 / A8 / A2 | 冲突列表跨项目泄漏（各项目角标显示他人冲突数） | `list-conflicts` 未将 `--project` 透传给 `get_pending_conflicts` | `cache/draft_cache.py`：`conflicts = cq.get_pending_conflicts(filters, project=args.project)` |
| B1 | overview「待处理冲突」恒显示 0 | 模板绑定 `stats.pendingConflicts`，该字段不存在（实为 `totalConflicts`） | `web/src/app.js`：`${stats.pendingConflicts}` → `${stats.totalConflicts}` |
| A6 / A7 / B4 | 草稿「待处理数」三处公式分歧（角标总数 vs pending vs 标题含 approved/conflict） | `refreshBadges` 用 `d.data.length`；标题用 `visibleDrafts.length` | `web/src/app.js`：`refreshBadges` 草稿角标改用 pending 计数；标题改为 `${pendingCount}` |
| A3 / A4 / A5 | 仪表盘「知识库页面」数虚高 | `stats` 统计全部 .md（含不可浏览的 `code_interface`/`test-reports`），`/api/brain/pages` 仅返回部分分类 | `cache/draft_cache.py`：`stats` 仅统计 `projects.json` 的 `categories` 并按 `(分类,文件名)` 跨库去重；`api/server.js`：`/api/brain/pages` 改用 `projects.CATEGORIES` 单源；`config/projects.json` 补全 `test-scripts` 分类 |

### 误报修正
- **B2（冲突页「全选本页」）**：发现阶段判为失效，实为误报。复选框通过 `document.addEventListener('change', ...)` 事件委托生效，可正确联动本页 `conflict-check`。

### 回归结果
- 回归套件：`regression-tests.cjs`（A6/A7 改为静态代码检查验证待处理数统一；B2 改为验证事件委托）。
- 结果：**PASS=29 / FAIL=0 / WARN=0**，全部修复项验证通过。报告见 `REGRESSION-REPORT.md`。

### 入库产物（经业务前端 BFF 回流机制，项目 `default`）
- `REPORT.md`（发现阶段基线）、`REGRESSION-REPORT.md`（回归报告）、`test-cases.md`（本清单）、`run-tests.cjs`（基线脚本）、`regression-tests.cjs`（回归脚本）均作为知识入库。
