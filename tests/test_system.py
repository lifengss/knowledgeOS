"""系统级测试：L0 接入层、L3 内核层、DFX。

覆盖测试大纲：
- L0: TC-L0-01/02/03/04/14
- L3: TC-L3-01/02/03/04
- DFX: TC-DFX-04/05/06/07/09/10/12

注意：部分测试需要 GBrain 已安装和 brain/ 目录已初始化。
"""

import os
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent
BRAIN_DIR = PROJECT_ROOT / "brain"


def _run_cmd(cmd: list[str], check: bool = False) -> subprocess.CompletedProcess:
    """运行命令并返回结果。"""
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=check,
        cwd=PROJECT_ROOT,
    )


class TestL0Access:
    """L0 接入层测试。"""

    def test_gbrain_version(self):
        """TC-L0-01: GBrain 内核安装与版本验证。"""
        result = _run_cmd(["gbrain", "--version"])
        assert result.returncode == 0
        assert result.stdout.strip()
        assert any(c.isdigit() for c in result.stdout)

    def test_brain_structure(self):
        """TC-L0-02: Brain 仓库目录结构验证。"""
        if not BRAIN_DIR.exists():
            pytest.skip("brain/ 目录未初始化")
        expected_dirs = ["quality-rules", "defect-experience", "project-wiki", "test-cases"]
        for dirname in expected_dirs:
            assert (BRAIN_DIR / dirname).exists(), f"缺少目录: {dirname}"

    def test_mcp_http_server_help(self):
        """TC-L0-03/04: MCP HTTP 服务命令可用。"""
        result = _run_cmd(["gbrain", "serve", "--help"])
        assert result.returncode == 0 or "Usage" in result.stdout

    def test_gbrain_list_pages(self):
        """GBrain 能列出页面。"""
        result = _run_cmd(["gbrain", "list"])
        assert result.returncode == 0


class TestL3Kernel:
    """L3 GBrain 内核层测试。"""

    def test_four_directories(self):
        """TC-L3-01: 四目录结构。"""
        if not BRAIN_DIR.exists():
            pytest.skip("brain/ 目录未初始化")
        for name in ["quality-rules", "defect-experience", "project-wiki", "test-cases"]:
            assert (BRAIN_DIR / name).exists()

    def test_page_structure(self):
        """TC-L3-02: Markdown 页面结构验证。"""
        result = _run_cmd(["gbrain", "list"])
        if result.returncode != 0 or not result.stdout.strip():
            pytest.skip("GBrain 中无页面")
        lines = result.stdout.strip().split("\n")
        slug = None
        for line in lines:
            parts = line.split()
            if parts:
                slug = parts[0]
                break
        if not slug:
            pytest.skip("无法获取页面 slug")
        get_result = _run_cmd(["gbrain", "get", slug])
        if get_result.returncode != 0:
            pytest.skip(f"无法读取页面 {slug}")
        content = get_result.stdout
        # 页面应为非空 Markdown，包含 frontmatter 或正文
        assert content.strip()

    def test_rrf_search(self):
        """TC-L3-03: RRF 混合搜索。"""
        result = _run_cmd(["gbrain", "search", "test"])
        assert result.returncode == 0

    def test_keyword_search(self):
        """TC-L3-04: 关键词搜索。"""
        result = _run_cmd(["gbrain", "search", "coding"])
        assert result.returncode == 0


class TestDfx:
    """DFX 测试。"""

    def test_env_separation(self):
        """TC-DFX-04: 环境变量配置分离。"""
        env_example = PROJECT_ROOT / ".env.example"
        if env_example.exists():
            content = env_example.read_text(encoding="utf-8")
            assert "MAAS_API_KEY" in content or "API_KEY" in content

    def test_scripts_executable(self):
        """TC-DFX-05: 运维脚本可独立执行。"""
        scripts = ["scripts/init_cache.py", "scripts/cleanup_stale_drafts.py", "scripts/alert_monitor.py"]
        for script in scripts:
            path = PROJECT_ROOT / script
            if path.exists():
                result = _run_cmd(["python", str(script), "--help"])
                # --help 应成功或显示用法
                assert result.returncode == 0 or "usage" in result.stderr.lower()

    def test_audit_log_queryable(self):
        """TC-DFX-07: 审计日志可查询。"""
        import sys
        sys.path.insert(0, str(PROJECT_ROOT))
        from cache import AuditLog
        import tempfile
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        try:
            log = AuditLog(path)
            log.log("test", "system", None, {"message": "DFX test"})
            result = log.query({"action": "test"})
            assert result["total"] >= 1
            log.close()
        finally:
            os.unlink(path)

    def test_git_backup(self):
        """TC-DFX-09: Brain 仓库 Git 备份。"""
        if not BRAIN_DIR.exists():
            pytest.skip("brain/ 目录未初始化")
        git_dir = BRAIN_DIR / ".git"
        # Git 备份是可选的，不强制要求
        if git_dir.exists():
            result = _run_cmd(["git", "-C", str(BRAIN_DIR), "log", "--oneline", "-1"])
            assert result.returncode == 0

    def test_skill_documentation(self):
        """TC-DFX-10: Skill 文档完整性。"""
        skill_md_dir = PROJECT_ROOT / "skills" / "knowledge-os" / "skills"
        if skill_md_dir.exists():
            skills = ["tfidf-code-slicer", "api-graph-builder", "conflict-detector",
                      "quality-gate", "batch-commit", "single-commit", "case-generator", "case-validator"]
            for skill in skills:
                md_file = skill_md_dir / skill / "SKILL.md"
                assert md_file.exists(), f"缺少 Skill 文档: {skill}"

    def test_compat_check(self):
        """TC-DFX-12: 启动兼容校验脚本。"""
        script = PROJECT_ROOT / "scripts" / "compat-check.sh"
        if not script.exists():
            pytest.skip("compat-check.sh 不存在")
        # Windows 上跳过 .sh 脚本测试
        if os.name == "nt":
            pytest.skip("Windows 上跳过 .sh 脚本测试")
        result = _run_cmd(["bash", str(script)])
        assert result.returncode == 0
