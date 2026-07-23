# 知识管理系统 V1.0 接口文档

> 本文档为**对外接口说明文档**，与网页"接口文档"页（#apidocs）内容保持一致，单一数据源为 `web/src/api-docs-data.js`。
> 真实端点以 `api/server.js` 为准；MCP 服务已**实现**为 `mcp_connector/` 下的 stdio 传输服务（FastMCP）。AI 平台对接见 §11.5。
> 当对外 REST 或 MCP 服务发生变更时，须同步更新本文件与 `web/src/api-docs-data.js`（见 `script-check-skill` 规则 6）。

---

## 1. 通用约定

| 项目 | 内容 |
|------|------|
| REST 接口基址 | `http://localhost:3000/api` |
| 内容协商 | 请求/响应均为 `application/json`（源上传支持 `multipart/form-data`） |
| 版本 | V1.0 |
| 认证方式 | V1.0 暂不启用鉴权 |
| MCP 查询接口 | `http://localhost:8100`（规划中） |
| MCP 写入接口 | `http://localhost:8101`（规划中） |

### 1.1 统一返回结构

所有 REST 接口统一返回：

```json
{ "success": true, "data": {}, "error": "..." }
```

- 查询成功：`success=true`，结果在 `data`；
- 失败：`success=false`，`error` 含原因。

### 1.2 多项目隔离

- 查询接口通过查询参数 `?project=<id>` 指定项目；
- 写入接口通过请求体 `{ "project": "<id>" }` 指定项目；未指定时默认 `default`；
- Brain 页面按"项目私有库 + 共享库"合并去重（私有优先）。

### 1.3 MCP 状态

MCP 服务（8100 查询 / 8101 写入）为规划中能力，当前代码尚未实现真实 MCP Server。以下为其设计规格，供对接参考。

---

## 2. 系统与健康

### GET /api/health

**功能**：健康检查，返回服务存活状态、版本与时间戳，可用于探活与监控。

**参数**：无。

**请求示例**：

```bash
curl http://localhost:3000/api/health
```

**响应示例**：

```json
{
  "status": "ok",
  "version": "1.0.0",
  "time": "2026-07-22T08:00:00.000Z"
}
```

**注**：无副作用，无需 `project` 参数。

---

## 3. 项目管理

枚举、创建、删除多项目知识库。配置持久化于 `config/projects.json`。

### GET /api/projects

**功能**：获取多项目配置（默认项目、共享脑目录、各项目元信息），供前端枚举与切换知识库。

**参数**：无。

**请求示例**：

```bash
curl http://localhost:3000/api/projects
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "defaultProject": "default",
    "sharedBrain": "brains/_shared",
    "projects": [
      { "id": "default", "name": "默认项目", "description": "", "brainPath": "brain" },
      { "id": "demo", "name": "示例项目", "description": "demo", "brainPath": "brains/demo" }
    ]
  }
}
```

**注**：只读接口。`brainPath` 为相对项目根的知识库目录。

### POST /api/projects

