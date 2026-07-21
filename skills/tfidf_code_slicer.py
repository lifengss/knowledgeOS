#!/usr/bin/env python3
"""tfidf-code-slicer: 解析代码文件，提取接口定义与调用关系，输出结构化 JSON。

支持 Python、JavaScript、TypeScript、Java。
不调用 LLM，使用 AST / 正则解析。
"""

import ast
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Optional


def _collect_files(code_path: str) -> list[Path]:
    """收集代码文件。"""
    path = Path(code_path)
    if path.is_file():
        return [path]
    if path.is_dir():
        files = []
        for ext in ("*.py", "*.js", "*.ts", "*.java"):
            files.extend(path.rglob(ext))
        return files
    return []


def _detect_language(file_path: Path) -> str:
    """根据扩展名检测语言。"""
    ext = file_path.suffix.lower()
    mapping = {".py": "python", ".js": "javascript", ".ts": "typescript", ".java": "java"}
    return mapping.get(ext, "unknown")


def _parse_python(file_path: Path) -> dict[str, Any]:
    """使用 AST 解析 Python 文件。"""
    try:
        source = file_path.read_text(encoding="utf-8")
        tree = ast.parse(source)
    except SyntaxError as e:
        return {"file": str(file_path), "error": str(e), "interfaces": [], "dependencies": []}

    interfaces = []
    dependencies = []
    module_name = file_path.stem

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            func_name = node.name
            params = [arg.arg for arg in node.args.args]
            returns = ""
            if node.returns:
                try:
                    returns = ast.unparse(node.returns)
                except Exception:
                    returns = ""
            interfaces.append(
                {
                    "id": f"{module_name}.{func_name}",
                    "module": module_name,
                    "name": func_name,
                    "params": params,
                    "returns": returns,
                    "file": str(file_path),
                    "language": "python",
                }
            )

            # 提取调用关系
            for child in ast.walk(node):
                if isinstance(child, ast.Call):
                    if isinstance(child.func, ast.Name):
                        dependencies.append(
                            {
                                "from": f"{module_name}.{func_name}",
                                "to": child.func.id,
                                "type": "call",
                            }
                        )
                    elif isinstance(child.func, ast.Attribute) and isinstance(child.func.value, ast.Name):
                        dependencies.append(
                            {
                                "from": f"{module_name}.{func_name}",
                                "to": f"{child.func.value.id}.{child.func.attr}",
                                "type": "method_call",
                            }
                        )

        elif isinstance(node, ast.ClassDef):
            class_name = node.name
            for item in node.body:
                if isinstance(item, ast.FunctionDef):
                    method_name = item.name
                    params = [arg.arg for arg in item.args.args]
                    interfaces.append(
                        {
                            "id": f"{class_name}.{method_name}",
                            "module": module_name,
                            "name": method_name,
                            "params": params,
                            "returns": "",
                            "file": str(file_path),
                            "language": "python",
                            "class": class_name,
                        }
                    )

    return {"file": str(file_path), "interfaces": interfaces, "dependencies": dependencies}


def _parse_js_ts(file_path: Path) -> dict[str, Any]:
    """使用正则解析 JS/TS 文件。"""
    source = file_path.read_text(encoding="utf-8")
    module_name = file_path.stem
    interfaces = []
    dependencies = []

    # 函数定义: function name(...) 或 const name = (...) =>
    func_pattern = re.compile(
        r"(?:function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*(\w+))?)|"
        r"(?:const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|function\s*\(([^)]*)\)))"
    )
    for match in func_pattern.finditer(source):
        name = match.group(1) or match.group(4)
        params_str = match.group(2) or match.group(5) or ""
        returns = match.group(3) or ""
        params = [p.strip() for p in params_str.split(",") if p.strip()]
        if name:
            interfaces.append(
                {
                    "id": f"{module_name}.{name}",
                    "module": module_name,
                    "name": name,
                    "params": params,
                    "returns": returns,
                    "file": str(file_path),
                    "language": "javascript" if file_path.suffix == ".js" else "typescript",
                }
            )

    # 方法调用: xxx.yyy( 或 yyy(
    call_pattern = re.compile(r"(\w+(?:\.\w+)?)\s*\(")
    for match in call_pattern.finditer(source):
        callee = match.group(1)
        if callee not in ("if", "while", "for", "switch", "catch", "console", "Math", "JSON"):
            dependencies.append(
                {
                    "from": module_name,
                    "to": callee,
                    "type": "call",
                }
            )

    return {"file": str(file_path), "interfaces": interfaces, "dependencies": dependencies}


