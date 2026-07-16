# 知识管理系统 V1.0 接口文档

> 本文档描述 V1.0 所有外部接口与内部模块接口。
> - REST API 遵循 RESTful 设计规范
> - 内部模块接口遵循 JSDoc / TSDoc 注释规范

---

## 1. 接口总览

### 1.1 接口分类

| 接口类型 | 协议 | 调用方 | 说明 |
|----------|------|--------|------|
| REST API | HTTP | 业务系统前端、Web UI、SDK | 标准化 OpenAPI 文档 |
| MCP 接口 | MCP Protocol | AI 平台（CodeBuddy/WorkBuddy/Coze） | 知识查询 / 知识写入 |
| 内部模块接口 | TypeScript / JavaScript | 系统内部各层 | 缓冲层、Skills、工具函数 |
| Python 子进程接口 | STDIN/STDOUT/JSON | tfidf-code-slicer Skill | 代码解析 |

### 1.2 基础信息

| 项目 | 内容 |
|------|------|
| REST API Base URL | `http://localhost:3000` |
| MCP 查询接口 | `http://localhost:8100` |
| MCP 写入接口 | `http://localhost:8101` |
| OpenAPI 文档 | `api/openapi.yaml` |
| 内容协商 | 请求/响应均为 `application/json` |
| 认证方式 | V1.0 暂不启用，V2.0 接入 SSO |

### 1.3 HTTP 状态码

| 状态码 | 含义 | 使用场景 |
|--------|------|----------|
| 200 OK | 请求成功 | GET/POST/PUT/DELETE 成功 |
| 201 Created | 资源创建成功 | 批量写入、源数据导入 |
| 400 Bad Request | 请求参数错误 | 缺少必填字段、格式错误 |
| 404 Not Found | 资源不存在 | 页面/草稿/冲突 ID 不存在 |
| 409 Conflict | 业务冲突 | 草稿冲突未处理、重复提交 |
| 500 Internal Server Error | 服务器内部错误 | 内核异常、数据库错误 |

### 1.4 通用响应格式

```json
{
  "success": true,
  "message": "操作成功",
  "data": {}
}
```

错误响应：

```json
{
  "success": false,
  "message": "错误描述",
  "errorCode": "ERROR_CODE"
}
```

---

## 2. RESTful API 接口

### 2.1 源数据管理

#### POST /api/source-upload

**功能**：上传 PRD、代码、缺陷、执行结果等源数据文件到知识库

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | 数据类型：`prd` / `code` / `defect` / `report` |
| file | file | 是 | 上传文件 |
| note | string | 否 | 备注说明 |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/source-upload \
  -F "type=prd" \
  -F "file=@/path/to/prd.md" \
  -F "note=用户登录模块PRD"
```

**响应示例**：

```json
{
  "success": true,
  "message": "源数据上传成功",
  "data": {
    "fileName": "prd.md",
    "importedPages": ["project-wiki/user-login-flow.md"]
  }
}
```

**错误码**：

| 错误码 | 说明 |
|--------|------|
| MISSING_FILE | 未上传文件 |
| INVALID_TYPE | 数据类型不合法 |
| IMPORT_FAILED | 导入失败 |

---

### 2.2 用户确认操作

#### POST /api/confirm

**功能**：对草稿执行入库或丢弃等确认操作

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| draftId | string | 是 | 草稿 ID |
| action | string | 是 | 操作类型：`commit` / `discard` |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/confirm \
  -H "Content-Type: application/json" \
  -d '{"draftId": "D-20260715-001", "action": "commit"}'
```

**响应示例**：

```json
{
  "success": true,
  "message": "草稿入库成功",
  "data": {
    "draftId": "D-20260715-001",
    "committedPages": ["quality-rules/QR-018.md"]
  }
}
```

**错误码**：

| 错误码 | 说明 |
|--------|------|
| DRAFT_NOT_FOUND | 草稿不存在 |
| INVALID_ACTION | 操作类型不合法 |
| CONFLICT_UNRESOLVED | 草稿存在未处理冲突 |
| QUALITY_CHECK_FAILED | 质量评分未通过 |