**功能**：运行时新建项目——写入 `config/projects.json` 并在 `brains/<id>` 建立私有知识库目录。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| id | body | 是 | 项目 ID（字母/数字/_/-，创建后不可改） |
| name | body | 是 | 项目名称 |
| description | body | 否 | 项目描述 |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"id":"demo2","name":"示例项目二","description":"用于回归测试"}'
```

**响应示例**：

```json
{
  "success": true,
  "data": { "id": "demo2", "name": "示例项目二", "description": "用于回归测试", "brainPath": "brains/demo2" }
}
```

**注**：`id` 为空或已存在会被 400 拒绝。

### DELETE /api/projects/:id

**功能**：删除项目配置并清理其私有 brain 目录（默认项目不可删）。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| id | path | 是 | 项目 ID |

**请求示例**：

```bash
curl -X DELETE http://localhost:3000/api/projects/demo2
```

**响应示例**：

```json
{ "success": true, "data": { "id": "demo2" } }
```

**注**：会删除私有知识库文件，操作不可恢复。

---

## 4. 草稿管理

测试产物草稿的增删查改与入库（单条/批量）。草稿为进入知识库前的缓冲层。

### GET /api/drafts

**功能**：分页获取草稿，可按状态/来源/类型过滤。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| status | query | 否 | 状态：pending/approved/conflict/merged/discarded/rejected |
| source | query | 否 | 来源：human_edit/upload/ai_gen 等 |
| type | query | 否 | 类型：quality_rule/defect_experience/test_case/test_script 等 |
| limit | query | 否 | 每页数量，默认 100 |
| offset | query | 否 | 偏移，默认 0 |
| project | query | 否 | 项目隔离，默认 default |

**请求示例**：

```bash
curl "http://localhost:3000/api/drafts?status=pending&limit=20&project=default"
```

**响应示例**：

```json
{
  "success": true,
  "data": [
    { "id": "a1b2c3", "status": "pending", "source": "human_edit", "type": "quality_rule",
      "title": "空指针防护规则", "score": null, "created_at": "2026-07-22T08:00:00", "project": "default" }
  ]
}
```

### GET /api/drafts/:id

**功能**：按 ID 获取草稿完整内容。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| id | path | 是 | 草稿 ID |

**请求示例**：

```bash
curl http://localhost:3000/api/drafts/a1b2c3
```

**响应示例**：

```json
{
  "success": true,
  "data": { "id": "a1b2c3", "status": "pending", "type": "quality_rule", "title": "...", "content": "# 规则\n...", "metadata": {} }
}
```

**注**：`content` 为 Markdown 正文。

### PUT /api/drafts/:id

**功能**：人工更新草稿的标题/正文/类型（入库前可反复编辑）。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| id | path | 是 | 草稿 ID |
| title | body | 否 | 新标题 |
| content | body | 否 | 新 Markdown 正文 |
| type | body | 否 | 新类型（如 quality_rule / defect_experience） |

**请求示例**：

```bash
curl -X PUT http://localhost:3000/api/drafts/a1b2c3 \
  -H "Content-Type: application/json" \
  -d '{"title":"修订后的标题","content":"# 规则\n修订内容..."}'
```

**响应示例**：

```json
{ "success": true, "data": { "success": true } }
```

**注**：仅更新传入字段；不影响草稿状态，仍需单条/批量入库才进入知识库。

### POST /api/drafts

**功能**：向缓冲层新增一条草稿（人工编辑或外部写入）。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| source | body | 否 | 来源，默认 human_edit |
| type | body | 否 | 类型，默认 quality_rule |
| title | body | 否 | 标题，默认"未命名草稿" |
| content | body | 否 | Markdown 正文 |
| metadata | body | 否 | 附加元数据对象 |
| project | body | 否 | 项目隔离，默认 default |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/drafts \
  -H "Content-Type: application/json" \
  -d '{"source":"human_edit","type":"quality_rule","title":"空指针防护","content":"# 规则\n...","project":"default"}'
```

**响应示例**：

```json
{ "success": true, "data": { "id": "a1b2c3", "status": "pending", "project": "default" } }
```

**注**：返回新建草稿的 ID。当前仅支持单条创建；如需批量创建，请由调用方并行调用本接口（后续版本可能提供 `POST /api/drafts/batch`）。

### PUT /api/drafts/:id/status

**功能**：人工设置草稿状态（如 approved/rejected/discarded）及质量评分。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| id | path | 是 | 草稿 ID |
| status | body | 是 | 目标状态 |
| score | body | 否 | 质量评分（可选） |

**请求示例**：

```bash
curl -X PUT http://localhost:3000/api/drafts/a1b2c3/status \
  -H "Content-Type: application/json" -d '{"status":"approved","score":85}'
```

**响应示例**：

```json
{ "success": true, "data": { "id": "a1b2c3", "status": "approved", "score": 85 } }
```

### POST /api/drafts/:id/commit

**功能**：单条入库到知识库（Brain）。会走质量门控，命中冲突可跳过检测。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| id | path | 是 | 草稿 ID |
| skip_conflict_check | body | 否 | 跳过冲突检测（覆盖用） |
| skip_quality_gate | body | 否 | 跳过质量门控（谨慎） |
| project | body | 否 | 项目隔离，默认 default |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/drafts/a1b2c3/commit \
  -H "Content-Type: application/json" -d '{"skip_conflict_check":false}'
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "draftId": "a1b2c3",
    "committedPage": "quality-rules/a1b2c3.md",
    "score": 82,
    "conflictId": null,
    "reason": "ok"
  }
}
```

**注**：入库后草稿状态置为 merged；若质量不达标或被冲突阻断，返回 `reason` 说明。

### POST /api/drafts/batch-commit

**功能**：批量入库；未传 `ids` 时提交当前项目全部待入库草稿（--all）。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| ids | body | 否 | 草稿 ID 数组；缺省提交全部 pending/approved |
| skip_conflict_check | body | 否 | 跳过冲突检测 |
| skip_quality_gate | body | 否 | 跳过质量门控 |
| project | body | 否 | 项目隔离，默认 default |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/drafts/batch-commit \
  -H "Content-Type: application/json" \
  -d '{"ids":["a1b2c3","d4e5f6"],"skip_conflict_check":false}'
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "total": 2, "committed": 2, "skipped": 0,
    "conflicts": [], "details": [ { "draftId": "a1b2c3", "status": "merged" } ]
  }
}
```

