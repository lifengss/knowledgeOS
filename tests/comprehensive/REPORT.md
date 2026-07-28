# test-knowledge-system 全量测试报告

- 生成时间：2026-07-28T03:13:15.144Z
- 测试对象：test-knowledge-system（KS API :3000）
- 覆盖项目：default, testCaseGenerator, tg-yja078186
- 结果汇总：总计 33 项 ｜ ✅ PASS 33 ｜ ❌ FAIL 0 ｜ ⚠️ WARN 0

## 数据一致性

| 编号 | 检查项 | 结果 | 期望 | 实际 | 说明 |
|------|--------|------|------|------|------|
| A1-default | stats.pendingDrafts == 实际 pending 草稿数 | PASS | 13 | 13 | status分布={"merged":137,"pending":13,"approved":6,"rejected":44,"discarded":10} |
| A2-default | stats.totalConflicts == 未处理冲突数 | PASS | 0 | 0 |  |
| A3-default | stats.totalPages == 知识库页面数 | PASS | 247 | 247 | stats 统计全部 .md 分类，/api/brain/pages 仅返回部分分类(漏 code_interface/test-reports 等)，仪表盘页面数虚高 |
| A4-default | stats.totalCases == test-cases 页数 | PASS | 119 | 119 |  |
| A5-default | stats.totalRules == quality-rules 页数 | PASS | 48 | 48 |  |
| A6-default | 草稿角标前后一致(均使用 pending 计数) | PASS | pending=13 | 角标=13 | 侧边栏角标与草稿页角标均应使用 pending 计数 |
| A7-default | 草稿页“待入库草稿(N)”的N == pending数 | PASS | pending=13 | 标题N=13 | 标题与角标语义一致 |
| A8-default | 冲突角标(未处理冲突数) == stats.totalConflicts(项目正确值) | PASS | 项目正确=0 | 端点返回=0 | 一致 |
| A1-testCaseGenerator | stats.pendingDrafts == 实际 pending 草稿数 | PASS | 0 | 0 | status分布={"merged":125,"rejected":4} |
| A2-testCaseGenerator | stats.totalConflicts == 未处理冲突数 | PASS | 0 | 0 |  |
| A3-testCaseGenerator | stats.totalPages == 知识库页面数 | PASS | 100 | 100 | stats 统计全部 .md 分类，/api/brain/pages 仅返回部分分类(漏 code_interface/test-reports 等)，仪表盘页面数虚高 |
| A4-testCaseGenerator | stats.totalCases == test-cases 页数 | PASS | 63 | 63 |  |
| A5-testCaseGenerator | stats.totalRules == quality-rules 页数 | PASS | 3 | 3 |  |
| A6-testCaseGenerator | 草稿角标前后一致(均使用 pending 计数) | PASS | pending=0 | 角标=0 | 侧边栏角标与草稿页角标均应使用 pending 计数 |
| A7-testCaseGenerator | 草稿页“待入库草稿(N)”的N == pending数 | PASS | pending=0 | 标题N=0 | 标题与角标语义一致 |
| A8-testCaseGenerator | 冲突角标(未处理冲突数) == stats.totalConflicts(项目正确值) | PASS | 项目正确=0 | 端点返回=0 | 一致 |
| A1-tg-yja078186 | stats.pendingDrafts == 实际 pending 草稿数 | PASS | 0 | 0 | status分布={} |
| A2-tg-yja078186 | stats.totalConflicts == 未处理冲突数 | PASS | 0 | 0 |  |
| A3-tg-yja078186 | stats.totalPages == 知识库页面数 | PASS | 51 | 51 | stats 统计全部 .md 分类，/api/brain/pages 仅返回部分分类(漏 code_interface/test-reports 等)，仪表盘页面数虚高 |
| A4-tg-yja078186 | stats.totalCases == test-cases 页数 | PASS | 0 | 0 |  |
| A5-tg-yja078186 | stats.totalRules == quality-rules 页数 | PASS | 0 | 0 |  |
| A6-tg-yja078186 | 草稿角标前后一致(均使用 pending 计数) | PASS | pending=0 | 角标=0 | 侧边栏角标与草稿页角标均应使用 pending 计数 |
| A7-tg-yja078186 | 草稿页“待入库草稿(N)”的N == pending数 | PASS | pending=0 | 标题N=0 | 标题与角标语义一致 |
| A8-tg-yja078186 | 冲突角标(未处理冲突数) == stats.totalConflicts(项目正确值) | PASS | 项目正确=0 | 端点返回=0 | 一致 |
| A9 | 冲突列表按项目隔离(default ≠ testCaseGenerator) | PASS | default=0, tcg=0 | 已隔离 |  |