---

### 2.3 知识库浏览

#### GET /api/brain

**功能**：获取知识库页面列表

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 否 | 页面类型：`quality-rule` / `defect` / `project-wiki` / `test-case` |
| category | string | 否 | 分类 |
| keyword | string | 否 | 关键词搜索 |
| page | integer | 否 | 页码，默认 1 |
| pageSize | integer | 否 | 每页数量，默认 20 |

**请求示例**：

```bash
curl "http://localhost:3000/api/brain?type=quality-rule&keyword=camelCase"
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "total": 24,
    "page": 1,
    "pageSize": 20,
    "items": [
      {
        "id": "QR-001",
        "title": "编码规范：函数命名使用 camelCase",
        "type": "quality-rule",
        "category": "coding-standards",
        "updated": "2026-07-15",
        "status": "active"
      }
    ]
  }
}
```

---

#### GET /api/brain/{pageId}

**功能**：获取知识库页面详情

**路径参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pageId | string | 是 | 页面 ID |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "id": "QR-001",
    "title": "编码规范：函数命名使用 camelCase",
    "type": "quality-rule",
    "category": "coding-standards",
    "content": "# 编码规范...",
    "frontmatter": {
      "type": "quality-rule",
      "rule_id": "QR-001",
      "status": "active"
    },
    "updated": "2026-07-15",
    "status": "active"
  }
}
```

---

### 2.4 知识库批量读写

#### POST /api/brain/batch-read

**功能**：根据 ID 列表批量读取 Brain 页面

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pageIds | string[] | 是 | 页面 ID 列表 |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/brain/batch-read \
  -H "Content-Type: application/json" \
  -d '{"pageIds": ["QR-001", "TC-001"]}'
```

**响应示例**：

```json
{
  "success": true,
  "data": [
    {
      "id": "QR-001",
      "title": "编码规范：函数命名使用 camelCase",
      "content": "..."
    }
  ]
}
```

---

#### POST /api/brain/batch-write

**功能**：批量导入或更新 Brain 页面

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pages | object[] | 是 | 页面列表，每个页面包含 id/title/type/content/frontmatter |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/brain/batch-write \
  -H "Content-Type: application/json" \
  -d '{
    "pages": [
      {
        "id": "QR-018",
        "title": "新增：密码复杂度校验规则",
        "type": "quality-rule",
        "content": "# 密码复杂度...",
        "frontmatter": {"type": "quality-rule", "rule_id": "QR-018"}
      }
    ]
  }'
```

**响应示例**：

```json
{
  "success": true,
  "message": "批量写入成功",
  "data": {
    "created": 1,
    "updated": 0,
    "failed": 0
  }
}
```

---

### 2.5 全量检索

#### POST /api/search

**功能**：支持 RRF 混合搜索、关键词搜索、知识图谱查询

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | 是 | 查询内容 |
| mode | string | 是 | 检索模式：`rrf` / `keyword` / `graph` |
| limit | integer | 否 | 返回结果数量，默认 10 |
| filters | object | 否 | 过滤条件，如 type、category |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "用户登录", "mode": "rrf", "limit": 5}'
```

**响应示例**：

```json
{
  "success": true,
  "data": [
    {
      "id": "TC-001",
      "title": "测试用例：用户登录",
      "type": "test-case",
      "score": 0.92,
      "snippet": "正向用例：使用有效账号密码登录..."
    }
  ]
}
```

---

### 2.6 草稿管理

#### GET /api/drafts

**功能**：获取草稿列表

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 否 | 草稿状态：`pending` / `conflict` / `merged` / `discarded` / `rejected` / `expired` |
| source | string | 否 | 来源：`human_edit` / `execution_feedback` |
| type | string | 否 | 草稿类型 |

**响应示例**：

```json
{
  "success": true,
  "data": [
    {
      "id": "D-20260715-001",
      "source": "human_edit",
      "type": "quality_rule",
      "title": "新增：密码复杂度校验规则",
      "status": "pending",
      "createdAt": "2026-07-15 14:32"
    }
  ]
}
```