**注**：无变更不写库；命中冲突的草稿进入 conflict 状态等待人工决策。

### DELETE /api/drafts/:id

**功能**：物理删除一条草稿。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| id | path | 是 | 草稿 ID |

**请求示例**：

```bash
curl -X DELETE http://localhost:3000/api/drafts/a1b2c3
```

**响应示例**：

```json
{ "success": true, "data": { "id": "a1b2c3", "deleted": true } }
```

**注**：不可恢复。

### DELETE /api/drafts

**功能**：按 IDs 批量物理删除草稿。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| ids | body | 是 | 草稿 ID 数组 |

**请求示例**：

```bash
curl -X DELETE http://localhost:3000/api/drafts \
  -H "Content-Type: application/json" -d '{"ids":["a1b2c3","d4e5f6"]}'
```

**响应示例**：

```json
{ "success": true, "data": { "deleted": ["a1b2c3","d4e5f6"] } }
```

**注**：`ids` 为空会被 400 拒绝。

---

## 5. 冲突管理

当入库草稿与既有知识规则冲突时进入冲突队列，需人工决策（merge/overwrite/discard/keep_both）。

### GET /api/conflicts

**功能**：获取冲突队列，可按状态过滤。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| status | query | 否 | 状态过滤（如 pending） |
| limit | query | 否 | 数量，默认 100 |
| project | query | 否 | 项目隔离，默认 default |

**请求示例**：

```bash
curl "http://localhost:3000/api/conflicts?status=pending&project=default"
```

**响应示例**：

```json
{
  "success": true,
  "data": [
    { "id": 12, "draft_id": "a1b2c3", "existing_rule": "旧规则摘要", "new_rule": "新规则摘要",
      "conflict_type": "content", "resolution": null, "resolved_by": null,
      "resolved_at": null, "created_at": "2026-07-22T08:00:00", "project": "default" }
  ]
}
```

**注**：`resolution` 为 null 表示待处理；处理后写回草稿状态形成闭环。

### POST /api/conflicts/detect

**功能**：对所有待入库草稿执行与既有知识库的冲突检测，生成/更新冲突队列。

**参数**：无。

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/conflicts/detect
```

**响应示例**：

```json
{ "success": true, "data": { "checked": 5, "conflicts": 2 } }
```

**注**：无需请求体；作用于当前项目。

### PUT /api/conflicts/:id/resolve

**功能**：按决议处理冲突并回写对应草稿（merge/overwrite/keep_both→入库；discard→丢弃）。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| id | path | 是 | 冲突记录 ID |
| resolution | body | 是 | 决议：merge / overwrite / discard / keep_both |

**请求示例**：

```bash
curl -X PUT http://localhost:3000/api/conflicts/12/resolve \
  -H "Content-Type: application/json" -d '{"resolution":"merge"}'
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "conflictId": 12, "draftId": "a1b2c3", "resolution": "merge",
    "conflictResolved": true,
    "draftResult": { "success": true, "status": "merged", "committedPage": "quality-rules/a1b2c3.md" }
  }
}
```

**注**：处理后会同步更新草稿状态，形成"冲突→决策→回写"闭环。

### PUT /api/conflicts/resolve-batch

**功能**：对一组冲突按同一决议批量处理并回写草稿。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| ids | body | 是 | 冲突 ID 数组 |
| resolution | body | 是 | 统一决议 |

**请求示例**：

```bash
curl -X PUT http://localhost:3000/api/conflicts/resolve-batch \
  -H "Content-Type: application/json" -d '{"ids":[12,13],"resolution":"merge"}'
