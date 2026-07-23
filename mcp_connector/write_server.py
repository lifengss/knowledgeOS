"""
KnowledgeOS MCP 连接器 —— 写入服务 (读写, 对应设计文档 write :8101)

以 stdio 方式启动，供 CodeBuddy / Agent SDK 接入。工具会修改知识库
（写入缓冲层、编辑已发布页面、质量门控、冲突处理、入库、晋升共享库）。

启动: python mcp/write_server.py
配置: 通过环境变量 KB_API_BASE 指定 REST 基址（默认 http://localhost:3000）

工具清单（对齐设计文档“写入服务”能力）:
  - add_draft            写入缓冲层草稿              [设计: 缓存写入]
  - update_draft         修改缓冲层草稿(标题/正文/类型)
  - delete_draft         删除缓冲层草稿
  - edit_knowledge_page  人工编辑已发布知识页面      [设计: GBrain 页面写回]
  - validate_draft       校验单条草稿(质量门控)      [设计: case-validator]
  - quality_gate         质量门控评分                [设计: quality-gate]
  - detect_conflicts     触发冲突检测                [设计: conflict-detector]
  - resolve_conflict     处理冲突(merge/overwrite/keep_both/discard)
  - single_commit        单条草稿入库                [设计: single-commit]
  - batch_commit         批量草稿入库                [设计: batch-commit]
  - upload_source        上传知识素材(非文件体)
  - promote_page         私有页面晋升共享库
  - get_ai_settings      读取 AI 平台对接配置        [设计: AI Adapter]
  - set_ai_settings      更新 AI 平台对接配置        [设计: AI Adapter]
  - generate_quality_rule 由编辑前后内容生成质量规则 [设计: 链路3a 人工编辑优化]
"""

import json

from mcp.server.fastmcp import FastMCP

import kb_client as kb

mcp = FastMCP("knowledgeos-write", instructions=(
    "知识库写入连接器。用于写入/修改缓冲层草稿、编辑已发布页面、运行质量门控、"
    "处理冲突、将草稿入库、晋升共享库。会真实修改知识库，请谨慎使用。"
))


def _ok(data) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def _run(fn):
    try:
        return _ok(fn())
    except kb.KBClientError as e:
        return f"[错误] {e}"
    except Exception as e:  # pragma: no cover - 防御性
        return f"[错误] {type(e).__name__}: {e}"


@mcp.tool()
def add_draft(title: str, content: str, project: str = "default",
              type_: str = "quality_rule", source: str = "human_edit",
              metadata: str = None) -> str:
    """写入一条缓冲层草稿。title/ content 必填；type_=quality_rule|defect|wiki|test_case；
    source=human_edit|upload|ai；metadata=JSON 字符串(可选)。"""
    meta = json.loads(metadata) if metadata else None
    return _run(lambda: kb.add_draft(title, content, project=project, type_=type_,
                                     source=source, metadata=meta))


@mcp.tool()
def update_draft(draft_id: str, title: str = None, content: str = None,
                 type_: str = None) -> str:
    """修改缓冲层草稿。至少提供 title/content/type_ 之一。"""
    return _run(lambda: kb.update_draft(draft_id, title=title, content=content, type_=type_))


@mcp.tool()
def delete_draft(draft_id: str, project: str = "default") -> str:
    """删除一条缓冲层草稿（by id）。"""
    return _run(lambda: kb.delete_draft(draft_id, project=project))


@mcp.tool()
def edit_knowledge_page(category: str, page_id: str, content: str,
                        project: str = "default") -> str:
    """人工编辑已发布的知识页面正文（写回原仓库并记录审计）。content 为完整 Markdown。"""
    return _run(lambda: kb.edit_page(category, page_id, content, project=project))


@mcp.tool()
def validate_draft(draft_id: str, project: str = "default") -> str:
    """校验单条草稿是否通过质量门控（总分阈值等）。[设计: case-validator]"""
    return _run(lambda: kb.quality_gate(project=project, draft_ids=[draft_id]))


@mcp.tool()
def quality_gate(project: str = "default", draft_ids: str = None) -> str:
    """对缓冲层草稿运行质量门控评分。draft_ids=逗号分隔ID(可选，缺省评全部)。[设计: quality-gate]"""
    ids = [i.strip() for i in draft_ids.split(",") if i.strip()] if draft_ids else None
    return _run(lambda: kb.quality_gate(project=project, draft_ids=ids))


@mcp.tool()
def detect_conflicts(project: str = "default") -> str:
    """触发冲突检测（基于相似度/重叠）。[设计: conflict-detector]"""
    return _run(lambda: kb.detect_conflicts(project=project))


@mcp.tool()
def resolve_conflict(conflict_id: str, resolution: str = "merge",
                     project: str = "default") -> str:
    """处理一条冲突。resolution=merge|overwrite|keep_both|discard。"""
    return _run(lambda: kb.resolve_conflict(conflict_id, resolution=resolution, project=project))


@mcp.tool()
def single_commit(draft_id: str, project: str = "default",
                  skip_conflict_check: bool = False, skip_quality_gate: bool = False) -> str:
    """将单条草稿入库（经冲突检测与质量门控，可用开关跳过）。[设计: single-commit]"""
    return _run(lambda: kb.single_commit(draft_id, project=project,
                                         skip_conflict_check=skip_conflict_check,
                                         skip_quality_gate=skip_quality_gate))


@mcp.tool()
def batch_commit(project: str = "default", ids: str = None,
                 skip_conflict_check: bool = False, skip_quality_gate: bool = False) -> str:
    """批量将草稿入库。ids=逗号分隔ID(可选，缺省全部 pending)。[设计: batch-commit]"""
    id_list = [i.strip() for i in ids.split(",") if i.strip()] if ids else None
    return _run(lambda: kb.batch_commit(project=project, ids=id_list,
                                        skip_conflict_check=skip_conflict_check,
                                        skip_quality_gate=skip_quality_gate))


@mcp.tool()
def upload_source(content: str, type_: str = "quality_rule", note: str = "",
                  project: str = "default") -> str:
    """以文本形式上传知识素材并写入缓冲层（非文件上传通道）。"""
    return _run(lambda: kb.upload_source(content=content, type_=type_, note=note, project=project))


@mcp.tool()
def promote_page(project: str, page_path: str, mode: str = "copy") -> str:
    """将项目私有知识页面晋升到共享库。page_path=分类/文件名.md；mode=copy|move。"""
    return _run(lambda: kb.promote_page(project, page_path, mode=mode))


@mcp.tool()
def get_ai_settings() -> str:
    """读取知识库 AI 平台对接配置（provider/endpoint/apiKey/model/useCustomModel）。"""
    return _run(lambda: kb.get_ai_settings())


@mcp.tool()
def set_ai_settings(config: str) -> str:
    """更新知识库 AI 平台对接配置。config=JSON 字符串，形如
    {"ai":{"provider":"openai","endpoint":"https://.../chat/completions",
    "apiKey":"...","model":"...","useCustomModel":false}}。provider=openai|codebuddy|none。"""
    cfg = json.loads(config)
    return _run(lambda: kb.set_ai_settings(cfg))


@mcp.tool()
def generate_quality_rule(title: str, old: str, new: str,
                          project: str = "default") -> str:
    """由人工编辑前后的新旧内容生成质量规则。title=条目标题；old=修改前正文；new=修改后正文。
    返回 {"source":"ai"|"deterministic","content":"<Markdown>"}。对应设计“链路 3a 人工编辑优化”。"""
    return _run(lambda: kb.generate_quality_rule(title, old, new, project=project))


if __name__ == "__main__":
    mcp.run()  # stdio transport