---

### 2.7 冲突处理

#### GET /api/conflicts

**功能**：获取冲突列表

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 否 | 冲突状态：`pending` / `resolved` |
| type | string | 否 | 冲突类型：`duplicate` / `contradiction` / `overlap` |

**响应示例**：

```json
{
  "success": true,
  "data": [
    {
      "id": "C-001",
      "draftId": "D-20260715-001",
      "type": "overlap",
      "existingRule": "QR-008 密码长度不得小于 8 位",
      "newRule": "新增密码复杂度校验规则",
      "status": "pending"
    }
  ]
}
```

---

#### POST /api/conflicts/{conflictId}/resolve

**功能**：对冲突执行合并、覆盖或丢弃操作

**路径参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| conflictId | string | 是 | 冲突 ID |

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| resolution | string | 是 | 处理方式：`merge` / `overwrite` / `discard` |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/conflicts/C-001/resolve \
  -H "Content-Type: application/json" \
  -d '{"resolution": "merge"}'
```

**响应示例**：

```json
{
  "success": true,
  "message": "冲突已合并",
  "data": {
    "conflictId": "C-001",
    "resolution": "merge"
  }
}
```

---

### 2.8 审计日志

#### GET /api/audit

**功能**：获取操作审计日志

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 否 | 操作类型 |
| operator | string | 否 | 操作者 |
| target | string | 否 | 操作对象 |
| startTime | string | 否 | 开始时间，ISO 8601 |
| endTime | string | 否 | 结束时间，ISO 8601 |
| page | integer | 否 | 页码 |
| pageSize | integer | 否 | 每页数量 |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "total": 156,
    "items": [
      {
        "id": "A-001",
        "action": "commit",
        "operator": "user-1",
        "target": "QR-012",
        "detail": "批量入库质量规则",
        "createdAt": "2026-07-15 10:15"
      }
    ]
  }
}
```

---

### 2.9 全局统计面板

#### GET /api/dashboard

**功能**：返回入库数量、草稿堆积量、冲突次数、检索频次等统计指标

**响应示例**：

```json
{
  "success": true,
  "data": {
    "commitCount": 156,
    "pendingDraftCount": 3,
    "pendingConflictCount": 2,
    "searchCount": 342,
    "qualityScoreAvg": 76,
    "today": {
      "commitCount": 5,
      "searchCount": 48
    },
    "thisWeek": {
      "commitCount": 23,
      "searchCount": 342
    }
  }
}
```

---

### 2.10 验证性推理测试

#### POST /api/verify-search

**功能**：输入测试问题，调用知识库做单次检索/推理

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| question | string | 是 | 测试问题 |
| mode | string | 否 | 检索模式，默认 `rrf` |
| limit | integer | 否 | 返回数量，默认 5 |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/verify-search \
  -H "Content-Type: application/json" \
  -d '{"question": "用户登录接口需要校验哪些边界条件？"}'
```

**响应示例**：

```json
{
  "success": true,
  "data": [
    {
      "id": "QR-001",
      "title": "编码规范：函数命名使用 camelCase",
      "score": 0.85,
      "snippet": "..."
    }
  ]
}
```

---

### 2.11 变更回调

#### POST /api/webhook/register

**功能**：注册知识库变更时的回调地址

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是 | 回调地址 |
| events | string[] | 是 | 关注事件：`page_created` / `page_updated` / `draft_committed` / `conflict_detected` |
| secret | string | 否 | 回调签名密钥 |

**请求示例**：

```bash
curl -X POST http://localhost:3000/api/webhook/register \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhook/knowledge",
    "events": ["page_created", "draft_committed"]
  }'