```

**响应示例**：

```json
{
  "success": true,
  "data": { "total": 2, "resolvedCount": 2, "resolved": [12,13], "failedCount": 0, "failed": [], "draftResults": {} }
}
```

**注**：`ids` 为空会被 400 拒绝。

---

## 6. 质量门控

入库前的质量评估（结构规范、来源可信度等），不达标将被拦截至草稿层。

### POST /api/quality-gate/check

**功能**：对指定草稿（或全部）执行质量门控评估。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| draft_ids | body | 否 | 逗号分隔的草稿 ID；缺省检查全部 pending |
| project | body | 否 | 项目隔离，默认 default |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/quality-gate/check \
  -H "Content-Type: application/json" -d '{"draft_ids":"a1b2c3,d4e5f6"}'
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "checked": 2, "passed": 1, "failed": 1,
    "results": [ { "draft_id": "a1b2c3", "passed": true, "score": 82, "reason": "ok" } ]
  }
}
```

**注**：`score` 低于阈值（默认 60）视为不通过。

---

## 7. 审计与统计

### GET /api/audit-log

**功能**：查询操作审计记录，支持过滤与分页。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| action | query | 否 | 操作类型过滤（如 commit/delete/promote） |
| operator | query | 否 | 操作者过滤 |
| target | query | 否 | 目标对象过滤 |
| startTime | query | 否 | 起始时间 |
| endTime | query | 否 | 结束时间 |
| page | query | 否 | 页码，默认 1 |
| pageSize | query | 否 | 每页大小，默认 20 |

**请求示例**：

```bash
curl "http://localhost:3000/api/audit-log?action=commit&page=1&pageSize=20"
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "items": [ { "id": 1, "action": "commit", "operator": "web-ui", "target": "default:quality-rules/a1b2c3.md",
      "detail": "{}", "created_at": "2026-07-22T08:00:00" } ],
    "total": 1, "page": 1, "pageSize": 20
  }
}
```

**注**：审计记录写入失败不阻断主流程。

### GET /api/stats

**功能**：汇总当前项目的知识库规模与待办。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| project | query | 否 | 项目隔离，默认 default |

**请求示例**：

```bash
curl "http://localhost:3000/api/stats?project=default"
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "totalPages": 320, "pendingDrafts": 5, "pendingConflicts": 2,
    "totalRules": 120, "totalCases": 80, "totalDefects": 60,
    "mergedDrafts": 300, "rejectedDrafts": 10, "conflictDrafts": 0
  }
}
```

**注**：dashboard 页即消费此接口。

---

## 8. 检索与生成

### POST /api/search

**功能**：在知识库（按项目私有+共享合并）中检索相关页面片段。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| query | body | 否 | 检索关键词/问题 |
| mode | body | 否 | 检索模式：keyword（默认）/ semantic |
| limit | body | 否 | 返回条数，默认 10 |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" -d '{"query":"登录失败处理","mode":"keyword","limit":5}'
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "query": "登录失败处理",
    "results": [ { "category": "defect-experience", "id": "x9", "title": "登录超时", "path": "defect-experience/x9.md", "score": 0.9, "snippet": "..." } ]
  }
}
```

**注**：结果按相关度排序。

### POST /api/generate-cases

**功能**：基于检索到的知识上下文，调用 case_generator 生成测试用例/脚本草稿。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| query | body | 否 | 生成所需的问题/需求描述 |
| limit | body | 否 | 生成数量，默认 5 |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/generate-cases \
  -H "Content-Type: application/json" -d '{"query":"支付流程","limit":3}'
```

**响应示例**：

```json
{
  "success": true,
  "data": { "query": "支付流程", "generated": [ { "id": "g1", "type": "test_case", "title": "..." } ] }
}
```

**注**：生成结果以草稿形式落库，待人工审核入库。

---

## 9. 源数据上传

导入代码/PRD/需求列表等源数据。代码 → 解析「API 调用依赖」图谱（project-wiki/api-*.md）；PRD/需求列表 → 直接沉淀为「项目描述」Wiki（project-wiki/{prd,req}-*.md），形成项目 Wiki 供按功能模块选测试范围。两者在知识库中区分清晰：API 调用依赖来自代码，项目描述来自文档。

### POST /api/source-upload

**功能**：multipart 上传文件（支持代码压缩包 zip/tar/7z 或单文件），或 JSON 直接传 content。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| file | form | 否 | 上传文件（代码类自动解析） |
| type | form/body | 否 | 数据类型：code(默认)/prd/requirement/defect/report |
| note | form/body | 否 | 文档标题/备注 |
| content | body | 否 | 非代码类型时直接传正文 |
| project | body | 否 | 归属项目，默认 default |

**请求示例**：

