# 知识管理系统 V1.2（KnowledgeOS）

> 基于 Node/Express + Python Skills + 文件系统 Brain 仓库的轻量知识管理系统。
> V1.2 已完成多项目隔离、业务知识图谱、人工编辑闭环、统一后台日志等核心能力，正式定版。

---

## 项目简介

知识管理系统（KnowledgeOS / `test-knowledge-system`）是**知识侧**系统，负责知识的结构化沉淀、检索、冲突检测、质量门控与入库。

它本身**不承载 AI harness**（大模型调用、多轮对话编排由外部 AI 平台负责），而是通过 REST API 与 MCP 接口向「业务前端」与「AI 平台」提供知识查询/写入能力。

三方职责边界（三层 prompt 分离）：

| 层 | 归属 | 内容 |
|----|------|------|
| 业务意图 | 业务页面 | 操作类型 + 业务参数 + 业务约束 |
| 执行模板 | AI 平台 | 大模型指令 + 工具调用编排 + 输出格式 |
| 知识上下文 | 知识系统 | 检索结果 + 知识图谱 + Brain 页面 |

---

## 核心能力（V1.2）

| 能力 | 说明 |
|------|------|
| 多项目知识库隔离 | `config/projects.json` 配置多项目，通过 `project` 参数路由到 `brains/<project>/`；支持 `_shared` 共享库 |
| L2 知识缓冲层 | SQLite：`drafts` / `conflicts` / `audit_log` 三表，支持 pending/approved/conflict/merged/discarded/rejected 状态机 |
| 双通路入库 | 批量确认（`batch-commit`）+ 单条确认（`single-commit`），均带质量门控 |
| 冲突检测与闭环 | 重复/矛盾/重叠规则识别；resolve 后回写 drafts 并触发入库，避免悬挂 |
| 质量门控 | 基础规则校验与评分，低于 60 分拒绝入库 |
| 项目 Wiki | 轻量 Markdown 渲染 + `[[wikilink]]` 跳转 + 页面内目录 |
| API 依赖图谱 | 自动抽取代码中的 API 调用关系，力导向可视化 |
| 业务实体图谱 | 确定性抽取 PRD/需求文档 H2/H3 为实体节点，同文档共现/`[[wikilink]]` 为边 |
| 业务场景依赖图谱 | `plan → scenario(BFS) → optimize` 渐进式生成，AI 规划优先、确定性骨架兜底 |
| 人工编辑优化闭环 | 编辑先生成 L2 草稿（knowledge_edit + quality_rule），确认后回写原仓库 |
| 统一后台日志 | JSON 行日志：`logs/app-YYYY-MM-DD.log`（7 天）+ `logs/llm/app-llm-YYYY-MM-DD.log`（1 天） |
| AI 适配层 | `codebuddy` / `openai` / `none` 三通道；支持 `models.json` 自定义模型；GBrain 段配置占位 |
| 标准化 REST API | 完整接口文档，统一 `{success, data, error}` 返回结构 |
| 基础 Web UI | 知识库浏览、草稿审核、冲突处理、图谱可视化、系统设置、使用教程 |
| MCP 接口 | `mcp_connector/` 提供 stdio 传输的查询/写入工具 |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 接入/网关 | Node.js + Express（ESM），默认端口 `3000` |
| 功能脚本（Skills） | Python ≥ 3.10，以子进程方式调用 |
| 知识存储 | 文件系统 Markdown（Brain 仓库），YAML frontmatter 元数据 |
| 缓冲层 | SQLite：`cache/drafts.db` |
| 检索 | Python 关键词 + 可选语义，RRF 风格混合检索 |
| 前端 | 原生 HTML/JS/CSS，Express 静态托管 |
| 日志 | 文件系统 JSON 行，按天轮转 |

---

## 目录结构

```
test-knowledge-system/
├── api/                       # Node 接入层
│   ├── server.js              # Express 网关 + 静态托管
│   └── logger.js              # Node 统一日志
├── skills/                    # Python 功能脚本
│   ├── business_graph_builder.py
│   ├── api_graph_builder.py
│   ├── batch_commit.py / single_commit.py
│   ├── conflict_detector.py / quality_gate.py
│   ├── case_generator.py / case_validator.py
│   ├── code_upload_parser.py / generate_quality_rule.py
│   └── tfidf_code_slicer.py
├── cache/                     # SQLite 数据层
│   ├── draft_cache.py
│   ├── conflict_queue.py
│   └── audit_log.py
├── ai/                        # AI 适配层
│   ├── ai_config.py
│   ├── ai_adapter.py
│   ├── codebuddy_client.py
│   └── llm_logger.py
├── mcp_connector/             # MCP stdio 连接器
│   ├── query_server.py
│   └── write_server.py
├── web/                       # 前端（无构建）
│   ├── index.html
│   └── src/
│       ├── app.js
│       ├── api-docs-data.js
│       └── styles.css
├── config/                    # 系统配置
│   └── projects.json          # 多项目配置
├── docs/                      # 设计文档与接口文档
│   ├── 知识管理系统-V1.2架构设计与技术方案.md
│   └── API-INTERFACE-DOC.md
├── package.json
├── .env.example
└── README.md                  # 本文件
```

---

## 快速开始

### 1. 环境要求

| 组件 | 版本要求 |
|------|----------|
| Node.js | >= 18 |
| Python | >= 3.10 |
| Git | >= 2.30 |

### 2. 安装依赖

```bash
cd test-knowledge-system
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，配置 AI 平台相关参数
```

### 4. 初始化缓冲层数据库

```bash
python scripts/init_cache.py
```

### 5. 启动服务

```bash
npm run api
# 或
node api/server.js
```

服务默认监听 `http://localhost:3000`。

### 6. 访问 Web UI

浏览器打开 `http://localhost:3000`。

---

## 运行测试

```bash
# 综合测试（生成 REPORT.md）
node tests/comprehensive/run-tests.cjs

# 回归测试（生成 REGRESSION-REPORT.md）
node tests/comprehensive/regression-tests.cjs

# 功能测试
node tests/comprehensive/feature-tests.cjs

# pytest 集成测试
python -m pytest tests/test_integration_full.py -v
```

---

## 相关文档

- [V1.2 架构设计与技术方案](docs/知识管理系统-V1.2架构设计与技术方案.md)
- [API 接口文档](docs/API-INTERFACE-DOC.md)
- [测试报告](tests/comprehensive/REPORT.md)
- [回归测试报告](tests/comprehensive/REGRESSION-REPORT.md)

---

## 版本历史

| 版本 | 时间 | 说明 |
|------|------|------|
| 1.0.0 | 2024 | 原型版本，基于 GBrain 内核设计 |
| 1.2.0 | 2026-07-28 | 正式定版：多项目隔离、业务图谱、人工编辑闭环、统一日志、使用教程 |

---

## 许可证

MIT
