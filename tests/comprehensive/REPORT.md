# test-knowledge-system 全量测试报告

- 生成时间：2026-07-23T12:44:20.688Z
- 测试对象：test-knowledge-system（KS API :3000）
- 覆盖项目：default, demo, testCaseGenerator
- 结果汇总：总计 33 项 ｜ ✅ PASS 18 ｜ ❌ FAIL 15 ｜ ⚠️ WARN 0

## 数据一致性

| 编号 | 检查项 | 结果 | 期望 | 实际 | 说明 |
|------|--------|------|------|------|------|
| A1-default | stats.pendingDrafts == 实际 pending 草稿数 | PASS | 1 | 1 | status分布={"merged":121,"pending":1,"approved":2,"rejected":34,"discarded":8} |
| A2-default | stats.totalConflicts == 未处理冲突数 | FAIL | 3 | 0 |  |
| A3-default | stats.totalPages == 知识库页面数 | FAIL | 201 | 210 | stats 统计全部 .md 分类，/api/brain/pages 仅返回部分分类(漏 code_interface/test-reports 等)，仪表盘页面数虚高 |
| A4-default | stats.totalCases == test-cases 页数 | PASS | 118 | 118 |  |
| A5-default | stats.totalRules == quality-rules 页数 | PASS | 17 | 17 |  |
| A6-default | 草稿角标前后一致(全局总数 vs 列表页pending) | FAIL | 列表页pending=1 | 全局总数=166 | 侧边栏角标显示总数166，草稿页角标显示pending=1，待入库标题数=3 —— 三处不一致 |
| A7-default | 草稿页“待入库草稿(N)”的N == 角标pending数 | FAIL | 角标pending=1 | 标题N=3 | 标题把approved/conflict也算入“待入库”，角标只计pending |
| A8-default | 冲突角标(未处理冲突数) == stats.totalConflicts(项目正确值) | FAIL | 项目正确=0 | 端点返回=3 | 端点未按项目隔离，角标显示的是其它项目的冲突数 |
| A1-demo | stats.pendingDrafts == 实际 pending 草稿数 | PASS | 0 | 0 | status分布={"merged":2,"rejected":5} |
| A2-demo | stats.totalConflicts == 未处理冲突数 | FAIL | 3 | 0 |  |
| A3-demo | stats.totalPages == 知识库页面数 | PASS | 1 | 1 | stats 统计全部 .md 分类，/api/brain/pages 仅返回部分分类(漏 code_interface/test-reports 等)，仪表盘页面数虚高 |
| A4-demo | stats.totalCases == test-cases 页数 | PASS | 0 | 0 |  |
| A5-demo | stats.totalRules == quality-rules 页数 | PASS | 1 | 1 |  |
| A6-demo | 草稿角标前后一致(全局总数 vs 列表页pending) | FAIL | 列表页pending=0 | 全局总数=7 | 侧边栏角标显示总数7，草稿页角标显示pending=0，待入库标题数=0 —— 三处不一致 |
| A7-demo | 草稿页“待入库草稿(N)”的N == 角标pending数 | PASS | 角标pending=0 | 标题N=0 | 标题把approved/conflict也算入“待入库”，角标只计pending |
| A8-demo | 冲突角标(未处理冲突数) == stats.totalConflicts(项目正确值) | FAIL | 项目正确=0 | 端点返回=3 | 端点未按项目隔离，角标显示的是其它项目的冲突数 |
| A1-testCaseGenerator | stats.pendingDrafts == 实际 pending 草稿数 | PASS | 0 | 0 | status分布={"merged":101,"conflict":3,"rejected":4} |
| A2-testCaseGenerator | stats.totalConflicts == 未处理冲突数 | PASS | 3 | 3 |  |
| A3-testCaseGenerator | stats.totalPages == 知识库页面数 | FAIL | 75 | 126 | stats 统计全部 .md 分类，/api/brain/pages 仅返回部分分类(漏 code_interface/test-reports 等)，仪表盘页面数虚高 |
| A4-testCaseGenerator | stats.totalCases == test-cases 页数 | PASS | 47 | 47 |  |
| A5-testCaseGenerator | stats.totalRules == quality-rules 页数 | PASS | 0 | 0 |  |
| A6-testCaseGenerator | 草稿角标前后一致(全局总数 vs 列表页pending) | FAIL | 列表页pending=0 | 全局总数=108 | 侧边栏角标显示总数108，草稿页角标显示pending=0，待入库标题数=3 —— 三处不一致 |
| A7-testCaseGenerator | 草稿页“待入库草稿(N)”的N == 角标pending数 | FAIL | 角标pending=0 | 标题N=3 | 标题把approved/conflict也算入“待入库”，角标只计pending |
| A8-testCaseGenerator | 冲突角标(未处理冲突数) == stats.totalConflicts(项目正确值) | PASS | 项目正确=3 | 端点返回=3 | 一致 |
| A9 | 冲突列表按项目隔离(default ≠ testCaseGenerator) | FAIL | 两项目集合应不同 | 两项目返回完全相同冲突集 | /api/conflicts 忽略 project 参数，跨项目泄漏导致各项目冲突角标/列表显示错误数量 |

