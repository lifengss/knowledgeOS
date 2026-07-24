# 知识库浏览模块：详情修复 + 新增/批量功能 回归报告（2026-07-24）

## 一、关于测试盲区的说明（回应"测试不充分"的批评）

上一轮回归（`regression-tests.cjs`）只覆盖 API 元信息层（统计/冲突/页面数一致性），
**未做浏览器级 UI 验证**，也**未覆盖详情接口的内容正确性**。本轮补上：

- 用无头浏览器（playwright）真实点击 `知识库浏览` 各分类记录，确认详情模态打开正常，
  控制台仅有 favicon 404（非 JS 异常）。
- 新增 `feature-tests.cjs`：覆盖详情接口的真实标题/去 frontmatter 正文、列表标题修复、
  单条新增、批量新增、参数校验，并自动清理测试数据。

> 结论：**当前代码中"点击记录加载详情页"功能本身可用**（project-wiki / quality-rules /
> test-cases 三类均实测打开成功）。此前用户感知到的"报错/坏掉"主要源于两个真实显示缺陷
> （见下），而非加载失败。若仍有个别记录报错，多为浏览器对旧 `app.js` 的缓存，建议硬刷新
> （Ctrl+F5）后重试，并附带具体报错文案/浏览器以便进一步定位。

## 二、修复的详情显示缺陷

| 编号 | 缺陷 | 根因 | 修复 |
|------|------|------|------|
| D1 | 列表与详情标题显示占位符"标题" | `/api/brain/pages` 列表仅取正文内 `# H1`；很多文件 frontmatter 的 `title:` 才是真实标题、H1 反为占位符 | `api/server.js`：列表 `title` 优先取 `parseFrontmatter` 的 `title:`，回退 `# H1`→文件名 |
| D2 | 早期写入文件 frontmatter 为 CRLF，`parseFrontmatter` 正则 `^---\n` 匹配不到 | 旧文件落盘 CRLF | `parseFrontmatter` 正则改为 `^---\r?\n...\r?\n---`，兼容 CRLF（同时惠及图谱等用法） |
| D3 | 详情模态直接吐出原始 `--- title:... ---` frontmatter | `showPageDetail` 原样展示 `content` | 详情接口返回 `body`（去除 frontmatter）；前端 `showPageDetail` 用 `data.title` + `renderMarkdown(body)` 渲染；`openViewModal` 新增 `html` 选项复用 `.wiki-md` 样式 |

## 三、新增功能：各分类「新增条目」与「批量增加」

### 后端（`api/server.js`）
- `POST /api/brain/pages`：新增单条。body `{ category, title, content, type? }`，
  生成 uuid 写入项目**私有库**对应分类目录，附 frontmatter（title/type/source:manual/时间），记录审计 `create_page`。
- `POST /api/brain/pages/batch`：批量新增。body `{ category, entries:[{title,content}], type? }`，
  逐条写入，记录审计 `batch_create_page`。
- 类型映射：quality-rules→quality_rule，defect-experience→defect_experience，
  project-wiki→project_wiki，test-cases→test_case，test-scripts→test_script。
- 校验：缺 `category`/`title` 或空 `entries` 返回 400。

### 前端（`web/src/app.js` + `styles.css`）
- 知识库浏览工具栏新增按钮 **「新增条目」** / **「批量增加」**。
- 新增条目：分类下拉（默认当前筛选类别）+ 标题 + Markdown 内容，保存后刷新列表。
- 批量增加：分类下拉 + 大文本框；每条以单独一行的 `----`（4 个及以上短横线）分隔，
  块内首行作为标题（可带 `#`/`##` 前缀，自动去除），其余为正文。提交前 `confirm` 确认。
- 详情模态渲染 Markdown（真实标题 + 去 frontmatter 正文）。

## 四、回归结果

- `regression-tests.cjs`（综合，含页面数/A3-A5 断言）：**PASS=29 FAIL=0 WARN=0**（改动未破坏既有一致性）。
- `feature-tests.cjs`（本轮新增）：**PASS=16 FAIL=0 WARN=0**，覆盖：
  - A1-A5 详情接口真实标题 + 去 frontmatter 正文
  - B1-B2 列表标题不再批量显示占位符
  - C1-C3 单条新增
  - D1-D4 批量新增
  - E1-E2 参数校验
  - 自动清理全部测试数据

## 五、入库产物（经 BFF 回流，项目 `default`，落盘 `brains/default/defect_rule/`）

- `feature-tests.cjs`（本轮功能/详情回归脚本）
- `FEATURE-REPORT.md`（本报告）

> 注：`/api/brain/pages` 列表的 `title` 字段此前对 frontmatter 标题返回占位符"标题"，
> 现已修复为真实标题；`detail` 接口新增 `title`/`body`/`frontmatter` 字段，旧 `content` 仍保留兼容。
