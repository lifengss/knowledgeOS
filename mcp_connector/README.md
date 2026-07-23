# KnowledgeOS MCP 连接器

将知识库（test-knowledge-system）暴露为标准 **MCP（Model Context Protocol）服务**，
供 **CodeBuddy** 与 **testcase-gen-frontend（Agent SDK 应用）** 等 AI 系统接入并读写知识库。

设计原则（与系统架构一致）：
- **不重建 AI harness / 知识存储**——MCP 服务只是 REST API（`api/server.js`）的薄封装。
- **换 AI 平台仅改配置不改代码**——所有知识逻辑在 REST 端实现，连接器仅做转发。
- **读写物理隔离**——拆分为两个独立 MCP 服务实例（对应设计文档 query :8100 / write :8101）：
  - `knowledgeos-query`（只读）：检索、读取页面/图谱/草稿/冲突/统计。
  - `knowledgeos-write`（写入）：写草稿、编辑页面、质量门控、冲突处理、入库、晋升共享库。

## 目录结构

```
mcp_connector/
  kb_client.py      # 共享 HTTP 客户端，封装 REST API（含 project 隔离注入）
  query_server.py   # 只读 MCP 服务（FastMCP, stdio）
  write_server.py   # 写入 MCP 服务（FastMCP, stdio）
```

## 前置条件

1. 知识库 REST 服务已启动（默认 `http://localhost:3000`）：
   ```bash
   cd test-knowledge-system
   node api/server.js
   ```
2. Python 依赖（已在 `requirements.txt`）：`mcp>=1.0.0`（提供 FastMCP 与 stdio 客户端）。
   ```bash
   pip install -r requirements.txt
   ```

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `KB_API_BASE` | REST API 基址 | `http://localhost:3000` |
| `KB_API_TIMEOUT` | 请求超时（秒） | `30` |
| `PYTHONUTF8` | Windows 下强制 UTF-8 | `1` |

## 工具清单

### 只读（knowledgeos-query）
| 工具 | 对应 REST | 说明 |
|------|-----------|------|
| `search_knowledge` | `POST /api/search` | 检索知识（设计: case-generator 检索通道） |
| `generate_test_cases` | `POST /api/generate-cases` | 依 query 产出测试用例素材 |
| `list_knowledge_pages` | `GET /api/brain/pages` | 列出知识库页面 |
| `get_knowledge_page` | `GET /api/brain/pages/:c/:id` | 读取页面正文 |
| `get_knowledge_graph` | `GET /api/graph-data` | 知识图谱（设计: api-graph-builder） |
| `get_stats` | `GET /api/stats` | 统计信息 |
| `list_projects` | `GET /api/projects` | 枚举项目知识库 |
| `list_drafts` | `GET /api/drafts` | 列出缓冲层草稿 |
| `get_draft` | `GET /api/drafts/:id` | 读取单条草稿 |
| `list_conflicts` | `GET /api/conflicts` | 列出冲突 |
| `tfidf_code_slicer` | （本地 TF-IDF） | 对知识语料做 TF-IDF 切片（设计: tfidf-code-slicer） |

### 写入（knowledgeos-write）
| 工具 | 对应 REST | 说明 |
|------|-----------|------|
| `add_draft` | `POST /api/drafts` | 写入缓冲层草稿 |
| `update_draft` | `PUT /api/drafts/:id` | 修改草稿 |
| `delete_draft` | `DELETE /api/drafts/:id` | 删除草稿 |
| `edit_knowledge_page` | `PUT /api/brain/pages/:c/:id` | 编辑已发布页面 |
| `validate_draft` | `POST /api/quality-gate/check` | 校验单条草稿（设计: case-validator） |
| `quality_gate` | `POST /api/quality-gate/check` | 质量门控评分（设计: quality-gate） |
| `detect_conflicts` | `POST /api/conflicts/detect` | 触发冲突检测（设计: conflict-detector） |
| `resolve_conflict` | `PUT /api/conflicts/:id/resolve` | 处理冲突 |
| `single_commit` | `POST /api/drafts/:id/commit` | 单条入库（设计: single-commit） |
| `batch_commit` | `POST /api/drafts/batch-commit` | 批量入库（设计: batch-commit） |
| `upload_source` | `POST /api/source-upload` | 上传知识素材（文本体） |
| `promote_page` | `POST /api/brain/promote` | 私有页晋升共享库 |

## 接入方式一：CodeBuddy

项目根 `.codebuddy/mcp.json` 已配置两个 stdio 服务。在 CodeBuddy 中通过
“添加 MCP 服务 / 刷新”加载即可，无需额外操作。要点：

```json
{
  "mcpServers": {
    "knowledgeos-query": {
      "type": "stdio",
      "command": "python",
      "args": ["<知识库根>/mcp_connector/query_server.py"],
      "env": { "PYTHONUTF8": "1", "KB_API_BASE": "http://localhost:3000" }
    },
    "knowledgeos-write": { "...": "write_server.py" }
  }
}
```

若 REST 服务不在 3000 端口，修改 `KB_API_BASE` 即可。

## 接入方式二：testcase-gen-frontend（Agent SDK 应用）

testcase-gen-frontend 基于 `@tencent-ai/agent-sdk`，原生支持 MCP。在该应用的
MCP 配置中加入同样的 stdio 服务（指向本连接器脚本）即可让 Agent 在对话中
检索/写入知识库。示例（应用侧 `mcpServers` 配置，agent-sdk 兼容格式）：

```json
{
  "mcpServers": {
    "knowledgeos-query": {
      "type": "stdio",
      "command": "python",
      "args": ["/abs/path/to/test-knowledge-system/mcp_connector/query_server.py"],
      "env": { "KB_API_BASE": "http://localhost:3000" }
    },
    "knowledgeos-write": {
      "type": "stdio",
      "command": "python",
      "args": ["/abs/path/to/test-knowledge-system/mcp_connector/write_server.py"],
      "env": { "KB_API_BASE": "http://localhost:3000" }
    }
  }
}
```

业务侧（testcase-gen-frontend）通过 Agent 的自然语言调用这些工具，沿用其既有
的 AI-Adapter（openai / codebuddy / none 可配置）；MCP 连接器只负责把请求
转成对知识库 REST 的调用，符合“业务意图 / 执行模板 / 知识上下文”三层分离。

## 手动验证

```bash
# 终端直接调用（需 REST 服务在 3000 运行）
KB_API_BASE=http://localhost:3000 python mcp_connector/query_server.py
# 然后在 MCP 客户端（如 CodeBuddy / mcp  Inspector）中查看工具列表并调用
```

## 说明

- 设计文档原规划用 `gbrain serve` 在 `:8100`/`:8101` 提供 HTTP 传输的 MCP。
  本实现采用 stdio 传输（CodeBuddy / Agent SDK 标准接入方式），能力集与设计
  工具命名一一对应，物理隔离（只读 / 写入两个进程）保持一致。
- 所有写操作均经 REST 端的质量门控与冲突检测，保证知识闭环不被绕过。
