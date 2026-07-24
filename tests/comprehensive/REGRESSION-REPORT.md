# test-knowledge-system 回归测试报告（修复后）

- 生成时间：2026-07-24T01:28:05.216Z
- 测试对象：test-knowledge-system（KS API :3000）
- 覆盖项目：default, demo, testCaseGenerator
- 结果汇总：总计 29 项 ｜ ✅ PASS 29 ｜ ❌ FAIL 0 ｜ ⚠️ WARN 0

## 数据一致性

| 编号 | 检查项 | 结果 | 期望 | 实际 | 说明 |
|------|--------|------|------|------|------|
| A1-default | stats.pendingDrafts == 实际 pending 草稿数 | PASS | 0 | 0 | status分布={"rejected":37,"merged":127,"discarded":10} |
| A2-default | stats.totalConflicts == 未处理冲突数(已按项目隔离) | PASS | 0 | 0 |  |
| A3-default | stats.totalPages == 知识库页面数(同口径) | PASS | 206 | 206 |  |
| A4-default | stats.totalCases == test-cases 页数 | PASS | 118 | 118 |  |
| A5-default | stats.totalRules == quality-rules 页数 | PASS | 20 | 20 |  |
| A8-default | 冲突角标(未处理冲突数) == stats.totalConflicts(项目正确值) | PASS | 项目正确=0 | 端点返回=0 | 一致 |
| A1-demo | stats.pendingDrafts == 实际 pending 草稿数 | PASS | 0 | 0 | status分布={"merged":2,"rejected":5} |
| A2-demo | stats.totalConflicts == 未处理冲突数(已按项目隔离) | PASS | 0 | 0 |  |
| A3-demo | stats.totalPages == 知识库页面数(同口径) | PASS | 1 | 1 |  |
| A4-demo | stats.totalCases == test-cases 页数 | PASS | 0 | 0 |  |
| A5-demo | stats.totalRules == quality-rules 页数 | PASS | 1 | 1 |  |
| A8-demo | 冲突角标(未处理冲突数) == stats.totalConflicts(项目正确值) | PASS | 项目正确=0 | 端点返回=0 | 一致 |
| A1-testCaseGenerator | stats.pendingDrafts == 实际 pending 草稿数 | PASS | 0 | 0 | status分布={"merged":101,"conflict":3,"rejected":4} |
| A2-testCaseGenerator | stats.totalConflicts == 未处理冲突数(已按项目隔离) | PASS | 3 | 3 |  |
| A3-testCaseGenerator | stats.totalPages == 知识库页面数(同口径) | PASS | 75 | 75 |  |
| A4-testCaseGenerator | stats.totalCases == test-cases 页数 | PASS | 47 | 47 |  |
| A5-testCaseGenerator | stats.totalRules == quality-rules 页数 | PASS | 0 | 0 |  |
| A8-testCaseGenerator | 冲突角标(未处理冲突数) == stats.totalConflicts(项目正确值) | PASS | 项目正确=3 | 端点返回=3 | 一致 |
| A9 | 冲突列表按项目隔离(default ≠ testCaseGenerator) | PASS | 两项目集合应不同 | 已隔离 | 已修复：各项目仅返回自身冲突 |
| A6 | 草稿角标全局与页面统一使用 pending 计数(静态检查) | PASS | 角标只用pending | refresh用总数=false,refresh用pending=true,页面用pending=true | 修复后：refreshBadges 草稿角标改用 pending，与草稿页角标一致 |
| A7 | 草稿页“待入库草稿(N)”的 N == pendingCount(静态检查) | PASS | 标题用pendingCount | 标题用pendingCount=true,标题用visible=false | 修复后：标题与角标语义统一为待处理草稿数 |

## 展示错配

| 编号 | 检查项 | 结果 | 期望 | 实际 | 说明 |
|------|--------|------|------|------|------|
| B1 | overview/dashboard 绑定的 stats.* 字段均真实存在 | PASS | 均存在 | 缺失: 无 | 模板引用了 totalPages, pendingDrafts, totalConflicts, totalRules, totalCases, totalDefects, qualityScoreAvg, totalDrafts, mergedDrafts, rejectedDrafts |

## 流程逻辑

