# KnowledgeOS V1.2.0 发布说明

**版本号**：v1.2.0  
**提交**：`ed20bc6`  
**标签**：`v1.2.0`  
**发布时间**：2026-07-28  
**状态**：正式定版

---

## 新增与增强

### 1. 多项目知识库隔离
- `config/projects.json` 配置多项目，每个项目独立 `brains/<project>/` 仓库
- 支持 `_shared` 共享库，跨项目复用通用知识
- 所有 API 自动识别 `project` 参数，数据库层 `project_id` 字段隔离

### 2. 业务知识图谱
- **API 依赖图谱**：自动抽取代码中的 API 调用关系，力导向可视化
- **业务实体图谱**：确定性抽取 PRD/需求文档 H2/H3 为实体节点，同文档共现/`[[wikilink]]` 为边
- **业务场景依赖图谱**：`plan → scenario(BFS) → optimize` 渐进式生成，AI 规划优先、确定性骨架兜底

### 3. 人工编辑优化闭环
- 编辑 Brain 页面不再直接写盘
- 生成两条 L2 草稿：`knowledge_edit` + `quality_rule`
- 确认后回写原仓库，并记录审计 `propose_edit`

### 4. 冲突处理闭环
- `resolve_conflict` 后更新 drafts 状态并触发 single_commit 入库
- 避免冲突处理后草稿仍卡在 `conflict` 状态悬挂

### 5. 统一后台日志
- JSON 行日志格式，便于 `grep`/`jq`
- `logs/app-YYYY-MM-DD.log`：应用/操作日志，保留 7 天
- `logs/llm/app-llm-YYYY-MM-DD.log`：大模型请求/响应日志，保留 1 天
- 含完整 prompt/response、耗时、成功失败、错误信息

### 6. AI 适配层增强
- 支持 `codebuddy` / `openai` / `none` 三通道
- 支持 `~/.codebuddy/models.json` 或 `cwd/.codebuddy/models.json` 自定义模型
- 修复 Windows 下 codebuddy CLI 解码问题（gbk → utf-8）
- GBrain 段配置占位，为后续智能增强预留

### 7. Web UI 模块
- 项目 Wiki 浏览与 `[[wikilink]]` 跳转
- 系统设置（AI 平台对接 + GBrain 大模型配置）
- 使用教程（侧栏目录 + 章节内容 + 截图）
- 图谱可视化双模式（api/entity）与聚焦跳转

### 8. 测试体系
- 综合测试 `run-tests.cjs`：33/33 PASS
- 回归测试 `regression-tests.cjs`：29/29 PASS
- 功能测试 `feature-tests.cjs`：19/19 PASS
- pytest 集成测试：26 passed, 1 skipped

---

## 修复的主要问题

| 问题 | 修复 |
|------|------|
| 跨项目冲突泄漏 | `list-conflicts` 透传 `--project`，SQL 按 `project` 过滤 |
| 冲突处理后草稿悬挂 | resolve 后回写 drafts 并触发 single_commit |
| BFF 代理 `:param` 字面量 | 用 `req.params` 替换路径参数 |
| 非 ASCII 文件名上传乱码 | multer memoryStorage + ASCII 文件名 + UTF-8 还原 |
| 审计日志 `count-audit` 参数 | 补全 argparse 参数，返回真实 total |
| 脑图文件 CRLF 不一致 | `_write_to_brain` 统一 LF |
| codebuddy Windows 解码 | `subprocess.run` 指定 `encoding='utf-8', errors='replace'` |

---

## 文档

- [V1.2 架构设计与技术方案](docs/知识管理系统-V1.2架构设计与技术方案.md)
- [API 接口文档](docs/API-INTERFACE-DOC.md)
- [测试报告](tests/comprehensive/REPORT.md)
- [回归测试报告](tests/comprehensive/REGRESSION-REPORT.md)

---

## 快速开始

```bash
cd test-knowledge-system
npm install
cp .env.example .env
python scripts/init_cache.py
npm run api
```

访问 `http://localhost:3000`。

---

## 手动推送命令

当前环境无法连接 GitHub，请在网络可用后执行：

```bash
cd d:/self_coding/knowledgeOS/test-knowledge-system
git push origin main
git push origin v1.2.0
```

然后在 GitHub 创建 Release，粘贴本文件内容作为发布说明。
