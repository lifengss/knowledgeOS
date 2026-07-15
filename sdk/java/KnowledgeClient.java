import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.Map;

import okhttp3.*;
import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;

/**
 * 知识管理系统 V1.0 Java 简易 SDK
 *
 * 依赖：okhttp、 gson
 * Maven：
 *   <dependency>
 *     <groupId>com.squareup.okhttp3</groupId>
 *     <artifactId>okhttp</artifactId>
 *     <version>4.12.0</version>
 *   </dependency>
 *   <dependency>
 *     <groupId>com.google.code.gson</groupId>
 *     <artifactId>gson</artifactId>
 *     <version>2.10.1</version>
 *   </dependency>
 */
public class KnowledgeClient {
    private final OkHttpClient httpClient;
    private final Gson gson;
    private final String baseUrl;

    public KnowledgeClient(String baseUrl) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.httpClient = new OkHttpClient();
        this.gson = new Gson();
    }

    private String postJson(String path, String json) throws IOException {
        RequestBody body = RequestBody.create(json, MediaType.parse("application/json"));
        Request request = new Request.Builder()
                .url(baseUrl + path)
                .post(body)
                .build();
        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) throw new IOException("Unexpected code " + response);
            return response.body().string();
        }
    }

    private String get(String path) throws IOException {
        Request request = new Request.Builder()
                .url(baseUrl + path)
                .build();
        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) throw new IOException("Unexpected code " + response);
            return response.body().string();
        }
    }

    public Map<String, Object> uploadSource(String filePath, String type, String note) throws IOException {
        File file = new File(filePath);
        RequestBody requestBody = new MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("type", type)
                .addFormDataPart("note", note != null ? note : "")
                .addFormDataPart("file", file.getName(), RequestBody.create(file, MediaType.parse("application/octet-stream")))
                .build();
        Request request = new Request.Builder()
                .url(baseUrl + "/api/source-upload")
                .post(requestBody)
                .build();
        try (Response response = httpClient.newCall(request).execute()) {
            return gson.fromJson(response.body().string(), new TypeToken<Map<String, Object>>(){}.getType());
        }
    }

    public Map<String, Object> confirmDraft(String draftId, String action) throws IOException {
        String json = gson.toJson(Map.of("draftId", draftId, "action", action));
        return gson.fromJson(postJson("/api/confirm", json), new TypeToken<Map<String, Object>>(){}.getType());
    }

    public List<Map<String, Object>> listPages() throws IOException {
        return gson.fromJson(get("/api/brain"), new TypeToken<List<Map<String, Object>>>(){}.getType());
    }

    public Map<String, Object> getPage(String pageId) throws IOException {
        return gson.fromJson(get("/api/brain/" + pageId), new TypeToken<Map<String, Object>>(){}.getType());
    }

    public List<Map<String, Object>> batchReadPages(List<String> pageIds) throws IOException {
        String json = gson.toJson(Map.of("pageIds", pageIds));
        return gson.fromJson(postJson("/api/brain/batch-read", json), new TypeToken<List<Map<String, Object>>>(){}.getType());
    }

    public Map<String, Object> batchWritePages(List<Map<String, Object>> pages) throws IOException {
        String json = gson.toJson(Map.of("pages", pages));
        return gson.fromJson(postJson("/api/brain/batch-write", json), new TypeToken<Map<String, Object>>(){}.getType());
    }

    public List<Map<String, Object>> search(String query, String mode, int limit) throws IOException {
        String json = gson.toJson(Map.of("query", query, "mode", mode, "limit", limit));
        return gson.fromJson(postJson("/api/search", json), new TypeToken<List<Map<String, Object>>>(){}.getType());
    }

    public List<Map<String, Object>> listDrafts() throws IOException {
        return gson.fromJson(get("/api/drafts"), new TypeToken<List<Map<String, Object>>>(){}.getType());
    }

    public List<Map<String, Object>> listConflicts() throws IOException {
        return gson.fromJson(get("/api/conflicts"), new TypeToken<List<Map<String, Object>>>(){}.getType());
    }

    public Map<String, Object> resolveConflict(String conflictId, String resolution) throws IOException {
        String json = gson.toJson(Map.of("resolution", resolution));
        return gson.fromJson(postJson("/api/conflicts/" + conflictId + "/resolve", json), new TypeToken<Map<String, Object>>(){}.getType());
    }

    public List<Map<String, Object>> listAuditLogs() throws IOException {
        return gson.fromJson(get("/api/audit"), new TypeToken<List<Map<String, Object>>>(){}.getType());
    }

    public Map<String, Object> getDashboardStats() throws IOException {
        return gson.fromJson(get("/api/dashboard"), new TypeToken<Map<String, Object>>(){}.getType());
    }

    public List<Map<String, Object>> verifySearch(String question) throws IOException {
        String json = gson.toJson(Map.of("question", question));
        return gson.fromJson(postJson("/api/verify-search", json), new TypeToken<List<Map<String, Object>>>(){}.getType());
    }

    public Map<String, Object> registerWebhook(String url, List<String> events) throws IOException {
        String json = gson.toJson(Map.of("url", url, "events", events));
        return gson.fromJson(postJson("/api/webhook/register", json), new TypeToken<Map<String, Object>>(){}.getType());
    }
}
