from knowledge_client import KnowledgeClient

client = KnowledgeClient(base_url="http://localhost:3000")

# 示例 1：检索知识
results = client.search("用户登录", mode="rrf", limit=5)
print("检索结果:", results)

# 示例 2：获取草稿列表
drafts = client.list_drafts(status="pending")
print("待审核草稿:", drafts)

# 示例 3：确认入库
if drafts:
    client.confirm_draft(drafts[0]["id"], action="commit")

# 示例 4：查看统计面板
stats = client.get_dashboard_stats()
print("统计面板:", stats)