```

**响应示例**：

```json
{
  "success": true,
  "message": "回调注册成功",
  "data": {
    "webhookId": "WH-001"
  }
}
```

---

## 3. MCP 接口

### 3.1 接口说明

MCP 接口不是 AI 智能体，而是知识系统的接口服务。AI 平台 harness 负责工具调用编排、大模型调用、多轮对话，知识系统仅通过 MCP 协议暴露知识查询/写入接口。

### 3.2 知识查询接口

| 项目 | 内容 |
|------|------|
| 配置文件 | `agents/generator.json` |
| 端口 | 8100 |
| 权限 | Brain 只读、缓存可写草稿、禁止写入正式库 |
| 暴露工具 | `case-generator`、`tfidf-code-slicer`、`api-graph-builder` |

**调用方式**：

```bash
gbrain serve --port 8100 --config agents/generator.json
```

**主要能力**：
- RRF 混合搜索
- 知识图谱查询
- Brain 页面读取
- 草稿写入（仅 drafts 表）

### 3.3 知识写入接口

| 项目 | 内容 |
|------|------|
| 配置文件 | `agents/validator.json` |
| 端口 | 8101 |
| 权限 | Brain 只读、缓存读写、可写入正式库 |
| 暴露工具 | `case-validator`、`conflict-detector`、`batch-commit`、`single-commit`、`quality-gate` |

**调用方式**：

```bash
gbrain serve --port 8101 --config agents/validator.json
```

**主要能力**：
- 读取待入库草稿
- 冲突检测
- 质量门控
- 批量/单条入库
- 增量刷新 API 图谱

---

## 4. 内部模块接口

### 4.1 注释规范

所有 TypeScript/JavaScript 模块使用 JSDoc / TSDoc 注释：

```typescript
/**
 * 函数简短描述
 * @param paramName 参数说明
 * @param options 可选参数说明
 * @returns 返回值说明
 * @throws 异常说明
 * @example
 * ```ts
 * const result = myFunction('value');
 * ```
 */
```

### 4.2 缓冲层模块

#### DraftCache

文件位置：`cache/draft-cache.ts`

```typescript
/**
 * 草稿缓存管理器
 * 负责 drafts 表的增删改查
 */
export class DraftCache {
  /**
   * 创建 DraftCache 实例
   * @param dbPath SQLite 数据库文件路径
   */
  constructor(dbPath: string);

  /**
   * 添加草稿
   * @param draft 草稿对象
   * @returns 新增草稿的 ID
   */
  addDraft(draft: DraftInput): string;

  /**
   * 获取指定状态的草稿列表
   * @param status 草稿状态
   * @returns 草稿列表
   */
  getDraftsByStatus(status: DraftStatus): Draft[];

  /**
   * 根据 ID 获取草稿
   * @param id 草稿 ID
   * @returns 草稿对象，不存在返回 null
   */
  getDraftById(id: string): Draft | null;

  /**
   * 更新草稿状态
   * @param id 草稿 ID
   * @param status 新状态
   * @returns 是否更新成功
   */
  updateDraftStatus(id: string, status: DraftStatus): boolean;

  /**
   * 清理过期草稿
   * @param days 过期天数阈值
   * @returns 清理数量
   */
  cleanupStaleDrafts(days: number): number;
}
```

#### ConflictQueue

文件位置：`cache/conflict-queue.ts`

```typescript
/**
 * 冲突队列管理器
 * 负责 conflicts 表的增删改查
 */
export class ConflictQueue {
  /**
   * 创建 ConflictQueue 实例
   * @param dbPath SQLite 数据库文件路径
   */
  constructor(dbPath: string);

  /**
   * 添加冲突记录
   * @param conflict 冲突对象
   * @returns 冲突记录 ID
   */
  addConflict(conflict: ConflictInput): string;

  /**
   * 获取未处理冲突列表
   * @returns 冲突列表
   */
  getPendingConflicts(): Conflict[];

  /**
   * 处理冲突
   * @param id 冲突 ID
   * @param resolution 处理方式：merge / overwrite / discard
   * @param operator 处理人
   * @returns 是否处理成功
   */
  resolveConflict(id: string, resolution: ConflictResolution, operator: string): boolean;
}
```

#### AuditLog

文件位置：`cache/audit-log.ts`

```typescript
/**
 * 审计日志管理器
 */