def _parse_java(file_path: Path) -> dict[str, Any]:
    """使用正则解析 Java 文件。"""
    source = file_path.read_text(encoding="utf-8")
    module_name = file_path.stem
    interfaces = []
    dependencies = []

    # 方法定义: type name(params)
    method_pattern = re.compile(
        r"(?:public|private|protected|static|\s)+"
        r"[\w<>\[\]]+\s+(\w+)\s*\(([^)]*)\)"
    )
    for match in method_pattern.finditer(source):
        name = match.group(1)
        params_str = match.group(2)
        params = [p.strip().split()[-1] if p.strip() else "" for p in params_str.split(",") if p.strip()]
        if name and name not in ("if", "for", "while", "switch"):
            interfaces.append(
                {
                    "id": f"{module_name}.{name}",
                    "module": module_name,
                    "name": name,
                    "params": params,
                    "returns": "",
                    "file": str(file_path),
                    "language": "java",
                }
            )

    # 方法调用
    call_pattern = re.compile(r"(\w+(?:\.\w+)?)\s*\(")
    for match in call_pattern.finditer(source):
        callee = match.group(1)
        if callee not in ("if", "while", "for", "switch", "catch", "System", "Math"):
            dependencies.append(
                {
                    "from": module_name,
                    "to": callee,
                    "type": "call",
                }
            )

    return {"file": str(file_path), "interfaces": interfaces, "dependencies": dependencies}


def _compute_similarities(interfaces: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """计算接口名称相似度。"""
    similarities = []
    for i, a in enumerate(interfaces):
        for b in interfaces[i + 1 :]:
            name_a = a.get("name", "")
            name_b = b.get("name", "")
            if name_a and name_b:
                from difflib import SequenceMatcher

                score = SequenceMatcher(None, name_a.lower(), name_b.lower()).ratio()
                if score > 0.6:
                    similarities.append(
                        {
                            "interfaceA": a["id"],
                            "interfaceB": b["id"],
                            "score": round(score, 2),
                        }
                    )
    return similarities


def slice_code(code_path: str) -> dict[str, Any]:
    """解析代码文件/目录，输出结构化 JSON。

    Args:
        code_path: 代码文件或目录路径

    Returns:
        { interfaces, dependencies, similarities, files }
    """
    files = _collect_files(code_path)
    all_interfaces = []
    all_dependencies = []
    file_results = []

    for file_path in files:
        lang = _detect_language(file_path)
        if lang == "python":
            result = _parse_python(file_path)
        elif lang in ("javascript", "typescript"):
            result = _parse_js_ts(file_path)
        elif lang == "java":
            result = _parse_java(file_path)
        else:
            continue

        file_results.append(result)
        all_interfaces.extend(result.get("interfaces", []))
        all_dependencies.extend(result.get("dependencies", []))

    similarities = _compute_similarities(all_interfaces)

    return {
        "interfaces": all_interfaces,
        "dependencies": all_dependencies,
        "similarities": similarities,
        "files": [str(f) for f in files],
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="TF-IDF 代码切片")
    parser.add_argument("code_path", help="代码文件或目录路径")
    args = parser.parse_args()

    result = slice_code(args.code_path)
    print(json.dumps(result, ensure_ascii=False, indent=2))
