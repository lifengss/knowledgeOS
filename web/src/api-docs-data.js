/**
 * 知识管理系统 - 对外开放接口说明（网页文档页数据源）
 * ============================================================
 * 这是"接口说明文档"的单一数据源，由 web/src/app.js 的接口文档页（#apidocs）渲染展示。
 *
 * 【维护约定 / 同步规则】
 * 本文件即 script-check-skill 规定的"接口说明文档"。每次修改 api/server.js 中
 * 的对外 REST API（含路径、参数、返回结构）或 MCP 服务（agents/*.json 暴露的工具/
 * 端口/权限）时，必须同步更新本文件对应条目，确保网页文档页与真实实现一致。
 *
 * 通用约定（适用于所有接口）：
 *  - 统一返回结构：{ success: boolean, data?: any, error?: string }
 *    查询成功时 success=true、结果在 data；失败 success=false、error 含原因。
 *  - 多项目隔离：查询接口通过 ?project=<id> 指定项目；写入接口通过请求体 { project: "<id>" }
 *    指定；未指定时默认 default。Brain 页面按项目私有库 + 共享库合并去重（私有优先）。
 *  - 认证：当前版本未启用鉴权。
 *  - 基址：http://localhost:3000/api （由 api/server.js 托管，端口见服务配置）
 */

