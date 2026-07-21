# 知识管理系统 V1.0

> 基于 GBrain 内核的通用知识管理系统，首先适配 AI 测试用例自动生成系统的知识闭环，后续扩展为团队协同与企业级知识引擎。

---

## 项目简介

本项目以 [GBrain](https://github.com/garrytan/gbrain)（MIT 协议）为知识管理内核，构建一套**可自我进化、数据闭环、知识可沉淀复用**的通用知识管理系统。

V1.0 目标是：单人完整跑通 PRD 定义的知识闭环——**生成 → 优化 → 沉淀 → 再生成**。

---

## 核心能力

| 能力 | 说明 |
|------|------|
| GBrain 内核 | 版本锁定 v0.16.4，Markdown + Git 存储，RRF 混合搜索，知识图谱自动连线 |
| L2 知识缓冲层 | SQLite + Python sqlite3， drafts / conflicts / audit_log 三表 |
| 双通路入库 | 批量确认（batch-commit）+ 单条确认（single-commit） |
| 冲突检测 | 重复 / 矛盾 / 重叠规则识别，支持合并/覆盖/丢弃 |
| 质量门控 | 基础规则校验与评分，低于 60 分拒绝入库 |
| API 依赖图谱 | TF-IDF 代码切片 + API 实体页面自动构建 |
| MCP 接口 | 知识查询（8100）+ 知识写入（8101），供 AI 平台调用 |
| 标准化 REST API | 完整 OpenAPI 文档，弱化 MCP 依赖 |
| 简易 SDK | Java / Python SDK，降低业务系统对接成本 |
| 基础 Web UI | 知识库浏览、草稿审核、冲突处理、图谱可视化、全局统计面板 |
| 兼容校验 | 启动前校验 GBrain 版本、Skill 文件、MCP 配置 |
| 定时清理与告警 | 过期草稿自动清理，冲突堆积/入库失败/嵌入异常告警 |
| MaaS 降级容灾 | 重试 / 超时 / 熔断，嵌入不可用时切换关键词检索 |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 内核 | GBrain v0.16.4 + PGLite |
| 缓冲层 | SQLite + Python sqlite3（标准库） |
| 运行时 | Python 3.10+（主运行时） |
| REST API | Python Flask |
| TF-IDF | Python 3.10+ ast 模块 |
| SDK | Java（OkHttp + Gson）、Python（requests） |
| Web UI | 基础 HTML/JS/CSS |

---

## 目录结构

```
test-knowledge-system/
├── brain/                    # GBrain Brain 仓库（4 个知识库目录）
├── skills/                   # 8 个自建 Fat Skills
├── cache/                    # L2 缓冲层（SQLite + 告警日志）
├── agents/                   # MCP 接口配置
├── api/                      # REST API 网关 + OpenAPI 文档
├── sdk/                      # Java / Python 简易 SDK
├── web/                      # Web UI 管理界面
├── config/                   # 系统配置
├── scripts/                  # 运维脚本 + 兼容校验 + 清理/告警
├── package.json              # 依赖与脚本
├── .env.example              # 环境变量模板
└── README.md                 # 本文件
```

---

## 快速开始

### 1. 环境准备

| 组件 | 版本要求 | 用途 |
|------|----------|------|
| Python | >= 3.10 | 自建代码主运行时（缓冲层、Skills、REST API） |
| Bun | >= 1.0 | GBrain 内核运行时（仅内核依赖） |
| Git | >= 2.30 | Brain 仓库版本管理 |

### 2. 安装 GBrain 内核

```bash
export GBRAIN_VERSION="v0.16.4"
git clone --branch $GBRAIN_VERSION --depth 1 https://github.com/garrytan/gbrain.git ~/gbrain
cd ~/gbrain
bun install && bun link
```

### 3. 配置环境变量

```bash
cd test-knowledge-system
cp .env.example .env
# 编辑 .env，配置 OPENAI_API_KEY、OPENAI_BASE_URL 等
```

### 4. 启动兼容校验

```bash
bash scripts/compat-check.sh
# 或 Windows PowerShell
# powershell -File scripts/compat-check.ps1
```

### 5. 初始化缓冲层数据库

```bash
python scripts/init_cache.py
```

### 6. 启动服务

```bash
bash scripts/start-agents.sh
```

### 7. 预览 Web UI

```bash
cd web
python -m http.server 8080
```

浏览器访问 http://localhost:8080

---

## 使用 SDK

### Python

```python
from knowledge_client import KnowledgeClient

client = KnowledgeClient("http://localhost:3000")
results = client.search("用户登录", mode="rrf")
print(results)
```

### Java

```java
KnowledgeClient client = new KnowledgeClient("http://localhost:3000");
List<Map<String, Object>> results = client.search("用户登录", "rrf", 5);
System.out.println(results);
```

---

## 开发计划

| 周次 | 里程碑 |
|------|--------|
| 第 1 周 | 环境 + GBrain 就绪 |
| 第 2 周 | L2 缓冲层就绪 |
| 第 3 周 | Skills + MCP + REST API + SDK 就绪 |
| 第 4 周 | Web UI + 定时清理/告警 就绪 |
| 第 5 周 | V1.0 整体验收 |

---

## 相关文档

- [V1.0 需求列表与开发计划](../proj_wiki/wiki/V1.0-需求列表与开发计划.md)
- [V1.0 测试大纲与测试用例](../proj_wiki/wiki/V1.0-测试大纲与测试用例.md)
- [功能需求版本矩阵](../proj_wiki/wiki/功能需求版本矩阵.md)

---

## 许可证

本项目基于 GBrain MIT 协议构建，自定义代码同样采用 MIT 协议。
