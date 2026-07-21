#!/usr/bin/env python3
"""测试 Brain 仓库导入功能。

覆盖场景：
- 测试用例导入 brain/test-cases/
- 代码切片生成 project-wiki API 页面
- 生成的 Markdown 格式符合 Brain 页面规范
"""

import json
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from skills.tfidf_code_slicer import slice_code


class TestImportTestCasesToBrain:
    def test_test_cases_dir_exists(self):
        """brain/test-cases/ 目录应存在且包含导入的用例。"""
        tc_dir = PROJECT_DIR / "brain" / "test-cases"
        assert tc_dir.exists()
        files = list(tc_dir.glob("TC-*.md"))
        assert len(files) > 0

    def test_test_case_has_frontmatter(self):
        """导入的测试用例应包含 frontmatter。"""
        tc_file = PROJECT_DIR / "brain" / "test-cases" / "TC-L2-01.md"
        assert tc_file.exists()
        content = tc_file.read_text(encoding="utf-8")
        assert content.startswith("---")
        assert "type: test-case" in content
        assert "case_id: TC-L2-01" in content

    def test_test_case_has_compiled_truth(self):
        """导入的测试用例应包含 Compiled Truth 章节。"""
        tc_file = PROJECT_DIR / "brain" / "test-cases" / "TC-L2-01.md"
        content = tc_file.read_text(encoding="utf-8")
        assert "## Compiled Truth" in content

    def test_test_case_has_timeline(self):
        """导入的测试用例应包含 Timeline 章节。"""
        tc_file = PROJECT_DIR / "brain" / "test-cases" / "TC-L2-01.md"
        content = tc_file.read_text(encoding="utf-8")
        assert "## Timeline" in content


class TestCloneAndSliceProject:
    def test_slice_result_has_interfaces(self):
        """代码切片结果应包含接口列表。"""
        result = slice_code(str(PROJECT_DIR / "scripts"))
        assert "interfaces" in result
        assert len(result["interfaces"]) > 0

    def test_slice_result_has_dependencies(self):
        """代码切片结果应包含依赖关系。"""
        result = slice_code(str(PROJECT_DIR / "scripts"))
        assert "dependencies" in result

    def test_project_wiki_dir_exists(self):
        """brain/project-wiki/ 目录应存在且包含 API 页面。"""
        wiki_dir = PROJECT_DIR / "brain" / "project-wiki"
        assert wiki_dir.exists()
        files = list(wiki_dir.glob("api-*.md"))
        assert len(files) > 0

    def test_api_page_has_frontmatter(self):
        """API 页面应包含 frontmatter。"""
        wiki_file = PROJECT_DIR / "brain" / "project-wiki" / "api-overview.md"
        assert wiki_file.exists()
        content = wiki_file.read_text(encoding="utf-8")
        assert content.startswith("---")
        assert "type: project-wiki" in content

    def test_api_page_has_module_list(self):
        """API 总览页面应包含模块列表。"""
        wiki_file = PROJECT_DIR / "brain" / "project-wiki" / "api-overview.md"
        content = wiki_file.read_text(encoding="utf-8")
        assert "模块列表" in content or "接口列表" in content