window.KB_API_DOCS = {
  meta: {
    baseUrl: 'http://localhost:3000/api',
    version: 'V1.0',
    convention: '所有接口统一返回 { success: boolean, data?: any, error?: string }；失败时为 success=false 且带 error。查询参数多为可选，未传时取服务端默认值。',
    project: '多项目隔离：查询接口用 ?project=<id>，写入接口用请求体 { project: "<id>" }；缺省默认 default。Brain 页面按"项目私有库 + 共享库"合并（私有优先）。',
    mcpStatus: 'MCP 服务已实现：mcp_connector/ 下 query_server.py（只读 knowledgeos-query）与 write_server.py（写入 knowledgeos-write），FastMCP stdio 传输，薄封装下方 REST API。CodeBuddy 经 .codebuddy/mcp.json 接入；testcase-gen-frontend 经 Agent SDK 的 mcpServers 接入。'
  },

  categories: [
    /* ============ 1. 系统与健康 ============ */
    {
      id: 'system',
      name: '系统与健康',
      description: '服务自检与基础信息。',
      endpoints: [
        {
          method: 'GET',
          path: '/api/health',
          summary: '健康检查',
          description: '返回服务存活状态、版本与时间戳，可用于探活与监控。',
          params: [],
          requestExample: 'curl {BASE}/health',
          responseExample: `{
  "status": "ok",
  "version": "1.0.0",
  "time": "2026-07-22T08:00:00.000Z"
}`,
          notes: '无副作用，无需 project 参数。'
        }
      ]
    },

    /* ============ 2. 项目管理 ============ */
    {
      id: 'projects',
      name: '项目管理',
      description: '枚举、创建、删除多项目知识库。配置持久化于 config/projects.json。',
      endpoints: [
        {
          method: 'GET',
          path: '/api/projects',
          summary: '获取多项目配置',
          description: '返回默认项目、共享脑目录与各项目元信息，供前端枚举与切换知识库。',
          params: [],
          requestExample: 'curl {BASE}/projects',
          responseExample: `{
  "success": true,
  "data": {
    "defaultProject": "default",
    "sharedBrain": "brains/_shared",
    "projects": [
      { "id": "default", "name": "默认项目", "description": "", "brainPath": "brain" },
      { "id": "demo", "name": "示例项目", "description": "demo", "brainPath": "brains/demo" }
    ]
  }
}`,
          notes: '只读接口。brainPath 为相对项目根的知识库目录。'
        },
        {
          method: 'POST',
          path: '/api/projects',
          summary: '运行时新建项目',
          description: '创建项目：写入 config/projects.json 并在 brains/<id> 建立私有知识库目录。',
          params: [
            { name: 'id', in: 'body', required: true, desc: '项目 ID（字母/数字/_/-，创建后不可改）' },
            { name: 'name', in: 'body', required: true, desc: '项目名称' },
            { name: 'description', in: 'body', required: false, desc: '项目描述' }
          ],
          requestExample: `curl -X POST {BASE}/projects \\
  -H "Content-Type: application/json" \\
  -d '{"id":"demo2","name":"示例项目二","description":"用于回归测试"}'`,
          responseExample: `{
  "success": true,
  "data": { "id": "demo2", "name": "示例项目二", "description": "用于回归测试", "brainPath": "brains/demo2" }
}`,
          notes: 'id 为空或已存在会被 400 拒绝。'
        },
        {
          method: 'DELETE',
          path: '/api/projects/:id',
          summary: '删除项目',
          description: '移除项目配置并清理其私有 brain 目录（默认项目不可删）。',
          params: [
            { name: 'id', in: 'path', required: true, desc: '项目 ID' }
          ],
          requestExample: 'curl -X DELETE {BASE}/projects/demo2',
          responseExample: `{
  "success": true,
  "data": { "id": "demo2" }
}`,
          notes: '会删除私有知识库文件，操作不可恢复。'
        }
      ]
    },

    /* ============ 3. 草稿管理 ============ */
    {
      id: 'drafts',
      name: '草稿管理',
      description: '测试产物草稿的增删查改与入库（单条/批量）。草稿为进入知识库前的缓冲层。',
      endpoints: [
        {
          method: 'GET',
          path: '/api/drafts',
          summary: '草稿列表',
          description: '分页获取草稿，可按状态/来源/类型过滤。',
          params: [
            { name: 'status', in: 'query', required: false, desc: '状态过滤：pending/approved/conflict/merged/discarded/rejected' },
            { name: 'source', in: 'query', required: false, desc: '来源：human_edit/upload/ai_gen 等' },
            { name: 'type', in: 'query', required: false, desc: '类型：quality_rule/defect_experience/test_case/test_script 等' },
            { name: 'limit', in: 'query', required: false, desc: '每页数量，默认 100' },
            { name: 'offset', in: 'query', required: false, desc: '偏移，默认 0' },
            { name: 'project', in: 'query', required: false, desc: '项目隔离，默认 default' }
          ],
          requestExample: 'curl "{BASE}/drafts?status=pending&limit=20&project=default"',
          responseExample: `{
  "success": true,
  "data": [
    { "id": "a1b2c3", "status": "pending", "source": "human_edit", "type": "quality_rule",
      "title": "空指针防护规则", "score": null, "created_at": "2026-07-22T08:00:00", "project": "default" }
  ]
}`,
          notes: '返回结构为草稿对象数组。'
        },
        {
          method: 'GET',
          path: '/api/drafts/:id',
          summary: '获取单条草稿',
          description: '按 ID 获取草稿完整内容。',
          params: [ { name: 'id', in: 'path', required: true, desc: '草稿 ID' } ],
          requestExample: 'curl {BASE}/drafts/a1b2c3',
          responseExample: `{
  "success": true,
  "data": { "id": "a1b2c3", "status": "pending", "type": "quality_rule", "title": "...", "content": "# 规则\\n...", "metadata": {} }
}`,
          notes: 'content 为 Markdown 正文。'
        },
        {
          method: 'PUT',
          path: '/api/drafts/:id',
          summary: '更新草稿内容（人工编辑）',
          description: '人工修改草稿的标题/正文/类型，入库前可反复编辑。',
          params: [
            { name: 'id', in: 'path', required: true, desc: '草稿 ID' },
            { name: 'title', in: 'body', required: false, desc: '新标题' },
            { name: 'content', in: 'body', required: false, desc: '新 Markdown 正文' },
            { name: 'type', in: 'body', required: false, desc: '新类型（如 quality_rule / defect_experience）' }
          ],
          requestExample: `curl -X PUT {BASE}/drafts/a1b2c3 \\
  -H "Content-Type: application/json" \\
  -d '{"title":"修订后的标题","content":"# 规则\\n修订内容..."}'`,
          responseExample: `{
  "success": true,
  "data": { "success": true }
}`,
          notes: '仅更新传入的字段；不影响草稿状态，仍需单条/批量入库才进入知识库。'
        },
        {
          method: 'POST',
          path: '/api/drafts',
          summary: '创建草稿',
          description: '向缓冲层新增一条草稿（人工编辑或外部写入）。',
          params: [
            { name: 'source', in: 'body', required: false, desc: '来源，默认 human_edit' },
            { name: 'type', in: 'body', required: false, desc: '类型，默认 quality_rule' },
            { name: 'title', in: 'body', required: false, desc: '标题，默认"未命名草稿"' },
            { name: 'content', in: 'body', required: false, desc: 'Markdown 正文' },
            { name: 'metadata', in: 'body', required: false, desc: '附加元数据对象' },
            { name: 'project', in: 'body', required: false, desc: '项目隔离，默认 default' }
          ],
          requestExample: `curl -X POST {BASE}/drafts \\
  -H "Content-Type: application/json" \\
  -d '{"source":"human_edit","type":"quality_rule","title":"空指针防护","content":"# 规则\\n...","project":"default"}'`,
          responseExample: `{
  "success": true,
  "data": { "id": "a1b2c3", "status": "pending", "project": "default" }
}`,
          notes: '返回新建草稿的 ID。'
        },
        {
          method: 'PUT',
          path: '/api/drafts/:id/status',
          summary: '更新草稿状态',
          description: '人工设置草稿状态（如 approved/rejected/discarded）及质量评分。',
          params: [
            { name: 'id', in: 'path', required: true, desc: '草稿 ID' },
            { name: 'status', in: 'body', required: true, desc: '目标状态' },
            { name: 'score', in: 'body', required: false, desc: '质量评分（可选）' }
          ],
          requestExample: `curl -X PUT {BASE}/drafts/a1b2c3/status \\
  -H "Content-Type: application/json" -d '{"status":"approved","score":85}'`,
          responseExample: `{
  "success": true,
  "data": { "id": "a1b2c3", "status": "approved", "score": 85 }
}`,
          notes: '用于人工审核流转。'
        },
        {
          method: 'POST',
          path: '/api/drafts/:id/commit',
          summary: '单条入库',
          description: '将草稿正式提交到知识库（Brain）。会走质量门控，命中冲突可跳过检测。',
          params: [
            { name: 'id', in: 'path', required: true, desc: '草稿 ID' },
            { name: 'skip_conflict_check', in: 'body', required: false, desc: '跳过冲突检测（覆盖用）' },
            { name: 'skip_quality_gate', in: 'body', required: false, desc: '跳过质量门控（谨慎）' },
            { name: 'project', in: 'body', required: false, desc: '项目隔离，默认 default' }
          ],
          requestExample: `curl -X POST {BASE}/drafts/a1b2c3/commit \\
  -H "Content-Type: application/json" -d '{"skip_conflict_check":false}'`,
          responseExample: `{
  "success": true,
  "data": {
    "draftId": "a1b2c3",
    "committedPage": "quality-rules/a1b2c3.md",
    "score": 82,
    "conflictId": null,
    "reason": "ok"
  }
}`,
          notes: '入库后草稿状态置为 merged；若质量不达标或被冲突阻断，返回 reason 说明。'
        },
        {
          method: 'POST',
          path: '/api/drafts/batch-commit',
          summary: '批量入库',
          description: '批量提交草稿；未传 ids 时提交当前项目全部待入库草稿（--all）。',
          params: [
            { name: 'ids', in: 'body', required: false, desc: '草稿 ID 数组；缺省提交全部 pending/approved' },
            { name: 'skip_conflict_check', in: 'body', required: false, desc: '跳过冲突检测' },
            { name: 'skip_quality_gate', in: 'body', required: false, desc: '跳过质量门控' },
            { name: 'project', in: 'body', required: false, desc: '项目隔离，默认 default' }
          ],
          requestExample: `curl -X POST {BASE}/drafts/batch-commit \\
  -H "Content-Type: application/json" \\
  -d '{"ids":["a1b2c3","d4e5f6"],"skip_conflict_check":false}'`,
          responseExample: `{
  "success": true,
  "data": {
    "total": 2, "committed": 2, "skipped": 0,
    "conflicts": [], "details": [ { "draftId": "a1b2c3", "status": "merged" } ]
  }
}`,
          notes: '无变更不写库；命中冲突的草稿进入 conflict 状态等待人工决策。'
        },
        {
          method: 'DELETE',
          path: '/api/drafts/:id',
          summary: '删除单条草稿',
          description: '物理删除一条草稿。',
          params: [ { name: 'id', in: 'path', required: true, desc: '草稿 ID' } ],
          requestExample: 'curl -X DELETE {BASE}/drafts/a1b2c3',
          responseExample: `{ "success": true, "data": { "id": "a1b2c3", "deleted": true } }`,
          notes: '不可恢复。'
        },
        {
          method: 'DELETE',
          path: '/api/drafts',
          summary: '批量删除草稿',
          description: '按 IDs 批量物理删除草稿。',
          params: [ { name: 'ids', in: 'body', required: true, desc: '草稿 ID 数组' } ],
          requestExample: `curl -X DELETE {BASE}/drafts \\
  -H "Content-Type: application/json" -d '{"ids":["a1b2c3","d4e5f6"]}'`,
          responseExample: `{ "success": true, "data": { "deleted": ["a1b2c3","d4e5f6"] } }`,
          notes: 'ids 为空会被 400 拒绝。'
        }
      ]
    },

    /* ============ 4. 冲突管理 ============ */
    {
      id: 'conflicts',
      name: '冲突管理',
      description: '当入库草稿与既有知识规则冲突时进入冲突队列，需人工决策（merge/overwrite/discard/keep_both）。',
      endpoints: [
        {
          method: 'GET',
          path: '/api/conflicts',
          summary: '冲突列表',
          description: '获取冲突队列，可按状态过滤。',
          params: [
            { name: 'status', in: 'query', required: false, desc: '状态过滤（如 pending）' },
            { name: 'limit', in: 'query', required: false, desc: '数量，默认 100' },
            { name: 'project', in: 'query', required: false, desc: '项目隔离，默认 default' }
          ],
          requestExample: 'curl "{BASE}/conflicts?status=pending&project=default"',
          responseExample: `{
  "success": true,
  "data": [
    { "id": 12, "draft_id": "a1b2c3", "existing_rule": "旧规则摘要", "new_rule": "新规则摘要",
      "conflict_type": "content", "resolution": null, "resolved_by": null,
      "resolved_at": null, "created_at": "2026-07-22T08:00:00", "project": "default" }
  ]
}`,
          notes: 'resolution 为 null 表示待处理；处理后写回草稿状态形成闭环。'
        },
        {
          method: 'POST',
          path: '/api/conflicts/detect',
          summary: '触发冲突检测',
          description: '对所有待入库草稿执行与既有知识库的冲突检测，生成/更新冲突队列。',
          params: [],
          requestExample: 'curl -X POST {BASE}/conflicts/detect',
          responseExample: `{ "success": true, "data": { "checked": 5, "conflicts": 2 } }`,
          notes: '无需请求体；作用于当前项目。'
        },
        {
          method: 'PUT',
          path: '/api/conflicts/:id/resolve',
          summary: '处理单条冲突',
          description: '按决议处理冲突并回写对应草稿（merge/overwrite/keep_both→入库；discard→丢弃）。',
          params: [
            { name: 'id', in: 'path', required: true, desc: '冲突记录 ID' },
            { name: 'resolution', in: 'body', required: true, desc: '决议：merge / overwrite / discard / keep_both' }
          ],
          requestExample: `curl -X PUT {BASE}/conflicts/12/resolve \\
  -H "Content-Type: application/json" -d '{"resolution":"merge"}'`,
          responseExample: `{
  "success": true,
  "data": {
    "conflictId": 12, "draftId": "a1b2c3", "resolution": "merge",
    "conflictResolved": true,
    "draftResult": { "success": true, "status": "merged", "committedPage": "quality-rules/a1b2c3.md" }
  }
}`,
          notes: '处理后会同步更新草稿状态，形成"冲突→决策→回写"闭环。'
        },
        {
          method: 'PUT',
          path: '/api/conflicts/resolve-batch',
          summary: '批量处理冲突',
          description: '对一组冲突按同一决议批量处理并回写草稿。',
          params: [
            { name: 'ids', in: 'body', required: true, desc: '冲突 ID 数组' },
            { name: 'resolution', in: 'body', required: true, desc: '统一决议' }
          ],
          requestExample: `curl -X PUT {BASE}/conflicts/resolve-batch \\
  -H "Content-Type: application/json" -d '{"ids":[12,13],"resolution":"merge"}'`,
          responseExample: `{
  "success": true,
  "data": { "total": 2, "resolvedCount": 2, "resolved": [12,13], "failedCount": 0, "failed": [], "draftResults": {} }
}`,
          notes: 'ids 为空会被 400 拒绝。'
        }
      ]
    },

    /* ============ 5. 质量门控 ============ */
    {
      id: 'quality',
      name: '质量门控',
      description: '入库前的质量评估（结构规范、来源可信度等），不达标将被拦截至草稿层。',
      endpoints: [
        {
          method: 'POST',
          path: '/api/quality-gate/check',
          summary: '质量检查',
          description: '对指定草稿（或全部）执行质量门控评估。',
          params: [
            { name: 'draft_ids', in: 'body', required: false, desc: '逗号分隔的草稿 ID；缺省检查全部 pending' },
            { name: 'project', in: 'body', required: false, desc: '项目隔离，默认 default' }
          ],
          requestExample: `curl -X POST {BASE}/quality-gate/check \\
  -H "Content-Type: application/json" -d '{"draft_ids":"a1b2c3,d4e5f6"}'`,
          responseExample: `{
  "success": true,
  "data": {
    "checked": 2, "passed": 1, "failed": 1,
    "results": [ { "draft_id": "a1b2c3", "passed": true, "score": 82, "reason": "ok" } ]
  }
}`,
          notes: 'score 低于阈值（默认 60）视为不通过。'
        }
      ]
    },

    /* ============ 6. 审计与统计 ============ */
    {
      id: 'audit',
      name: '审计与统计',
      description: '操作审计日志与知识库统计大盘。',
      endpoints: [
        {
          method: 'GET',
          path: '/api/audit-log',
          summary: '审计日志',
          description: '查询操作审计记录，支持过滤与分页。',
          params: [
            { name: 'action', in: 'query', required: false, desc: '操作类型过滤（如 commit/delete/promote）' },
            { name: 'operator', in: 'query', required: false, desc: '操作者过滤' },
            { name: 'target', in: 'query', required: false, desc: '目标对象过滤' },
            { name: 'startTime', in: 'query', required: false, desc: '起始时间' },
            { name: 'endTime', in: 'query', required: false, desc: '结束时间' },
            { name: 'page', in: 'query', required: false, desc: '页码，默认 1' },
            { name: 'pageSize', in: 'query', required: false, desc: '每页大小，默认 20' }
          ],
          requestExample: 'curl "{BASE}/audit-log?action=commit&page=1&pageSize=20"',
          responseExample: `{
  "success": true,
  "data": {
    "items": [ { "id": 1, "action": "commit", "operator": "web-ui", "target": "default:quality-rules/a1b2c3.md",
      "detail": "{}", "created_at": "2026-07-22T08:00:00" } ],
    "total": 1, "page": 1, "pageSize": 20
  }
}`,
          notes: '审计记录写入失败不阻断主流程。'
        },
        {
          method: 'GET',
          path: '/api/stats',
          summary: '统计概览',
          description: '汇总当前项目的知识库规模与待办。',
          params: [ { name: 'project', in: 'query', required: false, desc: '项目隔离，默认 default' } ],
          requestExample: 'curl "{BASE}/stats?project=default"',
          responseExample: `{
  "success": true,
  "data": {
    "totalPages": 320, "pendingDrafts": 5, "pendingConflicts": 2,
    "totalRules": 120, "totalCases": 80, "totalDefects": 60,
    "mergedDrafts": 300, "rejectedDrafts": 10, "conflictDrafts": 0
  }
}`,
          notes: 'dashboard 页即消费此接口。'
        }
      ]
    },

    /* ============ 7. 检索与生成 ============ */
    {
      id: 'search',
      name: '检索与生成',
      description: '基于知识库的关键词/语义检索，以及测试用例生成。',
      endpoints: [
        {
          method: 'POST',
          path: '/api/search',
          summary: '知识检索',
          description: '在知识库（按项目私有+共享合并）中检索相关页面片段。',
          params: [
            { name: 'query', in: 'body', required: false, desc: '检索关键词/问题' },
            { name: 'mode', in: 'body', required: false, desc: '检索模式：keyword（默认）/ semantic' },
            { name: 'limit', in: 'body', required: false, desc: '返回条数，默认 10' }
          ],
          requestExample: `curl -X POST {BASE}/search \\
  -H "Content-Type: application/json" -d '{"query":"登录失败处理","mode":"keyword","limit":5}'`,
          responseExample: `{
  "success": true,
  "data": {
    "query": "登录失败处理",
    "results": [ { "category": "defect-experience", "id": "x9", "title": "登录超时", "path": "defect-experience/x9.md", "score": 0.9, "snippet": "..." } ]
  }
}`,
          notes: '结果按相关度排序。'
        },
        {
          method: 'POST',
          path: '/api/generate-cases',
          summary: '生成测试用例',
          description: '基于检索到的知识上下文，调用 case_generator 生成测试用例/脚本草稿。',
          params: [
            { name: 'query', in: 'body', required: false, desc: '生成所需的问题/需求描述' },
            { name: 'limit', in: 'body', required: false, desc: '生成数量，默认 5' }
          ],
          requestExample: `curl -X POST {BASE}/generate-cases \\
  -H "Content-Type: application/json" -d '{"query":"支付流程","limit":3}'`,
          responseExample: `{
  "success": true,
  "data": { "query": "支付流程", "generated": [ { "id": "g1", "type": "test_case", "title": "..." } ] }
}`,
          notes: '生成结果以草稿形式落库，待人工审核入库。'
        }
      ]
    },

    /* ============ 8. 源数据上传 ============ */
    {
      id: 'upload',
      name: '源数据上传',
      description: '导入代码/PRD/需求列表等源数据。代码 → 解析「API 调用依赖」图谱（project-wiki/api-*.md）；PRD/需求列表 → 直接沉淀为「项目描述」Wiki（project-wiki/{prd,req}-*.md），形成项目 Wiki 供按功能模块选测试范围。',
      endpoints: [
        {
          method: 'POST',
          path: '/api/source-upload',
          summary: '上传源数据',
          description: 'multipart 上传文件（支持代码压缩包 zip/tar/7z 或单文件），或 JSON 直接传 content。',
          params: [
            { name: 'file', in: 'form', required: false, desc: '上传文件（代码类自动解析）' },
            { name: 'type', in: 'form/body', required: false, desc: '数据类型：code(默认)/prd/requirement/defect/report' },
            { name: 'note', in: 'form/body', required: false, desc: '文档标题/备注' },
            { name: 'content', in: 'body', required: false, desc: '非文件上传时直接传正文' },
            { name: 'project', in: 'body', required: false, desc: '归属项目，默认 default' }
          ],
          requestExample: `# 代码压缩包（multipart）
curl -X POST {BASE}/source-upload -F "file=@code.zip" -F "type=code" -F "project=default"
# PRD（沉淀为项目描述 Wiki）
curl -X POST {BASE}/source-upload -F "file=@prd.md" -F "type=prd" -F "note=电商平台PRD" -F "project=default"
# 需求列表
curl -X POST {BASE}/source-upload -F "file=@req.md" -F "type=requirement" -F "note=需求列表" -F "project=default"`,
          responseExample: `{
  "success": true,
  "data": { "summary": "已沉淀为项目描述 Wiki：prd-xxx.md", "slug": "prd-xxx", "uploadType": "prd", "category": "project-wiki" }
}`,
          notes: 'code → 解压切片解析写入草稿并生成 API 依赖图谱(api-overview.md)；prd/requirement → 直接写入 project-wiki（前端「按功能模块」测试范围的数据源），区别于代码产生的 API 调用依赖图谱。'
        },
        {
          method: 'GET',
          path: '/api/wiki-modules',
          summary: '抽取功能模块',
          description: '从项目描述 Wiki（PRD / 需求列表）解析功能模块清单，供前端「按功能模块」选择测试范围。',
          params: [
            { name: 'project', in: 'query', required: false, desc: '项目隔离，默认 default' }
          ],
          requestExample: 'curl "{BASE}/wiki-modules?project=default"',
          responseExample: `{
  "success": true,
  "data": { "available": true, "source": "prd", "modules": [ { "id": "用户管理", "label": "用户管理" } ] }
}`,
          notes: '优先级：需求列表(req-*) > PRD(prd-*)；两者皆无则 available=false（前端该标签禁用）。模块取自文档二级/三级标题。'
        }
      ]
    },

    /* ============ 9. GBrain 知识页面 ============ */
    {
      id: 'brain',
      name: 'GBrain 知识页面',
      description: '知识库（Brain）页面的读取、晋升共享与删除。分类：quality-rules / defect-experience / project-wiki / test-cases。',
      endpoints: [
        {
          method: 'GET',
          path: '/api/brain/pages',
          summary: '知识页面列表',
          description: '合并项目私有库与共享库（私有优先去重）列出页面。',
          params: [
            { name: 'category', in: 'query', required: false, desc: '分类过滤；缺省全部四类' },
            { name: 'limit', in: 'query', required: false, desc: '每类上限，默认 100' },
            { name: 'project', in: 'query', required: false, desc: '项目隔离，默认 default' }
          ],
          requestExample: 'curl "{BASE}/brain/pages?category=quality-rules&project=default"',
          responseExample: `{
  "success": true,
  "data": [ { "id": "a1b2c3", "title": "空指针防护", "category": "quality-rules", "filename": "a1b2c3.md", "repo": "brain", "preview": "..." } ]
}`,
          notes: 'repo 标识来自私有库(brain)还是共享库(_shared)。'
        },
        {
          method: 'GET',
          path: '/api/brain/pages/:category/:id',
          summary: '获取单页内容',
          description: '按分类与 ID 读取某个知识页面完整 Markdown 内容。',
          params: [
            { name: 'category', in: 'path', required: true, desc: '分类' },
            { name: 'id', in: 'path', required: true, desc: '页面 ID（不含 .md）' }
          ],
          requestExample: 'curl {BASE}/brain/pages/quality-rules/a1b2c3',
          responseExample: `{ "success": true, "data": { "content": "# 空指针防护\\n...", "repo": "brain" } }`,
          notes: 'id 不含扩展名。'
        },
        {
          method: 'PUT',
          path: '/api/brain/pages/:category/:id',
          summary: '编辑页面内容（人工修改）',
          description: '人工修改已发布的知识页面正文，写回其原所在仓库（私有优先于共享）。',
          params: [
            { name: 'category', in: 'path', required: true, desc: '分类（须为合法分类）' },
            { name: 'id', in: 'path', required: true, desc: '页面 ID（不含 .md）' },
            { name: 'content', in: 'body', required: true, desc: '新 Markdown 正文' },
            { name: 'project', in: 'body', required: false, desc: '项目隔离，默认 default' }
          ],
          requestExample: `curl -X PUT {BASE}/brain/pages/quality-rules/a1b2c3 \\
  -H "Content-Type: application/json" -d '{"content":"# 空指针防护\\n修订后的内容..."}'`,
          responseExample: `{ "success": true, "data": { "category": "quality-rules", "id": "a1b2c3", "repo": "brain", "size": 128 } }`,
          notes: '写回原仓库，repo 不变；标题由正文首个 # 标题自动派生；记录审计日志(action=edit)。'
        },
        {
          method: 'POST',
          path: '/api/brain/pages/:category/:id/propose-edit',
          summary: '提交编辑（人工编辑优化闭环）',
          description: '人工修改已发布页面时不直接写盘，而是生成两条草稿：A. 知识条目修改草稿(type=knowledge_edit，确认入库后写回原仓库)；B. 质量规则草稿(type=quality_rule，由 old/new 对比自动提炼，进草稿箱待确认)。',
          params: [
            { name: 'category', in: 'path', required: true, desc: '分类（须为合法分类）' },
            { name: 'id', in: 'path', required: true, desc: '页面 ID（不含 .md）' },
            { name: 'content', in: 'body', required: true, desc: '新 Markdown 正文' },
            { name: 'repo', in: 'body', required: false, desc: '原仓库标识(brain/_shared)，缺省按原文件所在仓库' },
            { name: 'project', in: 'body', required: false, desc: '项目隔离，默认 default' }
          ],
          requestExample: `curl -X POST {BASE}/brain/pages/quality-rules/a1b2c3/propose-edit \\
  -H "Content-Type: application/json" -d '{"content":"# 空指针防护\\n修订后的内容..."}'`,
          responseExample: `{
  "success": true,
  "data": {
    "editDraftId": "e1f2",
    "ruleDraftId": "r3s4",
    "note": "已生成编辑草稿与质量规则草稿，请在草稿箱确认入库。"
  }
}`,
          notes: '不直接写盘；质量规则优先 AI 提炼，失败回退确定性 diff。两条草稿需在草稿箱分别确认入库。'
        },
        {
          method: 'GET',
          path: '/api/brain/private-pages',
          summary: '私有库页面列表',
          description: '仅列出当前项目私有知识库页面（不含共享库），供筛选晋升。',
          params: [ { name: 'project', in: 'query', required: false, desc: '项目隔离，默认 default' } ],
          requestExample: 'curl "{BASE}/brain/private-pages?project=default"',
          responseExample: `{
  "success": true,
  "data": { "project": "default", "pages": [ { "category": "quality-rules", "id": "a1b2c3", "path": "quality-rules/a1b2c3.md", "title": "空指针防护", "size": 1024, "mtime": "2026-07-22T08:00:00" } ] }
}`,
          notes: '用于"晋升私有知识到共享库"弹窗。'
        },
        {
          method: 'POST',
          path: '/api/brain/promote',
          summary: '晋升到共享库',
          description: '将项目私有页面复制/移动到共享知识库 brains/_shared，对所有项目可见。',
          params: [
            { name: 'project', in: 'body', required: false, desc: '项目隔离，默认 default' },
            { name: 'pagePath', in: 'body', required: true, desc: '页面路径，格式 <分类>/<文件名.md>' },
            { name: 'mode', in: 'body', required: false, desc: 'copy（默认，保留私有）/ move（移除私有）' }
          ],
          requestExample: `curl -X POST {BASE}/brain/promote \\
  -H "Content-Type: application/json" -d '{"pagePath":"quality-rules/a1b2c3.md","mode":"copy"}'`,
          responseExample: `{ "success": true, "data": { "project": "default", "pagePath": "quality-rules/a1b2c3.md", "mode": "copy", "dest": "brains/_shared/quality-rules/a1b2c3.md" } }`,
          notes: '非法路径/分类会被 400 拒绝；含 .. 视为非法。'
        },
        {
          method: 'DELETE',
          path: '/api/brain/pages/:category/:id',
          summary: '删除单页',
          description: '删除知识库某页面（同时匹配私有/共享库）。',
          params: [
            { name: 'category', in: 'path', required: true, desc: '分类（须为合法分类）' },
            { name: 'id', in: 'path', required: true, desc: '页面 ID（不含 .md）' }
          ],
          requestExample: 'curl -X DELETE {BASE}/brain/pages/quality-rules/a1b2c3',
          responseExample: `{ "success": true, "data": { "category": "quality-rules", "id": "a1b2c3", "path": "brain/quality-rules/a1b2c3.md" } }`,
          notes: '非法分类/文件名会被拒绝；记录审计日志。'
        },
        {
          method: 'DELETE',
          path: '/api/brain/pages',
          summary: '批量删除页面',
          description: '按 items 批量删除知识库页面。',
          params: [ { name: 'items', in: 'body', required: true, desc: '数组，元素 { category, id }' } ],
          requestExample: `curl -X DELETE {BASE}/brain/pages \\
  -H "Content-Type: application/json" -d '{"items":[{"category":"quality-rules","id":"a1b2c3"}]}'`,
          responseExample: `{ "success": true, "data": { "deleted": [ { "category": "quality-rules", "id": "a1b2c3" } ], "count": 1 } }`,
          notes: 'items 为空会被 400 拒绝。'
        }
      ]
    },

    /* ============ 10. 图谱 ============ */
    {
      id: 'graph',
      name: '图谱数据',
      description: '解析 project-wiki 的 WikiLinks 与代码调用关系，导出图谱节点与边。',
      endpoints: [
        {
          method: 'GET',
          path: '/api/graph-data',
          summary: '获取图谱数据',
          description: '返回知识/代码实体节点与关系边，供前端力导向图渲染。',
          params: [ { name: 'project', in: 'query', required: false, desc: '项目隔离，默认 default' } ],
          requestExample: 'curl "{BASE}/graph-data?project=default"',
          responseExample: `{
  "success": true,
  "data": {
    "nodes": [ { "id": "m:auth", "label": "认证模块", "type": "module", "repo": "brain" } ],
    "edges": [ { "source": "m:auth", "target": "m:login", "type": "wiki-link" } ]
  }
}`,
          notes: 'project-wiki 不存在时返回空节点/边。'
        }
      ]
    },

    /* ============ 10.5 AI 平台对接（AI Adapter） ============ */
    {
      id: 'aiadapter',
      name: 'AI 平台对接',
      description: '知识库侧 AI 平台适配器（对齐 testcase-gen-frontend 系统设置）：codebuddy/openai/none 三通道，' +
        '配置持久化于 data/ai_config.json。generate-quality-rule 用于“链路 3a 人工编辑优化”——由编辑前后内容生成质量规则（AI 提炼，失败回退确定性 diff）。',
      endpoints: [
        {
          method: 'GET',
          path: '/api/ai-settings',
          desc: '读取 AI 平台对接配置（provider / endpoint / apiKey / model / useCustomModel）。',
          request: '无',
          response: '{ success, data: { ai: { provider, useCustomModel, endpoint, apiKey, model } } }'
        },
        {
          method: 'PUT',
          path: '/api/ai-settings',
          desc: '更新 AI 平台配置并持久化。provider = openai | codebuddy | none。',
          request: '{ ai: { provider, endpoint, apiKey, model, useCustomModel } }',
          response: '{ success, data: { ai: {...} } }'
        },
        {
          method: 'POST',
          path: '/api/generate-quality-rule',
          desc: '由人工编辑前后内容生成质量规则（Markdown）。AI 不可用时回退确定性 diff。',
          request: '{ title, old, new }',
          response: '{ success, data: { source: "ai" | "deterministic", content: "<Markdown>" } }'
        }
      ]
    },

    /* ============ 11. MCP 服务（已实现） ============ */
    {
      id: 'mcp',
      name: 'MCP 服务（已实现）',
      description: '面向 AI Agent 的 Model Context Protocol 接口，已实现为 stdio 传输的 MCP 服务（mcp_connector/，FastMCP）。' +
        '物理隔离为 knowledgeos-query（只读）与 knowledgeos-write（写入）两个 stdio 服务，薄封装下方 REST API，所有知识逻辑仍在 REST 端实现。',
      endpoints: [
        {
          method: 'MCP',
          path: 'MCP 查询服务 :8100',
          summary: '只读查询通道',
          description: '暴露检索/切片/图谱类工具，权限为 Brain 只读 + 草稿可写（缓冲层）。配置 agents/generator.json。',
          params: [
            { name: 'case-generator', in: 'tool', required: false, desc: '根据 query 生成测试用例（只读知识库）' },
            { name: 'tfidf-code-slicer', in: 'tool', required: false, desc: 'TF-IDF 代码切片（只读代码库）' },
            { name: 'api-graph-builder', in: 'tool', required: false, desc: '构建 API 调用图谱（只读）' }
          ],
          requestExample: `# 启动查询服务
gbrain serve --port 8100 --config agents/generator.json

# MCP 客户端调用（JSON-RPC 2.0 over stdio/HTTP）
{
  "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "case-generator", "arguments": { "query": "支付流程", "project": "default" } }
}`,
          responseExample: `{
  "jsonrpc": "2.0", "id": 1,
  "result": { "content": [ { "type": "text", "text": "生成的测试用例草稿已写入缓冲层" } ] }
}`,
          notes: '工具清单与端口以 agents/generator.json 为准。'
        },
        {
          method: 'MCP',
          path: 'MCP 写入服务 :8101',
          summary: '写入库通道',
          description: '暴露校验/提交类工具，权限为 Brain 只读 + 缓存读写 + 可写正式库。配置 agents/validator.json。',
          params: [
            { name: 'case-validator', in: 'tool', required: false, desc: '校验测试用例质量' },
            { name: 'conflict-detector', in: 'tool', required: false, desc: '检测与既有知识冲突' },
            { name: 'batch-commit', in: 'tool', required: false, desc: '批量入库' },
            { name: 'single-commit', in: 'tool', required: false, desc: '单条入库' },
            { name: 'quality-gate', in: 'tool', required: false, desc: '质量门控评估' }
          ],
          requestExample: `# 启动写入服务
gbrain serve --port 8101 --config agents/validator.json

# MCP 客户端调用
{
  "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": { "name": "batch-commit", "arguments": { "project": "default", "ids": ["a1b2c3"] } }
}`,
          responseExample: `{
  "jsonrpc": "2.0", "id": 2,
  "result": { "content": [ { "type": "text", "text": "committed: 1, conflicts: 0" } ] }
}`,
          notes: '写入服务对应 REST 的 /api/drafts/batch-commit 等能力，权限更严格。'
        }
      ]
    }
  ]
};