export class AuditLog {
  /**
   * 创建 AuditLog 实例
   * @param dbPath SQLite 数据库文件路径
   */
  constructor(dbPath: string);

  /**
   * 记录操作日志
   * @param action 操作类型
   * @param operator 操作者
   * @param target 操作对象
   * @param detail 详情 JSON
   * @returns 日志 ID
   */
  log(action: AuditAction, operator: string, target: string, detail: object): string;

  /**
   * 查询日志
   * @param filters 过滤条件
   * @returns 日志列表
   */
  query(filters: AuditQueryFilters): AuditEntry[];
}
```

### 4.3 Skills 模块

#### conflict-detector

文件位置：`skills/conflict-detector.md`

```typescript
/**
 * 检测草稿与已有规则的冲突
 * @param drafts 待检测草稿列表
 * @param rules 已有质量规则列表
 * @returns 冲突列表
 */
function detectConflicts(drafts: Draft[], rules: BrainPage[]): Conflict[];
```

#### quality-gate

文件位置：`skills/quality-gate.md`

```typescript
/**
 * 对草稿进行质量评分
 * @param draft 待评分草稿
 * @returns 评分结果与通过状态
 */
function checkQuality(draft: Draft): QualityResult;
```

#### batch-commit

文件位置：`skills/batch-commit.md`

```typescript
/**
 * 批量确认入库
 * @param draftIds 草稿 ID 列表
 * @returns 入库结果
 * @throws ConflictUnresolvedError 存在未处理冲突
 * @throws QualityCheckFailedError 质量评分未通过
 */
function batchCommit(draftIds: string[]): CommitResult;
```

#### single-commit

文件位置：`skills/single-commit.md`

```typescript
/**
 * 单条确认入库
 * @param draftId 草稿 ID
 * @returns 入库结果
 */
function singleCommit(draftId: string): CommitResult;
```

#### tfidf-code-slicer

文件位置：`skills/tfidf-code-slicer.md`

```typescript
/**
 * 调用 Python 脚本解析代码文件
 * @param codePath 代码文件路径
 * @returns 接口与依赖关系 JSON
 */
function sliceCode(codePath: string): CodeSliceResult;
```

#### api-graph-builder

文件位置：`skills/api-graph-builder.md`

```typescript
/**
 * 根据代码切片结果构建/更新 API 依赖图谱
 * @param sliceResult tfidf-code-slicer 输出
 * @returns 图谱更新结果
 */
function buildApiGraph(sliceResult: CodeSliceResult): GraphUpdateResult;
```

### 4.4 工具函数

#### MaaS 降级容灾

文件位置：`config/maas-resilience.ts`

```typescript
/**
 * 带降级策略的嵌入调用
 * @param text 待嵌入文本
 * @param options 重试/超时/熔断配置
 * @returns 向量结果，失败时返回 null
 */
export async function embedWithFallback(
  text: string,
  options?: EmbedOptions
): Promise<number[] | null>;
```

#### 兼容校验

文件位置：`scripts/compat-check.ts`

```typescript
/**
 * 启动前兼容性校验
 * @returns 校验结果，失败时抛出 CompatCheckError
 */
export function runCompatCheck(): CompatCheckResult;
```

#### 异常告警

文件位置：`scripts/alert-monitor.ts`

```typescript
/**
 * 运行异常监控检查
 * @returns 告警列表
 */
export function runAlertMonitor(): Alert[];
```

---

## 5. Python 子进程接口

### 5.1 tfidf-code-slicer

**调用方式**：通过 Node.js `child_process` 调用 Python 脚本

**输入**：代码文件路径

**输出 JSON 结构**：

```json
{
  "interfaces": [
    {
      "id": "userService.login",
      "module": "UserService",
      "params": ["username", "password"],
      "returns": "Token"
    }
  ],
  "dependencies": [
    {
      "from": "userService.login",
      "to": "authService.validate",
      "type": "precondition"
    }
  ]
}
```

---

## 6. 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0.0 | 2026-07-16 | 初始版本，包含 V1.0 全部接口定义 |