## 展示错配

| 编号 | 检查项 | 结果 | 期望 | 实际 | 说明 |
|------|--------|------|------|------|------|
| B1 | overview/dashboard 绑定的 stats.* 字段均真实存在 | FAIL | 均存在 | 缺失: pendingConflicts | 模板引用了 totalPages, pendingDrafts, pendingConflicts, totalRules, totalCases, totalDefects, qualityScoreAvg, totalDrafts, mergedDrafts, rejectedDrafts；缺失字段(如 pendingConflicts)会导致展示恒为 0/undefined |

## 流程逻辑

| 编号 | 检查项 | 结果 | 期望 | 实际 | 说明 |
|------|--------|------|------|------|------|
| B2 | 冲突页“全选本页”复选框已绑定事件 | FAIL | 有事件绑定 | 出现3次,处理函数=false,内联事件=false | 复选框无 onchange/onclick 且无 toggleConflictSelectAll，全选功能失效 |
| B3 | 草稿页“全选本页”复选框已绑定事件(正向对照) | PASS | 有事件绑定 | 函数存在=true,模板使用=true |  |
| C1 | 草稿提交闭环(提交→入库→brain出现→状态merged) | PASS | committed+merged+inBrain | commit=true,status=merged,inBrain=true |  |
| C2 | 冲突处理闭环(重叠→检测→解决→入库) | PASS | 解决后冲突消失+草稿merged | resolve=true,gone=true,status=merged |  |

## 冗余变量

| 编号 | 检查项 | 结果 | 期望 | 实际 | 说明 |
|------|--------|------|------|------|------|
| B4 | 草稿角标计算存在重复/语义分歧的两处实现 | FAIL | 单处统一计算 | refreshBadges用总数=true,草稿页用pending=true | 同一“待处理草稿数”在两处用不同公式(总数 vs pending)，冗余且不一致(角标随页面跳变) |
| B5 | 模板内 id 属性无重复(列出供复核) | PASS | 无重复 | 无 |  |

## 项目隔离

| 编号 | 检查项 | 结果 | 期望 | 实际 | 说明 |
|------|--------|------|------|------|------|
| E1 | demo 草稿不出现在 default 草稿列表 | PASS | 不可见 | demo草稿id=de8c6230-eb01-4232-a3f7-859f94ef12d5,在default可见=false |  |

## 缺陷汇总（FAIL / WARN）

