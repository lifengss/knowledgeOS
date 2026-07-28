# 知识管理系统 V1.0 业务流程与依赖知识图谱

> 版本 1.0 · 生成于 2026-07-24 · 来源 test-knowledge-system/docs/知识管理系统-V1.2架构设计与技术方案.md、test-knowledge-system/docs/API-INTERFACE-DOC.md

- 节点语义：节点 = 一次带语义的业务步骤(对应一次 API 调用)
- 边语义：有向边 A→B 表示 B 在业务上依赖/须在 A 之后发生(A 为前置)

## 一、业务域

| 域 | 含义 | 颜色 |
|----|------|------|
| P | 上下文/前置 | #9aa7b5 |
| A | 项目生命周期 | #f59e0b |
| B | 源数据接入 | #22d3ee |
| C | 草稿缓冲 | #34d399 |
| D | 冲突管理 | #fb7185 |
| E | 质量门控 | #a78bfa |
| F | 入库(双通路) | #60a5fa |
| G | 知识库页面 | #facc15 |
| H | 检索与生成 | #2dd4bf |
| I | 审计与统计 | #c084fc |
| J | AI适配/实体抽取 | #f472b6 |

## 二、业务步骤节点（40）

| 步骤 | 域 | 接口 | 角色 | 摘要 | 产出 | 前置资源 |
|------|----|------|------|------|------|----------|
| **P0** 设定 project 维度 | P | `project 维度(默认 default 或显式指定)` | context | 所有带 project 的接口共有的前置:确定当前操作所属项目,贯穿全部业务域。默认项目为 default,也可 GET 枚举或 POST 创建后使用。 | — | — |
| **A1** 枚举项目 | A | `GET /api/projects` | read | 返回 {defaultProject, sharedBrain, projects:[{id,name,description,brainPath}]},用于切换/确认当前项目。 | projectList | — |
| **A2** 创建项目 | A | `POST /api/projects` | write | body:{id,name,description} 新建私有知识库项目,成功后该 project 维度可用。 | project | — |
| **A3** 删除项目 | A | `DELETE /api/projects/:id` | write | 删除指定项目及其知识库;default 项目禁止删除。 | — | project |
| **B1** 上传源数据 | B | `POST /api/source-upload` | write | 上传 code/prd/requirement 源文件,触发解析,生成功能模块/API依赖等派生数据。后续 B2/B3/B4 与 J4 的数据源头。 | sourceDoc、wikiPage | project |
| **B2** 解析功能模块 | B | `GET /api/wiki-modules` | read | 列出从上传源码解析出的功能模块,供测试用例生成时选择范围。 | moduleList | sourceDoc |
| **B3** 解析 API 依赖 | B | `GET /api/wiki/api-deps` | read | 列出模块间 API 调用依赖,可在图谱中聚焦某模块。 | apiDepList | sourceDoc |
| **B4** API 依赖图谱 | B | `GET /api/graph-data` | read | 力导向图形式呈现 API 依赖(来自源解析);mode=api。 | apiGraph | sourceDoc |
| **C1** 新建草稿 | C | `POST /api/drafts` | write | 向缓冲层新增一条草稿(type 见 BRAIN_TYPE_MAP)。多种来源都会产生草稿:手工录入、生成用例(H2)、提议编辑(G4)、生成质量规则(J3)。 | draft | project |
| **C2** 列表草稿 | C | `GET /api/drafts` | read | 分页列出草稿(支持 type/status 过滤),供选择/批量操作。 | draftList | — |
| **C3** 获取草稿详情 | C | `GET /api/drafts/:id` | read | 读取单条草稿完整内容,编辑/校验前常先看详情。 | — | draft |
| **C4** 编辑草稿 | C | `PUT /api/drafts/:id` | write | 修改草稿内容/类型,编辑后通常再设状态(C5)。 | — | draft |
| **C5** 设置草稿状态/评分 | C | `PUT /api/drafts/:id/status` | write | 设置状态(pending/approved/...)及评分;approved 后方可入库。 | — | draft |
| **C6** 删除单条草稿 | C | `DELETE /api/drafts/:id` | write | 删除指定草稿。 | — | draft |
| **C7** 批量删除草稿 | C | `DELETE /api/drafts` | write | 按条件批量删除草稿(终态或指定范围)。 | — | draftList |
| **D1** 冲突检测 | D | `POST /api/conflicts/detect` | write | 对 pending 草稿做冲突扫描,标出 conflict 状态草稿。是入库的硬前置。 | conflict | draft |
| **D2** 列出冲突 | D | `GET /api/conflicts` | read | 列出当前冲突项,供逐条/批量解决。 | conflictList | conflict |
| **D3** 解决单条冲突 | D | `PUT /api/conflicts/:id/resolve` | write | 决议 merge/overwrite/keep_both/discard,闭环回写 drafts 表并入库或置终态。解决后草稿才能入库。 | — | conflict |
| **D4** 批量解决冲突 | D | `PUT /api/conflicts/resolve-batch` | write | 批量应用同一决议解决冲突,随后可批量入库(F2)。 | — | conflictList |
| **E1** 质量门控评估 | E | `POST /api/quality-gate/check` | read | 对草稿做质量评分(结构/可信度等),总分≥60 才达标;入库时也会再跑一次。 | qualityResult | draft |
| **F1** 单条入库 | F | `POST /api/drafts/:id/commit` | write | 将单条 approved 草稿写入 Brain 知识库(再跑质量门控与冲突检查),状态转 merged。 | brainPage、audit | draft |
| **F2** 批量入库 | F | `POST /api/drafts/batch-commit` | write | 批量提交多条草稿到 Brain,逐条走质量门控;部分不达标则保留 pending 不悬挂。 | brainPage、audit、stat | draftList |
| **G1** 列出知识页 | G | `GET /api/brain/pages` | read | 按分类列出已入库知识页(quality-rules/defect-rule/project-wiki/test-cases/test-scripts),入库后可见。 | pageList | — |
| **G2** 读取知识页 | G | `GET /api/brain/pages/:category/:id` | read | 读取单页正文与 frontmatter,编辑/删除前先看详情。 | — | brainPage |
| **G3** 直改知识页 | G | `PUT /api/brain/pages/:category/:id` | write | 直接写盘修改知识页(兼容旧逻辑),记录审计。 | — | brainPage |
| **G4** 提议编辑(自产草稿) | G | `POST /api/brain/pages/:category/:id/propose-edit` | write | 编辑已有页不再直写,而是生成两条草稿(A 知识修改 + B 质量规则),回流到草稿域(C)等待确认入库——这是优化的关键闭环。 | draft、draft | brainPage |
| **G5** 列出私有页 | G | `GET /api/brain/private-pages` | read | 列出待晋升到共享库的私有库页面。 | privatePageList | — |
| **G6** 晋升共享库 | G | `POST /api/brain/promote` | write | 将私有库页面晋升到共享库(shared_brain),跨项目复用,记录审计。 | audit | privatePageList |
| **G7** 删除单页 | G | `DELETE /api/brain/pages/:category/:id` | write | 删除指定知识页(标准分类;defect_rule 只能经 BFF 回流删)。 | — | brainPage |
| **G8** 批量删页 | G | `DELETE /api/brain/pages` | write | 按分类/条件批量删除知识页。 | — | pageList |
| **H1** 检索 | H | `POST /api/search` | read | 在知识库中检索,为生成/复用提供上下文。 | searchResult | — |
| **H2** 生成用例 | H | `POST /api/generate-cases` | write | 基于源/范围生成自动化测试用例,结果以草稿(pending)形式落库——生成→沉淀闭环的起点。 | draft | project、moduleList、searchResult |
| **H3** 实体图谱 | H | `GET /api/graph-data` | read | 力导向图呈现实体节点与关系(来自实体抽取 J4);mode=entity。 | entityGraph | brainPage |
| **I1** 审计日志 | I | `GET /api/audit-log` | read | 返回 {success,data:{items:[...],total}},记录所有写操作的审计;入库/编辑/晋升均写审计。 | — | audit |
| **I2** 统计 | I | `GET /api/stats` | read | 按分类统计知识库规模,入库后数字变化。 | stat | — |
| **I3** 健康检查 | I | `GET /api/health` | read | 探测服务存活,独立探针,无业务前置。 | — | — |
| **J1** 读AI配置 | J | `GET /api/ai-settings` | read | 读取 AI 平台对接与 GBrain 大模型配置(ai/gbrain 段)。 | aiConfig | — |
| **J2** 写AI配置 | J | `PUT /api/ai-settings` | write | 持久化 AI 配置到 data/ai_config.json,影响后续生成类操作。 | — | aiConfig |
| **J3** 生成质量规则 | J | `POST /api/generate-quality-rule` | write | 基于差异/知识生成质量规则草稿,回流到草稿域(C)等待入库。 | draft | aiConfig |
| **J4** 实体抽取 | J | `POST /api/wiki/:category/:id/extract-entities` | write | 对知识页(PRD/需求等)做确定性实体抽取,生成实体页沉淀进 project-wiki,供实体图谱(H3)。【来源:设计文档 §13.2,未列入 API-INTERFACE-DOC.md】 | brainPage、entityGraph | wikiPage |