/* =================== 渲染函数（供 app.js 调用：window.renderApiDocs） =================== */
window.renderApiDocs = function () {
  const docs = window.KB_API_DOCS;
  const base = docs.meta.baseUrl;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function methodBadge(m) {
    const cls = { GET: 'get', POST: 'post', PUT: 'put', DELETE: 'del', MCP: 'mcp' }[m] || 'get';
    return `<span class="method-badge mb-${cls}">${esc(m)}</span>`;
  }
  function paramRows(params) {
    if (!params || !params.length) return '<p class="no-param">无参数</p>';
    return `<table class="param-table">
      <thead><tr><th>参数</th><th>位置</th><th>必填</th><th>说明</th></tr></thead>
      <tbody>${params.map(p => `<tr>
        <td><code>${esc(p.name)}</code></td>
        <td>${esc(p.in)}</td>
        <td>${p.required ? '<span class="req">是</span>' : '否'}</td>
        <td>${esc(p.desc)}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  // 类别导航
  const nav = docs.categories.map((c, i) =>
    `<a href="#cat-${c.id}" class="cat-nav-item">${i + 1}. ${esc(c.name)}</a>`
  ).join('');

  // 各分类内容
  const sections = docs.categories.map((c) => {
    const cards = c.endpoints.map((e, idx) => {
      const uid = `curl-${c.id}-${idx}`;
      const req = (e.requestExample || '').replace(/\{BASE\}/g, base);
      const resp = e.responseExample || '';
      return `<div class="api-card">
        <div class="api-card-head">
          ${methodBadge(e.method)}
          <code class="api-path">${esc(e.path)}</code>
          <span class="api-summary">${esc(e.summary || '')}</span>
          <button class="copy-btn" data-copy="${uid}" onclick="KB_copy(this)">复制</button>
        </div>
        <p class="api-desc">${esc(e.description || '')}</p>
        ${paramRows(e.params)}
        <div class="code-block">
          <div class="code-label">调用方式（curl）</div>
          <pre id="${uid}">${esc(req)}</pre>
        </div>
        <div class="code-block">
          <div class="code-label">返回内容</div>
          <pre>${esc(resp)}</pre>
        </div>
        ${e.notes ? `<p class="api-notes">注：${esc(e.notes)}</p>` : ''}
      </div>`;
    }).join('');
    return `<section class="api-section" id="cat-${c.id}">
      <h3 class="section-title">${esc(c.name)}</h3>
      ${c.description ? `<p class="cat-desc">${esc(c.description)}</p>` : ''}
      ${cards}
    </section>`;
  }).join('');

  return `
    <div class="api-docs">
      <div class="api-meta card">
        <div class="api-meta-row"><span class="api-meta-k">接口基址</span><code>${esc(base)}</code></div>
        <div class="api-meta-row"><span class="api-meta-k">版本</span><code>${esc(docs.meta.version)}</code></div>
        <div class="api-meta-row"><span class="api-meta-k">返回约定</span><span>${esc(docs.meta.convention)}</span></div>
        <div class="api-meta-row"><span class="api-meta-k">多项目隔离</span><span>${esc(docs.meta.project)}</span></div>
        <div class="api-meta-row"><span class="api-meta-k">MCP 状态</span><span>${esc(docs.meta.mcpStatus)}</span></div>
      </div>
      <nav class="cat-nav">${nav}</nav>
      ${sections}
    </div>`;
};

// 复制按钮全局处理函数
window.KB_copy = function (btn) {
  const id = btn.getAttribute('data-copy');
  const el = document.getElementById(id);
  if (!el) return;
  const text = el.innerText;
  const done = () => { btn.textContent = '已复制'; setTimeout(() => (btn.textContent = '复制'), 1200); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
};
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) {}
  document.body.removeChild(ta);
}