- **[A2-default] stats.totalConflicts == 未处理冲突数** — 期望: 3 ｜ 实际: 0 ｜ 
- **[A3-default] stats.totalPages == 知识库页面数** — 期望: 201 ｜ 实际: 210 ｜ stats 统计全部 .md 分类，/api/brain/pages 仅返回部分分类(漏 code_interface/test-reports 等)，仪表盘页面数虚高
- **[A6-default] 草稿角标前后一致(全局总数 vs 列表页pending)** — 期望: 列表页pending=1 ｜ 实际: 全局总数=166 ｜ 侧边栏角标显示总数166，草稿页角标显示pending=1，待入库标题数=3 —— 三处不一致
- **[A7-default] 草稿页“待入库草稿(N)”的N == 角标pending数** — 期望: 角标pending=1 ｜ 实际: 标题N=3 ｜ 标题把approved/conflict也算入“待入库”，角标只计pending
- **[A8-default] 冲突角标(未处理冲突数) == stats.totalConflicts(项目正确值)** — 期望: 项目正确=0 ｜ 实际: 端点返回=3 ｜ 端点未按项目隔离，角标显示的是其它项目的冲突数
- **[A2-demo] stats.totalConflicts == 未处理冲突数** — 期望: 3 ｜ 实际: 0 ｜ 
- **[A6-demo] 草稿角标前后一致(全局总数 vs 列表页pending)** — 期望: 列表页pending=0 ｜ 实际: 全局总数=7 ｜ 侧边栏角标显示总数7，草稿页角标显示pending=0，待入库标题数=0 —— 三处不一致
- **[A8-demo] 冲突角标(未处理冲突数) == stats.totalConflicts(项目正确值)** — 期望: 项目正确=0 ｜ 实际: 端点返回=3 ｜ 端点未按项目隔离，角标显示的是其它项目的冲突数
- **[A3-testCaseGenerator] stats.totalPages == 知识库页面数** — 期望: 75 ｜ 实际: 126 ｜ stats 统计全部 .md 分类，/api/brain/pages 仅返回部分分类(漏 code_interface/test-reports 等)，仪表盘页面数虚高
- **[A6-testCaseGenerator] 草稿角标前后一致(全局总数 vs 列表页pending)** — 期望: 列表页pending=0 ｜ 实际: 全局总数=108 ｜ 侧边栏角标显示总数108，草稿页角标显示pending=0，待入库标题数=3 —— 三处不一致
- **[A7-testCaseGenerator] 草稿页“待入库草稿(N)”的N == 角标pending数** — 期望: 角标pending=0 ｜ 实际: 标题N=3 ｜ 标题把approved/conflict也算入“待入库”，角标只计pending
- **[A9] 冲突列表按项目隔离(default ≠ testCaseGenerator)** — 期望: 两项目集合应不同 ｜ 实际: 两项目返回完全相同冲突集 ｜ /api/conflicts 忽略 project 参数，跨项目泄漏导致各项目冲突角标/列表显示错误数量
- **[B1] overview/dashboard 绑定的 stats.* 字段均真实存在** — 期望: 均存在 ｜ 实际: 缺失: pendingConflicts ｜ 模板引用了 totalPages, pendingDrafts, pendingConflicts, totalRules, totalCases, totalDefects, qualityScoreAvg, totalDrafts, mergedDrafts, rejectedDrafts；缺失字段(如 pendingConflicts)会导致展示恒为 0/undefined
- **[B2] 冲突页“全选本页”复选框已绑定事件** — 期望: 有事件绑定 ｜ 实际: 出现3次,处理函数=false,内联事件=false ｜ 复选框无 onchange/onclick 且无 toggleConflictSelectAll，全选功能失效
- **[B4] 草稿角标计算存在重复/语义分歧的两处实现** — 期望: 单处统一计算 ｜ 实际: refreshBadges用总数=true,草稿页用pending=true ｜ 同一“待处理草稿数”在两处用不同公式(总数 vs pending)，冗余且不一致(角标随页面跳变)

---

## 修复建议（按优先级）

1. **跨项目冲突泄漏（A9/A8/A2，严重）**：`/api/conflicts` 对 default/demo/testCaseGenerator 返回完全相同的冲突集，说明 `list-conflicts` → `get_pending_conflicts` 未按 `project` 过滤。修复：`cache/draft_cache.py` 的 `list-conflicts` 将 `--project` 透传到 `get_pending_conflicts` 的 SQL `WHERE draft.project=?` 条件。修复后各项目冲突角标/列表数量才正确。
2. **草稿角标/标题语义分歧（A6/A7/B4）**：同一“待处理草稿数”在 `refreshBadges`（用总数）与草稿页（用 pending）用不同公式，且“待入库草稿(N)”标题把 approved/conflict 也算入。修复：抽一个统一函数 `pendingDraftCount(drafts)`，角标与标题均只计 `status==='pending'`（或统一计 visible），前后一致。
3. **overview 字段名错配（B1）**：`web/src/app.js` 第233行 `${stats.pendingConflicts}` 字段在 `/api/stats` 中不存在（实际为 `totalConflicts`），导致“待处理冲突”恒显示 0。修复：改为 `${stats.totalConflicts}`。
4. **冲突页“全选本页”失效（B2）**：`class="conflict-select-all"` 复选框无 `onchange`/`onclick`，且无 `toggleConflictSelectAll` 处理函数，批量选择不可用。修复：在表头/“全选本页”复选框绑定 `onchange="toggleConflictSelectAll(this.checked)"` 并实现该函数（参照草稿页 `toggleSelectAll`）。
5. **页面数统计口径不一致（A3）**：`stats.totalPages` 统计 brains/<project> 下全部 .md（含 `code_interface` 50、`test-reports` 2 等），而 `/api/brain/pages` 仅返回部分分类，导致仪表盘“知识库页面”数虚高。修复：让 `/api/brain/pages` 覆盖全部分类，或 `stats` 仅统计页面列表可见分类。

> 本报告由 `tests/comprehensive/run-tests.cjs` 自动生成，脚本与用例清单见同目录。