```bash
# 代码压缩包（multipart）→ 生成 API 调用依赖图谱
curl -X POST http://localhost:3000/api/source-upload -F "file=@code.zip" -F "type=code" -F "project=default"
# PRD（直接沉淀为项目描述 Wiki）
curl -X POST http://localhost:3000/api/source-upload -F "file=@prd.md" -F "type=prd" -F "note=电商平台PRD" -F "project=default"
# 需求列表（直接沉淀为项目描述 Wiki，优先级高于 PRD）
curl -X POST http://localhost:3000/api/source-upload -F "file=@req.md" -F "type=requirement" -F "note=需求列表" -F "project=default"
# 纯文本直接沉淀（无文件，JSON content）→ 用于 AI 生成的大纲直接入库
curl -X POST http://localhost:3000/api/source-upload \
  -H "Content-Type: application/json" \
  -d '{"type":"prd","content":"# 大纲\n...","note":"测试用例大纲","project":"default"}'
```

**响应示例**：

```json
{ "success": true, "data": { "summary": "已沉淀为项目描述 Wiki：prd-xxx.md", "slug": "prd-xxx", "uploadType": "prd", "category": "project-wiki" } }
```

**注**：code → 解压切片解析写入草稿并生成 API 依赖图谱(api-overview.md)；prd/requirement → 直接写入 project-wiki（前端「按功能模块」测试范围的数据源），区别于代码产生的 API 调用依赖图谱。

### GET /api/wiki-modules

**功能**：从项目描述 Wiki（PRD / 需求列表）解析功能模块清单，供前端「按功能模块」选择测试范围。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| project | query | 否 | 项目隔离，默认 default |

**请求示例**：

```bash
curl "http://localhost:3000/api/wiki-modules?project=default"
```

**响应示例**：

```json
{ "success": true, "data": { "available": true, "source": "prd", "modules": [ { "id": "用户管理", "label": "用户管理" } ] } }
```

**注**：优先级：需求列表(req-*) > PRD(prd-*)；两者皆无则 `available=false`（前端该标签禁用）。功能模块取自文档二级/三级标题。

### GET /api/wiki/api-deps

**功能**：解析 `project-wiki/api-*.md` 契约页面为结构化列表，供「项目 Wiki → API 调用依赖」以列表方式展示，并关联图谱可视化的 API 依赖图谱（点击模块「在图谱中查看」聚焦该模块节点）。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| project | query | 否 | 项目隔离，默认 default |

**请求示例**：

```bash
curl "http://localhost:3000/api/wiki/api-deps?project=default"
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "overview": { "stats": { "接口定义": 376, "调用依赖关系": 1826, "代码文件": 34 }, "modules": [ { "id": "api-auth", "title": "Auth 模块" } ] },
    "modules": [ { "id": "api-auth", "module": "auth", "title": "API 契约：auth", "interfaces": [ { "name": "auth.login", "params": "token", "returns": "" } ], "calls": [ { "from": "auth.login", "to": "auth.check", "type": "call" } ] } ]
  }
}
```

**注**：`interfaces` 来自 `## 接口列表` 段（`→ (params: ...)` 解析为 params，其它解析为 returns）；`calls` 来自 `## 调用关系` 段（`a → b （type）`）；`overview.stats` 来自 `api-overview.md` 的 `**N** 个X` 统计。

---

## 10. GBrain 知识页面

知识库（Brain）页面的读取、晋升共享与删除。分类：quality-rules / defect-experience / project-wiki / test-cases。

### GET /api/brain/pages

**功能**：合并项目私有库与共享库（私有优先去重）列出页面。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| category | query | 否 | 分类过滤；缺省全部四类 |
| limit | query | 否 | 每类上限，默认 100 |
| project | query | 否 | 项目隔离，默认 default |

**请求示例**：

```bash
curl "http://localhost:3000/api/brain/pages?category=quality-rules&project=default"
```

**响应示例**：

```json
{
  "success": true,
  "data": [ { "id": "a1b2c3", "title": "空指针防护", "category": "quality-rules", "filename": "a1b2c3.md", "repo": "brain", "preview": "..." } ]
}
```

**注**：`repo` 标识来自私有库(brain)还是共享库(_shared)。

### GET /api/brain/pages/:category/:id

**功能**：按分类与 ID 读取某个知识页面完整 Markdown 内容。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| category | path | 是 | 分类 |
| id | path | 是 | 页面 ID（不含 .md） |

**请求示例**：

