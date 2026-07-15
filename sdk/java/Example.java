import java.util.List;
import java.util.Map;

public class Example {
    public static void main(String[] args) throws Exception {
        KnowledgeClient client = new KnowledgeClient("http://localhost:3000");

        // 示例 1：检索知识
        List<Map<String, Object>> results = client.search("用户登录", "rrf", 5);
        System.out.println("检索结果: " + results);

        // 示例 2：获取草稿列表
        List<Map<String, Object>> drafts = client.listDrafts();
        System.out.println("待审核草稿: " + drafts);

        // 示例 3：查看统计面板
        Map<String, Object> stats = client.getDashboardStats();
        System.out.println("统计面板: " + stats);
    }
}
