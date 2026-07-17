# knowledge-os skillpack

知识管理系统 V1.0 核心 skillpack，包含 8 个 skills：

- `tfidf-code-slicer`：代码 TF-IDF 切片
- `api-graph-builder`：API 依赖图谱构建
- `conflict-detector`：规则冲突检测
- `quality-gate`：质量门控
- `batch-commit`：批量入库
- `single-commit`：单条入库
- `case-generator`：MCP 知识查询接口
- `case-validator`：MCP 知识校验接口

V1.0 使用 GBrain 关键词检索降级方案，所有 skill 均为确定性操作/规则引擎，不调用 LLM。