```bash
curl http://localhost:3000/api/brain/pages/quality-rules/a1b2c3
```

**响应示例**：

```json
{ "success": true, "data": { "content": "# 空指针防护\n...", "repo": "brain" } }
```

**注**：`id` 不含扩展名。

### PUT /api/brain/pages/:category/:id

**功能**：人工修改已发布知识页面的正文，写回其原所在仓库（私有优先于共享）。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| category | path | 是 | 分类（须为合法分类） |
| id | path | 是 | 页面 ID（不含 .md） |
| content | body | 是 | 新 Markdown 正文 |
| project | body | 否 | 项目隔离，默认 default |

**请求示例**：

```bash
curl -X PUT http://localhost:3000/api/brain/pages/quality-rules/a1b2c3 \
  -H "Content-Type: application/json" -d '{"content":"# 空指针防护\n修订后的内容..."}'
```

**响应示例**：

```json
{ "success": true, "data": { "category": "quality-rules", "id": "a1b2c3", "repo": "brain", "size": 128 } }
```

**注**：写回原仓库，repo 不变；标题由正文首个 `# 标题` 自动派生；记录审计日志（action=edit）。

### POST /api/brain/pages/:category/:id/propose-edit

**功能**：人工编辑优化闭环（设计"链路 3a"）。人工修改已发布页面时**不直接写盘**，而是生成两条草稿：A. 知识条目修改草稿（type=knowledge_edit，确认入库后写回原仓库页面）；B. 质量规则草稿（type=quality_rule，由 old/new 对比自动提炼，进草稿箱待确认）。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| category | path | 是 | 分类（须为合法分类） |
| id | path | 是 | 页面 ID（不含 .md） |
| content | body | 是 | 新 Markdown 正文 |
| repo | body | 否 | 原仓库标识（brain/_shared），缺省按原文件所在仓库 |
| project | body | 否 | 项目隔离，默认 default |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/brain/pages/quality-rules/a1b2c3/propose-edit \
  -H "Content-Type: application/json" -d '{"content":"# 空指针防护\n修订后的内容..."}'
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "editDraftId": "e1f2",
    "ruleDraftId": "r3s4",
    "note": "已生成编辑草稿与质量规则草稿，请在草稿箱确认入库。"
  }
}
```

**注**：不直接写盘；质量规则优先 AI 提炼，失败回退确定性 diff。两条草稿需在草稿箱分别确认入库。

### GET /api/brain/private-pages

**功能**：仅列出当前项目私有知识库页面（不含共享库），供筛选晋升。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| project | query | 否 | 项目隔离，默认 default |

**请求示例**：

```bash
curl "http://localhost:3000/api/brain/private-pages?project=default"
```

**响应示例**：

```json
{
  "success": true,
  "data": { "project": "default", "pages": [ { "category": "quality-rules", "id": "a1b2c3", "path": "quality-rules/a1b2c3.md", "title": "空指针防护", "size": 1024, "mtime": "2026-07-22T08:00:00" } ] }
}
```

**注**：用于"晋升私有知识到共享库"弹窗。

### POST /api/brain/promote

**功能**：将项目私有页面复制/移动到共享知识库 `brains/_shared`，对所有项目可见。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| project | body | 否 | 项目隔离，默认 default |
| pagePath | body | 是 | 页面路径，格式 `<分类>/<文件名.md>` |
| mode | body | 否 | copy（默认，保留私有）/ move（移除私有） |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/brain/promote \
  -H "Content-Type: application/json" -d '{"pagePath":"quality-rules/a1b2c3.md","mode":"copy"}'
```

**响应示例**：

```json
{ "success": true, "data": { "project": "default", "pagePath": "quality-rules/a1b2c3.md", "mode": "copy", "dest": "brains/_shared/quality-rules/a1b2c3.md" } }
```

**注**：非法路径/分类会被 400 拒绝；含 `..` 视为非法。

### DELETE /api/brain/pages/:category/:id

**功能**：删除知识库某页面（同时匹配私有/共享库）。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| category | path | 是 | 分类（须为合法分类） |
| id | path | 是 | 页面 ID（不含 .md） |

**请求示例**：

```bash
curl -X DELETE http://localhost:3000/api/brain/pages/quality-rules/a1b2c3
```

**响应示例**：

```json
{ "success": true, "data": { "category": "quality-rules", "id": "a1b2c3", "path": "brain/quality-rules/a1b2c3.md" } }
```

**注**：非法分类/文件名会被拒绝；记录审计日志。