## 三、依赖关系（74）

| 前置(From) | 类型 | 后继(To) | 说明 |
|-----------|------|---------|------|
| P0 | context | B1 | 项目维度前置 |
| P0 | context | C1 | 项目维度前置 |
| P0 | context | D1 | 项目维度前置 |
| P0 | context | E1 | 项目维度前置 |
| P0 | context | F1 | 项目维度前置 |
| P0 | context | G1 | 项目维度前置 |
| P0 | context | H1 | 项目维度前置 |
| P0 | context | H2 | 项目维度前置 |
| P0 | context | I2 | 项目维度前置 |
| P0 | context | J4 | 项目维度前置 |
| A1 | sequence | A2 | 枚举后创建(避免重复) |
| A1 | sequence | A3 | 枚举后删除 |
| A2 | produces | P0 | 创建项目后该维度可用 |
| B1 | produces | B2 | 上传后解析模块 |
| B1 | produces | B3 | 上传后解析API依赖 |
| B1 | produces | B4 | 上传后构建API图谱 |
| B3 | sequence | B4 | API依赖列表聚焦图谱 |
| B2 | sequence | H2 | 选模块范围后生成用例 |
| B1 | produces | J4 | 上传PRD后抽取实体 |
| C1 | sequence | C2 | 创建后可在列表查看 |
| C1 | sequence | C3 | 创建后读详情 |
| C1 | sequence | C4 | 创建后编辑 |
| C1 | sequence | C5 | 创建后设状态 |
| C1 | sequence | C6 | 创建后删除 |
| C2 | sequence | C7 | 列表选中后批量删除 |
| C3 | sequence | C4 | 读详情后编辑 |
| C4 | sequence | C5 | 编辑后设状态 |
| C1 | prereq | D1 | 草稿存在才检测冲突 |
| C1 | prereq | E1 | 草稿存在才评质量 |
| C1 | prereq | F1 | 草稿存在才入库 |
| C1 | prereq | F2 | 草稿存在才批量入库 |
| C2 | sequence | E1 | 列表选中后评质量 |
| C5 | prereq | F1 | approved 后入库 |
| C5 | prereq | F2 | approved 后批量入库 |
| D1 | sequence | D2 | 检测后列出冲突 |
| D1 | prereq | D3 | 检测后解决单条 |
| D1 | prereq | D4 | 检测后批量解决 |
| D2 | sequence | D3 | 列出后取 id 解决 |
| D3 | prereq | F1 | 解决冲突后才能单条入库 |
| D3 | prereq | F2 | 解决冲突后才能批量入库 |
| D4 | prereq | F2 | 批量解决后批量入库 |
| E1 | prereq | F1 | 质量达标后入库 |
| E1 | prereq | F2 | 质量达标后批量入库 |
| F1 | produces | G1 | 入库生成知识页 |
| F1 | produces | G2 | 入库后可读页面 |
| F1 | produces | I1 | 入库写审计 |
| F1 | produces | I2 | 入库改变统计 |
| F2 | produces | G1 | 批量入库生成知识页 |
| F2 | produces | I1 | 批量入库写审计 |
| F2 | produces | I2 | 批量入库改变统计 |
| G1 | sequence | G2 | 列表后读详情 |
| G2 | sequence | G3 | 读详情后直改 |
| G2 | sequence | G4 | 读详情后提议编辑 |
| G3 | produces | I1 | 直改写审计 |
| G4 | produces | C1 | 提议编辑回流生成草稿 |
| G4 | sequence | C5 | 新草稿设状态 |
| G4 | sequence | F1 | 新草稿入库 |
| G1 | sequence | G5 | 列表私有页 |
| G5 | sequence | G6 | 私有页晋升共享库 |
| G6 | produces | G1 | 晋升后页面列表含共享库 |
| G6 | produces | I1 | 晋升写审计 |
| G2 | sequence | G7 | 读详情后删除 |
| G1 | sequence | G8 | 列表后批量删 |
| H1 | sequence | H2 | 检索上下文后生成 |
| H2 | produces | C1 | 生成用例产出草稿 |
| H2 | sequence | C5 | 新草稿设状态 |
| H2 | sequence | F2 | 新草稿批量入库 |
| J4 | produces | H3 | 实体抽取供实体图谱 |
| J1 | sequence | J2 | 读配置后写配置 |
| J2 | sequence | J3 | 配置后生成质量规则 |
| J3 | produces | C1 | 生成质量规则产出草稿 |
| J3 | sequence | F1 | 新草稿入库 |
| J4 | produces | G1 | 抽取生成实体页 |
| J4 | produces | G2 | 抽取后可读实体页 |

