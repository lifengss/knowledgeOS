#!/usr/bin/env python3
"""code-upload-parser: 处理代码上传（压缩包或单文件），自动解析并写入知识库。

支持压缩格式：
- zip（.zip）
- tar 系列（.tar / .tar.gz / .tgz / .tar.bz2 / .tbz2 / .tar.xz / .txz）
- 7z（.7z）

流程：
1. 若输入为受支持的压缩包，则解压到临时目录
2. 调用 tfidf-code-slicer 解析接口与调用关系
3. 为每个接口创建草稿（type=code_interface）写入缓冲层
4. 生成 project-wiki/api-<module>.md 供图谱页面展示调用关系

调用方式（由 api/server.js 调用）：
    python skills/code_upload_parser.py --input <压缩包/目录/文件> \
        --db <drafts.db> --brain <brain目录> --note <备注>
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Optional, Tuple

# 允许从项目根目录导入其它技能/缓存模块
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from skills.tfidf_code_slicer import slice_code  # noqa: E402
from cache.draft_cache import DraftCache  # noqa: E402

# Python 内置函数黑名单，避免把 print/open 等当作业务接口
BUILTINS = {
    "print", "open", "len", "range", "str", "int", "float", "list", "dict", "tuple",
    "set", "bool", "type", "id", "input", "max", "min", "sum", "abs", "round",
    "sorted", "reversed", "enumerate", "zip", "map", "filter", "any", "all",
    "hex", "oct", "bin", "chr", "ord", "pow", "divmod", "compile", "eval", "exec",
    "getattr", "setattr", "hasattr", "delattr", "isinstance", "issubclass", "callable",
    "format", "repr", "vars", "locals", "globals", "next", "iter", "slice",
    "memoryview", "bytearray", "bytes", "complex", "frozenset", "object", "property",
    "staticmethod", "classmethod", "super", "__import__", "ascii", "breakpoint",
    "hash", "help", "dir", "exit", "quit",
}


def is_builtin(name: str) -> bool:
    if not name:
        return False
    return name.split(".")[-1] in BUILTINS


# 压缩格式识别：扩展名 + 文件头魔数
ZIP_EXTS = {".zip"}
TAR_EXTS = {".tar", ".tgz", ".tar.gz", ".tar.bz2", ".tbz2", ".tar.xz", ".txz"}
SEVENZ_EXTS = {".7z"}

# 注：tar 自身无统一魔数，故 tar 系列主要依赖扩展名判定；
# 而 zip / 7z / gzip / bzip2 / xz 均有稳定魔数，可在扩展名缺失时回退识别。
MAGIC_ZIP = b"PK\x03\x04"
MAGIC_7Z = b"7z\xbc\xaf\x27\x1c"  # 7z 序列号头
MAGIC_GZIP = b"\x1f\x8b"
MAGIC_BZIP2 = b"BZh"
MAGIC_XZ = b"\xfd\x37\x7a\x58\x5a\x00"  # xz 流头


def _read_magic(p: Path, n: int) -> bytes:
    try:
        with open(p, "rb") as f:
            return f.read(n)
    except Exception:
        return b""


def _is_zip(p: Path) -> bool:
    return _read_magic(p, 4) == MAGIC_ZIP


def _is_7z(p: Path) -> bool:
    return _read_magic(p, 6) == MAGIC_7Z


def _is_gzip(p: Path) -> bool:
    return _read_magic(p, 2) == MAGIC_GZIP


def _is_bzip2(p: Path) -> bool:
    return _read_magic(p, 3) == MAGIC_BZIP2


def _is_xz(p: Path) -> bool:
    return _read_magic(p, 6) == MAGIC_XZ


def _norm_ext(p: Path) -> str:
    """返回小写「完整扩展名链」，如 .tar.gz / .tgz；无则取单一扩展名。"""
    name = p.name.lower()
    if name.endswith(".tar.gz"):
        return ".tar.gz"
    if name.endswith(".tar.bz2"):
        return ".tar.bz2"
    if name.endswith(".tar.xz"):
        return ".tar.xz"
    return p.suffix.lower()


def detect_format(p: Path) -> Optional[str]:
    """识别输入文件的压缩格式，无法识别时返回 None。"""
    ext = _norm_ext(p)
    if ext in ZIP_EXTS or _is_zip(p):
        return "zip"
    if ext in TAR_EXTS or tarfile.is_tarfile(str(p)):
        return "tar"
    if ext in SEVENZ_EXTS or _is_7z(p):
        return "7z"
    # 魔数回退：无扩展名的裸压缩流
    if _is_gzip(p):
        return "tar"  # gzip 通常包裹 tar，且 tarfile 可解
    if _is_bzip2(p):
        return "tar"
    if _is_xz(p):
        return "tar"
    return None


def _extract_zip(src: Path, dest: str) -> None:
    with zipfile.ZipFile(src) as zf:
        zf.extractall(dest)


def _extract_tar(src: Path, dest: str) -> None:
    with tarfile.open(src) as tf:
        # 防止路径穿越解压到 dest 之外
        _safe_extract_tar(tf, dest)


def _safe_extract_tar(tf: tarfile.TarFile, dest: str) -> None:
    dest_path = Path(dest).resolve()
    for member in tf.getmembers():
        target = (dest_path / member.name).resolve()
        if not str(target).startswith(str(dest_path) + os.sep) and target != dest_path:
            raise RuntimeError(f"检测到不安全的压缩包路径: {member.name}")
        tf.extract(member, dest)


def _extract_7z(src: Path, dest: str) -> None:
    """解压 7z：优先 py7zr，其次系统 7z/7za 命令。"""
    try:
        import py7zr  # type: ignore

        with py7zr.SevenZipFile(str(src), mode="r") as zf:
            zf.extractall(path=dest)
        return
    except ImportError:
        pass
    # 回退到命令行 7z
    bin_path = shutil.which("7z") or shutil.which("7za") or shutil.which("7zr")
    if bin_path:
        r = subprocess.run(
            [bin_path, "x", "-y", f"-o{dest}", str(src)],
            capture_output=True,
            text=True,
            check=False,
        )
        if r.returncode == 0:
            return
        raise RuntimeError(f"7z 解压失败: {r.stderr}")
    raise RuntimeError(
        "未找到 7z 解压后端：请安装 Python 包 py7zr（pip install py7zr）或系统 7z 命令行工具。"
    )


def resolve_input(input_path: str) -> Tuple[str, Optional[str]]:
    """解析输入路径，若是受支持的压缩包则解压到临时目录。

    Returns:
        (待解析路径, 临时目录路径或None)
    """
    p = Path(input_path)
    if p.is_dir():
        return str(p), None
    fmt = detect_format(p)
    if fmt:
        tmp = tempfile.mkdtemp(prefix="kos-extract-")
        if fmt == "zip":
            _extract_zip(p, tmp)
        elif fmt == "tar":
            _extract_tar(p, tmp)
        elif fmt == "7z":
            _extract_7z(p, tmp)
        return tmp, tmp
    return str(p), None


def build_draft_content(itf: dict[str, Any], deps: list[dict[str, Any]]) -> str:
    """构建单个接口的草稿正文。"""
    name = itf.get("name", "")
    module = itf.get("module", "")
    params = itf.get("params", []) or []
    returns = itf.get("returns", "") or ""
    lang = itf.get("language", "")
    file_path = itf.get("file", "")
    class_name = itf.get("class", "")

    lines = [
        f"# {module}.{name}",
        "",
        f"- **模块**: `{module}`",
        f"- **语言**: {lang}",
        f"- **源文件**: `{Path(file_path).name}`",
    ]
    if class_name:
        lines.append(f"- **所属类**: `{class_name}`")
    lines.append("")
    lines.append("## 参数")
    if params:
        for p in params:
            lines.append(f"- `{p}`")
    else:
        lines.append("- 无参数")
    lines.append("")
    lines.append("## 返回值")
    lines.append(f"`{returns or 'void'}`")
    lines.append("")

    if deps:
        lines.append("## 调用")
        for d in deps:
            lines.append(f"- `{d['to']}` （{d.get('type', 'call')}）")
        lines.append("")

    return "\n".join(lines)


def _unique_module_name(pw_dir: Path, base: str, used: set[str]) -> str:
    """计算不与现有文件及已分配名称冲突的模块页面名（冲突时追加 -codeN）。"""
    candidate = base
    i = 0
    while (pw_dir / f"api-{candidate}.md").exists() or candidate in used:
        i += 1
        candidate = f"{base}-code{i}"
    used.add(candidate)
    return candidate


def write_graph_markdown(
    slice_result: dict[str, Any],
    pw_dir: Path,
    note: str,
    module_set: set[str],
) -> list[str]:
    """为每个模块生成 api-<module>.md，供图谱解析。

    与已手工维护的页面重名时自动追加 -codeN 后缀，避免覆盖。
    """
    interfaces = slice_result.get("interfaces", [])
    dependencies = slice_result.get("dependencies", [])

    # 裸函数名 -> 所属模块（用于把 `add` 映射到 `module.add`）
    name_to_module: dict[str, str] = {}
    for itf in interfaces:
        name_to_module.setdefault(itf.get("name", ""), itf.get("module", "unknown"))

    # 按模块归并接口
    by_module: dict[str, list[dict[str, Any]]] = {}
    for itf in interfaces:
        by_module.setdefault(itf.get("module", "unknown"), []).append(itf)

    # 预先分配不冲突的模块页面名（仅基于现有文件，避免生成顺序影响）
    used: set[str] = set()
    module_remap: dict[str, str] = {}
    for m in sorted(module_set):
        module_remap[m] = _unique_module_name(pw_dir, m, used)

    def remap_token(token: str) -> Optional[str]:
        """将 token 重写为实际模块命名（module.func 或裸函数名）。"""
        if "." in token:
            m, rest = token.split(".", 1)
            if m in module_remap:
                return f"{module_remap[m]}.{rest}"
            return None
        if token in name_to_module:
            m = name_to_module[token]
            if m in module_remap:
                return f"{module_remap[m]}.{token}"
        return None

    written = []
    for module, mod_interfaces in by_module.items():
        actual = module_remap.get(module, module)
        file_path = pw_dir / f"api-{actual}.md"

        # 调用边：to 指向已知接口且非内置函数
        edges = []
        for dep in dependencies:
            eff = remap_token(dep.get("to", ""))
            if not eff or is_builtin(eff):
                continue
            frm = remap_token(dep.get("from", ""))
            if not frm:
                frm = dep.get("from", "")
            edges.append({"from": frm, "to": eff, "type": dep.get("type", "call")})

        lines = [
            "---",
            f'title: "{actual}"',
            "type: api-module",
            "source: code-upload",
        ]
        if note:
            safe_note = note.replace('"', "'")
            lines.append(f'uploadNote: "{safe_note}"')
        lines += [
            "---",
            "",
            f"# {actual}",
            "",
            "> 自动解析自代码上传" + (f"（{note}）" if note else ""),
            "",
            "## 接口列表",
        ]
        for itf in mod_interfaces:
            params = itf.get("params", []) or []
            param_str = ", ".join(params) if params else ""
            lines.append(f"- `{actual}.{itf.get('name', '')}` → (params: {param_str})")

        if edges:
            lines.append("")
            lines.append("## 调用关系")
            for dep in edges:
                lines.append(
                    f"- `{dep.get('from', '')}` → `{dep.get('to', '')}` （{dep.get('type', 'call')}）"
                )

        file_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        written.append(str(file_path))

    return written


def main() -> None:
    parser = argparse.ArgumentParser(description="代码上传解析器")
    parser.add_argument("--input", required=True, help="压缩包(zip/tar/7z) / 代码目录 / 单个代码文件")
    parser.add_argument("--db", default=None, help="drafts.db 路径")
    parser.add_argument("--brain", default="./brain", help="brain 仓库根目录")
    parser.add_argument("--note", default="", help="上传备注")
    args = parser.parse_args()

    target, tmp_dir = resolve_input(args.input)
    slice_result = slice_code(target)

    interfaces = slice_result.get("interfaces", [])
    dependencies = slice_result.get("dependencies", [])
    module_set = {itf.get("module", "unknown") for itf in interfaces}

    # 1. 写入草稿（过滤内置函数与重复接口）
    cache = DraftCache(args.db)
    created_draft_ids = []
    seen_interfaces = set()
    for itf in interfaces:
        key = (itf.get("module", "unknown"), itf.get("name", ""))
        if key in seen_interfaces:
            continue
        seen_interfaces.add(key)
        if is_builtin(itf.get("name", "")):
            continue
        name = itf.get("name", "")
        module = itf.get("module", "unknown")
        deps = [d for d in dependencies if d.get("from", "").split(".")[0] == module]
        content = build_draft_content(itf, deps)
        draft_id = cache.add_draft(
            {
                "source": "upload",
                "type": "code_interface",
                "title": f"{module}.{name}",
                "content": content,
                "metadata": {
                    "kind": "code_interface",
                    "language": itf.get("language", ""),
                    "module": module,
                    "name": name,
                    "params": itf.get("params", []),
                    "returns": itf.get("returns", ""),
                    "sourceFile": itf.get("file", ""),
                    "uploadNote": args.note,
                    "uploadType": "code",
                },
            }
        )
        created_draft_ids.append(draft_id)
    cache.close()

    # 2. 生成图谱 Markdown
    brain_repo = Path(args.brain)
    pw_dir = brain_repo / "project-wiki"
    pw_dir.mkdir(parents=True, exist_ok=True)
    written_files = write_graph_markdown(slice_result, pw_dir, args.note, module_set)

    # 3. 清理临时解压目录
    if tmp_dir:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    summary = {
        "files": len(slice_result.get("files", [])),
        "interfaces": len(interfaces),
        "dependencies": len(dependencies),
        "similarities": len(slice_result.get("similarities", [])),
        "draftsCreated": len(created_draft_ids),
        "graphPages": len(written_files),
    }
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