### DELETE /api/brain/pages

**功能**：按 items 批量删除知识库页面。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| items | body | 是 | 数组，元素 `{ category, id }` |

**请求示例**：

```bash
curl -X DELETE http://localhost:3000/api/brain/pages \
  -H "Content-Type: application/json" -d '{"items":[{"category":"quality-rules","id":"a1b2c3"}]}'
```

**响应示例**：

```json
{ "success": true, "data": { "deleted": [ { "category": "quality-rules", "id": "a1b2c3" } ], "count": 1 } }
```

**注**：`items` 为空会被 400 拒绝。

---

## 11. 图谱数据

解析 project-wiki 的 WikiLinks 与代码调用关系，导出图谱节点与边。

### GET /api/graph-data

**功能**：返回知识/代码实体节点与关系边，供前端力导向图渲染。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| project | query | 否 | 项目隔离，默认 default |
| mode | query | 否 | `api`（默认，API 调用依赖图谱）或 `entity`（项目实体图谱） |

**请求示例**：

```bash
curl "http://localhost:3000/api/graph-data?project=default"          # API 依赖图谱
curl "http://localhost:3000/api/graph-data?mode=entity&project=default"  # 项目实体图谱
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "nodes": [ { "id": "m:auth", "label": "认证模块", "type": "module", "repo": "brain" } ],
    "edges": [ { "source": "m:auth", "target": "m:login", "type": "wiki-link" } ]
  }
}
```

**注**：project-wiki 不存在时返回空节点/边。

---

## 11.5 AI 平台对接（AI Adapter）

知识库侧 AI 平台适配器，**对齐 testcase-gen-frontend 系统设置**设计：codebuddy / openai / none 三通道，配置持久化于 `data/ai_config.json`（env 种子 + 文件热更新）。`generate-quality-rule` 服务于设计“链路 3a 人工编辑优化”——由人工编辑前后内容生成质量规则：优先调用 AI 提炼，未配置 AI 或调用失败时回退确定性 diff 拼装（difflib，稳定可离线）。

### GET /api/ai-settings

**功能**：读取 AI 平台对接配置。

**响应示例**：
```json
{ "success": true, "data": { "ai": { "provider": "none", "useCustomModel": false, "endpoint": "", "apiKey": "", "model": "claude-sonnet-4" }, "gbrain": { "provider": "openai", "endpoint": "", "apiKey": "", "model": "gpt-4o-mini" } } }
```

**注**：除 AI 平台对接 `ai` 段外，新增 `gbrain` 段（GBrain 大模型），用于 Wiki 摘要、实体抽取、目录生成等智能能力；`gbrain.provider` = `openai` | `none`。

### PUT /api/ai-settings

**功能**：更新 AI 平台配置与 GBrain 大模型配置并持久化。`provider` = `openai` | `codebuddy` | `none`。

**请求体**：
```json
{ "ai": { "provider": "openai", "endpoint": "https://<host>/v1/chat/completions", "apiKey": "<token>", "model": "claude-sonnet-4", "useCustomModel": false }, "gbrain": { "provider": "openai", "endpoint": "https://<gbrain-host>/v1", "apiKey": "<token>", "model": "gpt-4o-mini" } }
```

### POST /api/generate-quality-rule

**功能**：由人工编辑前后内容生成质量规则（Markdown）。

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| title | body | 否 | 条目标题 |
| old | body | 是 | 修改前正文 |
| new | body | 是 | 修改后正文 |

**请求示例**：
```bash
curl -X POST http://localhost:3000/api/generate-quality-rule \
  -H "Content-Type: application/json" \
  -d '{"title":"登录校验","old":"旧规则","new":"新规则"}'
```

**响应示例**：
```json
{ "success": true, "data": { "source": "ai", "content": "# 质量规则：登录校验\n\n- ..." } }
```
`source` 取值：`ai`（AI 提炼）或 `deterministic`（确定性 diff 回退）。

---

## 12. MCP 服务（已实现）

面向 AI Agent 的 Model Context Protocol 接口。**已实现**为 stdio 传输的 MCP 服务（见 `mcp_connector/`，基于 FastMCP），供 CodeBuddy 与 testcase-gen-frontend（Agent SDK）接入。设计上 `gbrain serve` 的查询 :8100 / 写入 :8101 两个实例，已落地为物理隔离的 `knowledgeos-query`（只读）与 `knowledgeos-write`（写入）两个 stdio 服务；连接器是 REST API（`api/server.js`）的薄封装，所有知识逻辑仍在 REST 端实现（含质量门控与冲突检测）。

