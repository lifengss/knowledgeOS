#!/usr/bin/env python3
"""复制当前项目代码到临时目录，运行 tfidf-code-slicer，生成 API 图谱并更新 project-wiki。

步骤:
1. 复制项目到 temp/knowledgeos-source/（排除 node_modules, .git, __pycache__, *.db 等）
2. 运行 tfidf_code_slicer.slice_code() 解析代码
3. 将结果转换为 project-wiki Markdown 页面
4. 写入 brain/project-wiki/
"""

import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
TEMP_DIR = PROJECT_DIR / "temp" / "knowledgeos-source"
OUTPUT_WIKI_DIR = PROJECT_DIR / "brain" / "project-wiki"

# 排除目录和文件
EXCLUDE_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    ".pytest_cache",
    ".codebuddy",
    ".brain",
    "temp",
    "brain",
    "cache",
}
EXCLUDE_EXTS = {".db", ".log", ".pyc", ".pyo", ".egg-info"}
EXCLUDE_FILES = {
    ".gitignore",
    ".env",
    ".env.example",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
}


def copy_project(source: Path, target: Path):
    """复制项目代码到临时目录。"""
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)

    copied = 0
    for item in source.rglob("*"):
        # 跳过排除目录
        if any(part in EXCLUDE_DIRS for part in item.parts):
            continue
        # 跳过排除文件
        if item.name in EXCLUDE_FILES:
            continue
        if item.suffix in EXCLUDE_EXTS:
            continue

        rel = item.relative_to(source)
        dest = target / rel

        if item.is_dir():
            dest.mkdir(parents=True, exist_ok=True)
        elif item.is_file():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, dest)
            copied += 1

    print(f"[COPY] 复制 {copied} 个文件到 {target}")
    return copied


def run_slicer(code_path: Path) -> dict:
    """运行 tfidf-code-slicer。"""
    sys.path.insert(0, str(PROJECT_DIR))
    from skills.tfidf_code_slicer import slice_code

    result = slice_code(str(code_path))
    print(f"[SLICE] 解析到 {len(result['interfaces'])} 个接口, {len(result['dependencies'])} 个依赖关系")
    return result


def generate_api_wiki_pages(result: dict) -> list[Path]:
    """生成 project-wiki API 页面。"""
    OUTPUT_WIKI_DIR.mkdir(parents=True, exist_ok=True)
    written = []

    # 按模块分组接口
    modules: dict[str, list[dict]] = {}
    for iface in result["interfaces"]:
        mod = iface.get("module", "unknown")
        modules.setdefault(mod, []).append(iface)

    # 为每个模块生成一个页面
    for mod_name, ifaces in modules.items():
        page_id = f"api-{mod_name.lower().replace('_', '-')}"
        file_path = OUTPUT_WIKI_DIR / f"{page_id}.md"

        # 收集该模块的依赖
        mod_deps = [
            d for d in result["dependencies"]
            if d["from"].startswith(f"{mod_name}.")
        ]

        md = f"""---
type: api-contract
module: {mod_name}
source: auto-generated
created: {datetime.now().strftime('%Y-%m-%d')}
updated: {datetime.now().strftime('%Y-%m-%d')}
---

# API 契约：{mod_name}

## Compiled Truth（当前最佳理解）

本模块包含 {len(ifaces)} 个接口定义。

### 接口列表

"""
        for iface in ifaces:
            params = ", ".join(iface.get("params", []))
            returns = iface.get("returns", "")
            class_name = iface.get("class", "")
            id_str = iface["id"]
            md += f"- `{id_str}({params})`"
            if returns:
                md += f" → `{returns}`"
            if class_name:
                md += f" （类: `{class_name}`）"
            md += "\n"

        md += "\n### 调用关系\n\n"
        if mod_deps:
            for dep in mod_deps:
                md += f"- `{dep['from']}` → `{dep['to']}` （{dep['type']}）\n"
        else:
            md += "- 无外部调用关系\n"

        md += f"""
## Timeline（历史证据，只追加）

- {datetime.now().strftime('%Y-%m-%d')}: 由 tfidf-code-slicer 自动从项目源码生成
"""

        file_path.write_text(md, encoding="utf-8")
        written.append(file_path)
        print(f"  [WRITE] {file_path.name}")

    # 生成总览页面
    overview_path = OUTPUT_WIKI_DIR / "api-overview.md"
    overview_md = f"""---
type: project-wiki
title: API 依赖图谱总览
source: auto-generated
created: {datetime.now().strftime('%Y-%m-%d')}
updated: {datetime.now().strftime('%Y-%m-%d')}
---

# API 依赖图谱总览

## Compiled Truth（当前最佳理解）

本项目共解析出：
- **{len(result['interfaces'])}** 个接口定义
- **{len(result['dependencies'])}** 个调用依赖关系
- **{len(result['files'])}** 个代码文件
- **{len(result['similarities'])}** 组相似接口

### 模块列表

"""
    for mod_name in sorted(modules.keys()):
        page_id = f"api-{mod_name.lower().replace('_', '-')}"
        overview_md += f"- [[{page_id}]] — {mod_name} 模块\n"

    overview_md += f"""
### 相似接口（名称相似度 > 0.6）

"""
    if result["similarities"]:
        for sim in result["similarities"]:
            overview_md += f"- `{sim['interfaceA']}` ↔ `{sim['interfaceB']}` （相似度: {sim['score']}）\n"
    else:
        overview_md += "- 无显著相似接口\n"

    overview_md += f"""
## Timeline（历史证据，只追加）

- {datetime.now().strftime('%Y-%m-%d')}: 由 tfidf-code-slicer 自动从项目源码生成
"""

    overview_path.write_text(overview_md, encoding="utf-8")
    written.append(overview_path)
    print(f"  [WRITE] {overview_path.name}")

    return written


def main():
    print("[STEP 1/3] 复制项目代码...")
    copy_project(PROJECT_DIR, TEMP_DIR)

    print("\n[STEP 2/3] 运行 tfidf-code-slicer...")
    result = run_slicer(TEMP_DIR)

    # 保存切片结果 JSON（供调试）
    slice_json_path = PROJECT_DIR / "temp" / "slice-result.json"
    slice_json_path.parent.mkdir(parents=True, exist_ok=True)
    slice_json_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  [SAVE] 切片结果已保存到 {slice_json_path}")

    print("\n[STEP 3/3] 生成 project-wiki 页面...")
    written = generate_api_wiki_pages(result)

    print(f"\n[DONE] 共生成 {len(written)} 个 project-wiki 页面")
    print(f"  源码副本: {TEMP_DIR}")
    print(f"  Wiki 目录: {OUTPUT_WIKI_DIR}")


if __name__ == "__main__":
    main()
