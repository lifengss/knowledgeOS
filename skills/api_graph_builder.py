#!/usr/bin/env python3
"""api-graph-builder: 根据 tfidf-code-slicer 输出构建/更新 API 依赖图谱。

在 GBrain 中创建/更新 API 实体页面和调用关系链接。
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def _gbrain_put(slug: str, content: str) -> bool:
    """通过 gbrain put 写入页面。"""
    try:
        subprocess.run(
            ["gbrain", "put", slug],
            input=content,
            capture_output=True,
            text=True,
            check=True,
            encoding="utf-8",
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"[api-graph-builder] gbrain put {slug} 失败: {e.stderr}", file=sys.stderr)
        return False


def _gbrain_link(from_slug: str, to_slug: str, link_type: str = "advises") -> bool:
    """通过 gbrain link 创建链接。"""
    try:
        subprocess.run(
            ["gbrain", "link", from_slug, to_slug, "--link-type", link_type],
            capture_output=True,
            text=True,
            check=True,
            encoding="utf-8",
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"[api-graph-builder] gbrain link {from_slug} -> {to_slug} 失败: {e.stderr}", file=sys.stderr)
        return False


def _build_api_page(interface: dict[str, Any]) -> str:
    """构建 API 实体页面 Markdown 内容。"""
    name = interface.get("name", "")
    module = interface.get("module", "")
    params = interface.get("params", [])
    returns = interface.get("returns", "")
    file_path = interface.get("file", "")
    language = interface.get("language", "")
    class_name = interface.get("class", "")

    lines = [
        "---",
        f'title: "{name}"',
        f"type: api-interface",
        f"module: {module}",
        f"language: {language}",
        f"source_file: {file_path}",
    ]
    if class_name:
        lines.append(f"class: {class_name}")
    lines.append("---")
    lines.append("")
    lines.append(f"# {name}")
    lines.append("")
    lines.append("## Compiled Truth")
    lines.append("")
    lines.append(f"- **模块**: `{module}`")
    lines.append(f"- **语言**: {language}")
    lines.append(f"- **源文件**: `{file_path}`")
    lines.append("")
    lines.append("### 参数")
    if params:
        for p in params:
            lines.append(f"- `{p}`")
    else:
        lines.append("- 无参数")
    lines.append("")
    lines.append("### 返回值")
    lines.append(f"`{returns or 'void'}`")
    lines.append("")
    lines.append("## Timeline")
    lines.append("")
    lines.append(f"- 首次解析: {Path(file_path).name}")
    lines.append("")

    return "\n".join(lines)


def build_api_graph(
    slice_result: dict[str, Any],
    update_type: str = "incremental",
) -> dict[str, Any]:
    """构建/更新 API 依赖图谱。

    Args:
        slice_result: tfidf-code-slicer 输出
        update_type: full / incremental

    Returns:
        更新结果 { updatedInterfaces, updatedDependencies, updatedPages, errors }
    """
    interfaces = slice_result.get("interfaces", [])
    dependencies = slice_result.get("dependencies", [])

    updated_interfaces = 0
    updated_dependencies = 0
    updated_pages = []
    errors = []

    # 1. 创建/更新 API 实体页面
    for interface in interfaces:
        slug = f"project-wiki/api-{interface['module']}-{interface['name']}"
        content = _build_api_page(interface)
        success = _gbrain_put(slug, content)
        if success:
            updated_interfaces += 1
            updated_pages.append(slug)
        else:
            errors.append(f"写入页面失败: {slug}")

    # 2. 建立调用关系链接（只链接已创建页面的接口）
    created_slugs = {
        f"project-wiki/api-{i['module']}-{i['name']}"
        for i in interfaces
    }

    for dep in dependencies:
        from_id = dep.get("from", "")
        to_id = dep.get("to", "")
        if not from_id or not to_id:
            continue

        # 解析 from/to 的模块和方法名
        from_parts = from_id.split(".")
        to_parts = to_id.split(".")

        if len(from_parts) >= 2:
            from_slug = f"project-wiki/api-{from_parts[0]}-{from_parts[1]}"
        else:
            from_slug = f"project-wiki/api-{from_id}"

        if len(to_parts) >= 2:
            to_slug = f"project-wiki/api-{to_parts[0]}-{to_parts[1]}"
        else:
            to_slug = f"project-wiki/api-{to_id}"

        # 只链接双方都创建了页面的关系
        if from_slug not in created_slugs or to_slug not in created_slugs:
            continue

        success = _gbrain_link(from_slug, to_slug, "advises")
        if success:
            updated_dependencies += 1
        else:
            errors.append(f"链接失败: {from_slug} -> {to_slug}")

    return {
        "updatedInterfaces": updated_interfaces,
        "updatedDependencies": updated_dependencies,
        "updatedPages": updated_pages,
        "errors": errors,
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="API 图谱构建器")
    parser.add_argument("slice_result", help="tfidf-code-slicer 输出的 JSON 文件路径")
    parser.add_argument("--update-type", default="incremental", choices=["full", "incremental"])
    args = parser.parse_args()

    with open(args.slice_result, "r", encoding="utf-8") as f:
        slice_data = json.load(f)

    result = build_api_graph(slice_data, args.update_type)
    print(json.dumps(result, ensure_ascii=False, indent=2))