**工具映射（设计命名 → 实现工具）**：
- 查询服务 `knowledgeos-query`：检索 `search_knowledge`(POST /api/search)、生成 `generate_test_cases`(POST /api/generate-cases)、`case-generator`≈`search_knowledge`+`generate_test_cases`、`tfidf-code-slicer`⇒`tfidf_code_slicer`、`api-graph-builder`⇒`get_knowledge_graph`(GET /api/graph-data)；另含 `list_knowledge_pages`/`get_knowledge_page`/`get_stats`/`list_projects`/`list_drafts`/`get_draft`/`list_conflicts`。
- 写入服务 `knowledgeos-write`：`case-validator`⇒`validate_draft`(POST /api/quality-gate/check)、`conflict-detector`⇒`detect_conflicts`(POST /api/conflicts/detect)、`quality-gate`⇒`quality_gate`、`single-commit`⇒`single_commit`(POST /api/drafts/:id/commit)、`batch-commit`⇒`batch_commit`(POST /api/drafts/batch-commit)；另含 `add_draft`/`update_draft`/`delete_draft`/`edit_knowledge_page`/`resolve_conflict`/`upload_source`/`promote_page`。

**接入（CodeBuddy）**：项目根 `.codebuddy/mcp.json` 已配置两个 stdio 服务，刷新即可加载；REST 基址用环境变量 `KB_API_BASE` 指定（默认 `http://localhost:3000`）。**接入（testcase-gen-frontend / Agent SDK）**：在该应用 `mcpServers` 配置加入同样的 stdio 服务（指向 `mcp_connector/query_server.py` 与 `write_server.py`）。完整工具清单与配置示例见 `mcp_connector/README.md`。

### MCP 查询服务 :8100

**功能**：只读查询通道。暴露检索/切片/图谱类工具，权限为 Brain 只读 + 草稿可写（缓冲层）。配置 `agents/generator.json`。

| 工具 | 说明 |
|------|------|
| case-generator | 根据 query 生成测试用例（只读知识库） |
| tfidf-code-slicer | TF-IDF 代码切片（只读代码库） |
| api-graph-builder | 构建 API 调用图谱（只读） |

**启动方式**：

```bash
gbrain serve --port 8100 --config agents/generator.json
```

**MCP 客户端调用（JSON-RPC 2.0 over stdio/HTTP）**：

```json
{
  "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "case-generator", "arguments": { "query": "支付流程", "project": "default" } }
}
```

**响应示例**：

```json
{
  "jsonrpc": "2.0", "id": 1,
  "result": { "content": [ { "type": "text", "text": "生成的测试用例草稿已写入缓冲层" } ] }
}
```

**注**：工具清单与端口以 `agents/generator.json` 为准。

### MCP 写入服务 :8101

**功能**：写入库通道。暴露校验/提交类工具，权限为 Brain 只读 + 缓存读写 + 可写正式库。配置 `agents/validator.json`。

| 工具 | 说明 |
|------|------|
| case-validator | 校验测试用例质量 |
| conflict-detector | 检测与既有知识冲突 |
| batch-commit | 批量入库 |
| single-commit | 单条入库 |
| quality-gate | 质量门控评估 |

**启动方式**：

```bash
gbrain serve --port 8101 --config agents/validator.json
```

**MCP 客户端调用**：

```json
{
  "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": { "name": "batch-commit", "arguments": { "project": "default", "ids": ["a1b2c3"] } }
}
```

**响应示例**：

```json
{
  "jsonrpc": "2.0", "id": 2,
  "result": { "content": [ { "type": "text", "text": "committed: 1, conflicts: 0" } ] }
}
```

**注**：写入服务对应 REST 的 `/api/drafts/batch-commit` 等能力，权限更严格。

---

## 13. 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0.0 | 2026-07-16 | 初始版本（设计文档，含部分未实现端点） |
| v1.0.1 | 2026-07-22 | 依据 `api/server.js` 真实路由重写，与网页"接口文档"页（#apidocs）同步；移除不存在端点（/api/confirm、/api/brain、/api/dashboard、/api/webhook/* 等），新增 projects/drafts 增删改、conflicts 批量与 detect、quality-gate、audit-log、stats、brain 读写与 promote、graph-data、generate-cases 等真实接口，并标注 MCP 规划状态 |
