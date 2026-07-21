"""将 Brain 目录中的 Markdown 文件导入为 drafts，供 Web UI 审核。"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from cache.draft_cache import DraftCache

DB_PATH = Path(__file__).parent.parent / "cache" / "drafts.db"
BRAIN_DIR = Path(__file__).parent.parent / "brain"

TYPE_MAP = {
    "test-cases": "test_case",
    "project-wiki": "project_wiki",
    "quality-rules": "quality_rule",
    "defect-experience": "defect_experience",
}


def import_brain_to_drafts():
    cache = DraftCache(str(DB_PATH))
    imported = 0
    skipped = 0

    for cat_dir in BRAIN_DIR.iterdir():
        if not cat_dir.is_dir():
            continue
        cat_name = cat_dir.name
        draft_type = TYPE_MAP.get(cat_name, cat_name)

        for md_file in cat_dir.glob("*.md"):
            content = md_file.read_text(encoding="utf-8")
            title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
            title = title_match.group(1).strip() if title_match else md_file.stem

            # 检查是否已存在相同标题的草稿
            cursor = cache._conn.execute(
                "SELECT id FROM drafts WHERE title = ? AND type = ? LIMIT 1",
                (title, draft_type),
            )
            if cursor.fetchone():
                skipped += 1
                continue

            draft_id = cache.add_draft({
                "source": "brain_import",
                "type": draft_type,
                "title": title,
                "content": content,
                "metadata": {"brain_path": str(md_file.relative_to(BRAIN_DIR)), "category": cat_name},
                "status": "pending",
            })
            imported += 1
            print(f"  Imported: {draft_id} ({cat_name}/{md_file.name})")

    cache.close()
    print(f"\n导入完成: {imported} 个新草稿, {skipped} 个已存在跳过")
    return imported, skipped


if __name__ == "__main__":
    import_brain_to_drafts()