| 编号 | 检查项 | 结果 | 期望 | 实际 | 说明 |
|------|--------|------|------|------|------|
| B2 | 冲突页“全选本页”复选框事件已生效(事件委托) | PASS | 有事件委托处理 | 出现3次,委托逻辑=true | 误报修正：功能实际可用（事件委托联动 conflict-check） |
| B3 | 草稿页“全选本页”复选框已绑定事件(正向对照) | PASS | 有事件绑定 | 函数存在=true,模板使用=true |  |
| C1 | 草稿提交闭环(提交→入库→brain出现→状态merged) | PASS | committed+merged+inBrain | commit=true,status=merged,inBrain=true |  |
| C2 | 冲突处理闭环(重叠→检测→解决→入库) | PASS | 解决后冲突消失+草稿merged | resolve=true,gone=true,status=merged |  |

## 冗余变量

| 编号 | 检查项 | 结果 | 期望 | 实际 | 说明 |
|------|--------|------|------|------|------|
| B4 | 草稿角标计算无重复/语义分歧的两处实现 | PASS | 单处统一计算 | refreshBadges用总数=false,草稿页用pending=true | 修复后：角标统一为 pending 计数 |
| B5 | 模板内 id 属性无重复(列出供复核) | PASS | 无重复 | 无 |  |

## 项目隔离

| 编号 | 检查项 | 结果 | 期望 | 实际 | 说明 |
|------|--------|------|------|------|------|
| E1 | demo 草稿不出现在 default 草稿列表 | PASS | 不可见 | demo草稿id=f0df461d-1731-4084-b719-7a40eb282ad0,在default可见=false |  |

## 修复与回归说明

### 已修复缺陷（对应发现阶段 FAIL 项）

1. **跨项目冲突泄漏（A9 / A8 / A2）**：`cache/draft_cache.py` 的 `list-conflicts` 未将 `--project` 透传给 `get_pending_conflicts`，导致 `/api/conflicts` 对 default/demo/testCaseGenerator 返回完全相同的冲突集。修复：`conflicts = cq.get_pending_conflicts(filters, project=args.project)`。验证：default=0、demo=0、testCaseGenerator=3（各自独立），`stats.totalConflicts == /api/conflicts` 三项目均一致。
2. **overview 字段名错配（B1）**：`web/src/app.js` overview 绑定 `${stats.pendingConflicts}`，但 `/api/stats` 实际字段为 `totalConflicts`，导致“待处理冲突”恒显示 0。修复：改为 `${stats.totalConflicts}`。
3. **草稿角标/标题语义分歧（A6 / A7 / B4）**：`refreshBadges` 用总数 `d.data.length` 设草稿角标，草稿页用 `pendingCount`，标题“待入库草稿(N)”又计入 approved/conflict，三处不一致。修复：`refreshBadges` 草稿角标改用 pending 计数；标题改为 `${pendingCount}`，与角标统一。
4. **页面数统计口径不一致（A3 / A4 / A5）**：`stats` 统计 brains 下全部 .md（含 `code_interface`/`test-reports` 等不可浏览分类），而 `/api/brain/pages` 仅返回可在前端浏览的分类，仪表盘“知识库页面”数虚高。修复：`stats` 仅统计 `config/projects.json` 的 `categories` 分类，并按 `(分类,文件名)` 跨库去重；`/api/brain/pages` 改用 `projects.CATEGORIES` 单源；`config/projects.json` 补全 `test-scripts` 分类。验证：三项目 `stats.totalPages == /api/brain/pages` 计数完全一致。

### 误报修正

- **B2（冲突页“全选本页”）**：发现阶段判为失效，实为**误报**。复选框 `class="conflict-select-all"` 通过 `document.addEventListener('change', ...)` 事件委托生效（见 `web/src/app.js` 约 1264 行），可正确联动本页 `conflict-check` 复选框并更新“已选 N 项”。回归测试已改为验证事件委托逻辑，判定为 PASS。

### 未改动

- C1（草稿提交闭环）、C2（冲突处理闭环）、E1（草稿项目隔离）、B3（草稿全选）、B5（重复 id）发现阶段即通过，回归保持通过。

> 本报告由 `tests/comprehensive/regression-tests.cjs` 自动生成。发现阶段基线见 `REPORT.md`，用例清单见 `test-cases.md`。