## 四、可测试场景（12）

### flow-setup · 项目准备

枚举现有项目,按需创建新项目,确立后续操作的 project 维度。

步骤链：A1 → A2 → P0

### flow-ingest · 源接入与图谱构建

上传源码/PRD/需求,派生功能模块、API 依赖,并以力导向图呈现。

步骤链：P0 → B1 → B2 → B3 → B4

### flow-draft · 草稿创建与编辑

新建草稿后查看详情、编辑内容并设置状态/评分。

步骤链：C1 → C3 → C4 → C5

### flow-conflict · 冲突检测→解决→单条入库

对草稿做冲突检测,逐条解决后单条入库,体现冲突是入库的硬前置。

步骤链：C1 → D1 → D2 → D3 → F1

### flow-batch · 质量门控→批量入库→统计

先评质量,达标后批量入库,随后知识页可见、统计更新。

步骤链：C1 → E1 → F2 → G1 → I2

### flow-closed-loop · 知识闭环(生成→沉淀→再检索)

生成用例→草稿→冲突解决→入库→知识页→检索,检索结果又可作为下一轮生成的输入,形成闭环。

步骤链：H2 → C1 → D1 → D3 → F1 → G1 → H1

### flow-propose-edit · 编辑优化自产草稿闭环

对已有知识页提议编辑,系统生成两条草稿回流到草稿域,确认后入库——人工优化的关键闭环。

步骤链：G2 → G4 → C1 → F1

### flow-promote · 晋升共享库

列出私有页并晋升到共享库,实现跨项目复用。

步骤链：G1 → G5 → G6

### flow-entity · 实体抽取闭环

上传 PRD 后做实体抽取生成实体页,再以实体图谱可视化。

步骤链：B1 → J4 → G1 → H3

### flow-ai-rule · AI 生成质量规则

配置 AI 后生成质量规则草稿,回流入库。

步骤链：J1 → J2 → J3 → C1 → F1

### flow-audit · 审计与统计验证

以批量入库为触发,验证审计日志与统计随写操作更新。

步骤链：F2 → I1 → I2

### flow-health · 健康检查(独立探针)

独立探测服务存活,无业务前置,可作为测试套件的前置探活。

步骤链：I3