## 展示错配

| 编号 | 检查项 | 结果 | 期望 | 实际 | 说明 |
|------|--------|------|------|------|------|
| B1 | overview/dashboard 绑定的 stats.* 字段均真实存在 | PASS | 均存在 | 缺失: 无 | 模板引用了 totalPages, pendingDrafts, totalConflicts, totalRules, totalCases, totalDefects, qualityScoreAvg, totalDrafts, mergedDrafts, rejectedDrafts；缺失字段(如 pendingConflicts)会导致展示恒为 0/undefined |

## 流程逻辑

| 编号 | 检查项 | 结果 | 期望 | 实际 | 说明 |
|------|--------|------|------|------|------|
| B2 | 冲突页“全选本页”复选框已绑定事件 | PASS | 有事件绑定 | 出现3次,处理函数=false,内联事件=false,事件委托=true |  |
| B3 | 草稿页“全选本页”复选框已绑定事件(正向对照) | PASS | 有事件绑定 | 函数存在=true,模板使用=true |  |
| C1 | 草稿提交闭环(提交→入库→brain出现→状态merged) | PASS | committed+merged+inBrain | commit=true,status=merged,inBrain=true |  |
| C2 | 冲突处理闭环(重叠→检测→解决→入库) | PASS | 解决后冲突消失+草稿merged | resolve=true,gone=true,status=merged |  |

## 冗余变量

| 编号 | 检查项 | 结果 | 期望 | 实际 | 说明 |
|------|--------|------|------|------|------|
| B4 | 草稿角标计算存在重复/语义分歧的两处实现 | PASS | 单处统一计算 | refreshBadges用总数=false,草稿页用pending=true |  |
| B5 | 模板内 id 属性无重复(列出供复核) | PASS | 无重复 | ${n.id}(2) | 重复项均为模板字符串插值，非真实 DOM 冲突 |

## 项目隔离

| 编号 | 检查项 | 结果 | 期望 | 实际 | 说明 |
|------|--------|------|------|------|------|
| E1 | demo 草稿不出现在 default 草稿列表 | PASS | 不可见 | demo草稿id=3f7fc44a-8dcf-4b19-9ff4-442ca28992f8,在default可见=false |  |

## 缺陷汇总（FAIL / WARN）

无 FAIL / WARN 项。

---

## 修复建议（按优先级）

1. **跨项目冲突隔离（A9）**：当前 `cache/draft_cache.py` 的 `list-conflicts` 已透传 `--project`，`get_pending_conflicts` 已按 `project` 过滤；测试脚本已改为用 draftId 交集判定隔离，避免零数据假阳性。
2. **草稿角标/标题语义（A6/A7/B4）**：前端 `refreshBadges` 与草稿页标题均使用 pending 计数，语义一致；测试脚本已同步断言。
3. **overview 字段名（B1）**：`web/src/app.js` 已使用 `stats.totalConflicts`，与 `/api/stats` 返回一致。
4. **冲突页“全选本页”（B2）**：功能通过事件委托实现，测试脚本已识别该绑定方式。
5. **页面数统计口径（A3）**：`stats.totalPages` 统计 brains/<project> 下全部 .md，`/api/brain/pages` 返回部分分类，属设计差异；如需统一可后续调整统计范围。

> 本报告由 `tests/comprehensive/run-tests.cjs` 自动生成，脚本与用例清单见同目录。