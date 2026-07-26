# Mikanarr 全量整改设计

日期：2026-07-26  
状态：已批准，待书面复核

## 目标

在保留 Express、SQLite 和原生 JavaScript 前端的前提下，把当前仓库提升到可安全自托管的最低生产基线：修复已复现的认证、SSRF、XSS、数据完整性和前端正确性缺陷，补齐自动化回归测试、CI 质量门禁、容器健康检查与一致的部署文档，并解决已定位的主要性能问题。

## 非目标

- 不改写为 React、Vue、TypeScript 或其他前端框架。
- 不引入 ORM、微服务、消息队列或完整可观测性平台。
- 不实现多用户、细粒度 RBAC 或高可用多实例部署。
- 不追求一次性拆分整个 2642 行前端文件；只提取本次整改需要独立测试或复用的边界。
- 不改变 Mikan RSS 到 Sonarr 标题转换的业务格式。

## 总体方案

采用分阶段、原地加固方案。后端增加少量职责明确的模块：配置校验、Pattern 输入校验、外部 URL 策略和应用装配；数据库仍使用 `better-sqlite3`，但所有破坏性批量操作必须在事务中完成。前端继续使用原生 DOM 和 Bootstrap，只移除不安全的数据注入方式、修复请求状态处理，并减少重复渲染和重复外部请求。

测试使用 Node.js 22 自带的 `node:test` 和 `fetch`，不增加 Jest、Mocha 或 Supertest。安全协议是例外：OIDC 不再手写，使用维护中的 OIDC 客户端库完成 discovery、PKCE、state、nonce 和 ID Token 验证。

## 认证与会话

### 启动配置

新增集中配置模块，在监听端口前完成校验：

- 本地登录只有在 `ADMIN_USERNAME` 与 `ADMIN_PASSWORD` 都是非空字符串时启用。
- OIDC 只有在 `OIDC_ISSUER`、`OIDC_CLIENT_ID`、`OIDC_CLIENT_SECRET`、`OIDC_REDIRECT_URI` 全部存在，并且至少配置 `OIDC_ALLOWED_SUBJECTS` 或 `OIDC_REQUIRED_GROUP` 之一时启用。
- 本地登录和 OIDC 至少启用一种；否则进程以非零状态退出。
- 旧的 `OIDC_AUTH_URL`、`OIDC_TOKEN_URL` 配置不再参与登录；检测到旧配置但没有 `OIDC_ISSUER` 时，启动错误必须给出明确迁移说明。
- `PORT`、布尔值、超时和响应大小限制均在配置模块中解析并验证，路由不再散落读取 `process.env`。

### 浏览器会话

- 内部 JWT 保存到名为 `mikanarr_session` 的 Cookie，不再返回给前端 JavaScript。
- Cookie 属性为 `HttpOnly`、`SameSite=Strict`、`Path=/`，有效期 24 小时；生产环境默认带 `Secure`，可通过明确的开发配置关闭。
- `verifyToken` 只从会话 Cookie 读取 JWT，删除查询参数 token 支持。
- `/auth/login` 验证成功后设置 Cookie并返回最小用户信息；失败统一返回 401，不泄露用户名是否存在。
- `/auth/logout` 清除 Cookie；`/auth/session` 用于前端判断当前登录状态。
- 删除全局开放 CORS。状态变更请求若带跨站 `Origin` 或 `Sec-Fetch-Site: cross-site`，直接拒绝。
- 本地登录按来源 IP 对连续失败进行内存限速：15 分钟内最多 5 次失败；成功登录清除该 IP 的失败记录。该限制只服务单实例自托管场景。

### OIDC

- 使用 issuer discovery 创建客户端，不再直接信任 token endpoint 的成功响应。
- 登录时生成并以短期、`HttpOnly`、`SameSite=Lax` Cookie 保存 state、nonce 和 PKCE verifier；回调必须全部验证并一次性清除。
- ID Token 必须通过签名、issuer、audience、nonce 和有效期校验。
- 授权规则为：subject 在 `OIDC_ALLOWED_SUBJECTS` 中，或配置的 groups claim 包含 `OIDC_REQUIRED_GROUP`。不满足时返回 403，不签发内部会话。
- 回调错误只返回固定的纯文本消息，不回显查询参数，不生成内联脚本。

### 密钥

- JWT RSA 私钥创建时权限为 `0600`，公钥为 `0644`；启动时修正已有私钥权限。
- 数据目录在打开 SQLite 或生成密钥前创建。
- 日志不得输出 JWT、Cookie、Sonarr API Key、OIDC secret 或包含 Mikan token 的查询字符串。

## Pattern 与数据库完整性

### 输入校验

POST、PUT 和 import 共用一个小型验证函数：

- `pattern`、`series`、`season` 为必填字符串，限制合理长度。
- `remote` 为空或为合法 HTTPS Mikan URL。
- `offset` 为有限安全整数。
- `language`、`quality`、`releasegroup` 为有限长度字符串。
- 正则必须能编译、包含命名捕获组 `episode`，长度受限，并通过安全正则检查以降低灾难性回溯风险。
- 请求体中的 `id`、时间戳和统计字段始终忽略，资源 ID 只来自经过正整数校验的路径参数。

错误统一返回 400 与稳定错误码。不存在的 GET、PUT、DELETE 返回 404；DELETE 不再对不存在记录静默返回 204。

### 数据库

- 表结构只由数据库初始化和迁移代码维护，路由不得复制建表 SQL。
- 数据库初始化迁移失败时终止启动，不带损坏 schema 继续运行。
- 覆盖导入先完整验证全部输入，再使用一个 `better-sqlite3` transaction 执行 `DELETE`、重置 `sqlite_sequence` 和全部插入。任一插入失败整体回滚。
- 覆盖导入不再 `DROP TABLE`，因此保留 `last_matched_at` 和 `match_count` 列。
- `updatePattern` 最后覆盖内部 ID，客户端字段不能替换路径 ID。
- 删除重复 export/import 路由和临时 `/test-clear` 端点。
- 排序白名单补齐 `last_matched_at`。

### RSS 热路径

- 每个请求只为每条 Pattern 编译一次正则。
- 按 Pattern 聚合匹配次数，每个 Pattern 每次请求最多进行一次同步数据库更新。
- 日志只记录固定路由名、状态和耗时，不记录原始查询参数。
- 上游 XML 设置超时与最大响应大小；异常向客户端返回固定消息，详细但已脱敏的信息只进入服务端日志。

## 外部代理与 API

### URL 策略

新增共享 URL 策略函数，使用 WHATWG `URL` 解析：

- Mikan 代理只允许 `https:`、精确主机 `mikanani.me`、无 username/password、无非默认端口。
- 图片代理只允许现有明确域名及其子域名，协议必须为 HTTPS。
- Axios 重定向的每一跳都必须再次执行同一策略；最多 3 跳。
- XML/JSON 响应设置最大字节数；图片流同时检查 `Content-Length` 并在实际流量超限时终止。
- 上游错误正文不直接转发到应用 JSON 错误或浏览器 HTML。

### Sonarr

- API Key 使用 `X-Api-Key` 请求头，不再追加到 URL。
- 默认验证 Sonarr HTTPS 证书；仅显式开发配置允许不安全 TLS。
- 日志只记录方法、无查询路径、状态码和耗时。
- 代理仍保持在 JSON body parser 前，保留请求体流式转发行为。

### TMDB

- 删除未实现且永不响应的 `/tmdb/search`。
- `/tv`、`/find` 与同步接口使用统一超时和响应大小限制。
- 先向前端返回 Sonarr Series，再在后台同步中文名。
- 同步使用最多 4 个 worker 的有限并发。
- 网络异常不写永久 null 缓存；确定性未找到结果使用短期负缓存，其他缓存按 `updated_at` 刷新。

## 前端

### API 与认证

- `apiRequest` 使用同源 Cookie，不再构造 Authorization header。
- 除明确允许调用者自行处理的场景外，所有非 2xx 响应解析错误后抛出；保存、单删、批删只有在成功响应后更新 UI 和显示成功提示。
- 应用启动先调用 `/auth/session`。401 只触发一次统一的退出状态，不产生重复请求和多个重定向定时器。

### DOM 安全

- Toast、确认框和错误提示的用户或上游数据使用 `textContent` 与 DOM API，不拼入 `innerHTML`。
- Pattern、Sonarr、TMDB 和 RSS 动态字段在文本、属性和 URL 上分别使用正确的 DOM setter。
- 移除动态模板中的内联 `onclick`；使用事件委托或已有事件监听器。
- HTML 中移除内联错误处理脚本和内联 Service Worker 注册脚本。
- 设置 CSP：脚本只允许本站和带完整性校验的固定 CDN；禁止内联脚本和对象；限制 frame、connect、image 与 base URI。由于现有页面含内联样式，首轮保留 `style-src 'unsafe-inline'`，但不允许 `script-src 'unsafe-inline'`。

### 正确性与性能

- 卡片与表格只渲染当前视图；切换视图时使用现有 `allPatterns` 重绘。
- TMDB 详情按 ID 缓存 Promise，相同 Series 不重复请求。
- 删除启动期间重复的 Pattern 网络加载。
- Series 下拉框先渲染英文信息，再异步刷新中文缓存。
- 表格与卡片复选框使用同一选择逻辑，卡片视图可以正常批量操作。
- 修复 `last_matched_at` 排序、导入对话框重复 ID、确认框 Escape 监听器泄漏和导入取消按钮选择错误。
- 删除未使用的图片代理前端假设；若保留后端端点，前端图片 URL 必须通过受控代理生成。

### Service Worker

- 只拦截和缓存明确列出的静态资源，不缓存 `/api`、`/auth`、`/sonarr`、`/tmdb`、`/proxy` 或 `/RSS`。
- 只缓存成功响应，安装失败不因单个第三方 CDN 资源导致整个 Service Worker 失败。
- `activate` 删除旧版本缓存并立即接管。

## 错误处理与安全响应头

- API 错误格式统一为 `{ "error": "用户可读消息", "code": "稳定错误码" }`。
- 生产环境 500 不返回内部异常消息、上游响应或堆栈。
- 使用原生 Express 中间件设置 CSP、`X-Content-Type-Options: nosniff`、`Referrer-Policy`、`frame-ancestors` 和最小 Permissions Policy。
- 增加 `/api/health`：检查进程、数据库可查询性和 schema，不访问外部依赖；成功返回 200，失败返回 503。

## 测试策略

使用 `node:test`，所有行为修复遵循红—绿—重构：

1. 配置与认证测试：缺失配置启动失败、空 JSON 不能登录、Cookie 属性、logout/session、失败限速。
2. OIDC 单元与边界测试：不完整配置禁用、state/nonce/PKCE 缺失被拒绝、未授权 subject/group 返回 403、错误参数不被 HTML 反射。
3. URL 策略测试：拒绝前缀域、userinfo、私网跳转和非 HTTPS；允许精确 Mikan 与图片白名单。
4. Pattern 验证测试：必填字段、ID 覆盖、非法/危险正则、数值边界。
5. 数据库测试：自动创建目录、CRUD、覆盖导入保留 schema、失败整体回滚、删除不存在记录。
6. 路由集成测试：export 需要认证、PUT 只更新路径 ID、非 2xx 错误结构、health 状态。
7. RSS 转换测试：标题输出不变、正则只预编译、聚合统计更新。
8. 前端可测试纯函数和静态安全检查：HTML 不再包含内联事件；Service Worker 不缓存 API；API helper 对非 2xx 抛错。
9. 启动烟测：临时数据目录和随机端口启动，完成登录、CRUD、导出和退出。

`npm test` 运行完整测试；`npm run check` 依次执行所有 JavaScript 语法检查和测试。CI 只有在 `check` 成功后才能构建或部署。

## 依赖、容器与 CI

- 提高直接依赖最低安全版本并刷新 lockfile；至少包含 Axios 1.18.1 与 http-proxy-middleware 3.0.7。
- 增加 OIDC 客户端和安全正则所需的最小依赖；不增加测试框架。
- 增加 Dependabot 每周 npm 与 GitHub Actions 更新。
- Docker 使用 Node 22 的固定 patch 或 digest、`npm ci --omit=dev`、非 root `node` 用户、直接执行 `node server/index.js`，并加入健康检查。
- 增加 `.dockerignore`，排除 Git、环境文件、数据库、JWT 密钥、日志和本地 worktree。
- Compose 默认使用现有 GHCR 镜像、根目录 `.env`、可配置绑定地址、健康检查和持久化 `/app/data`。
- GitHub 工作流不再忽略 `.github/**`，先执行测试 job，再构建多架构镜像。
- GitLab 修正“源码和文档混合提交跳过全部流水线”的规则，部署前运行相同检查，并等待健康状态；移除 `StrictHostKeyChecking=no`。

## 文档与兼容性

- README、Quickstart、Troubleshooting、Upgrade Notes 和 `.env.example` 使用同一组环境变量、镜像、卷路径和命令。
- 明确记录 OIDC 从显式 auth/token URL 迁移到 issuer discovery 的不兼容变更。
- 删除未实现的 PUID/PGID、错误 Node 版本、不存在的备份文件和“尚不支持批量导入”等过期描述。
- 增加安全部署说明：推荐 HTTPS 反向代理、默认只绑定 loopback、密钥轮换和备份 SQLite。
- 增加实际 ISC `LICENSE` 文件，并同步 `package.json` 的 license、engines 和 packageManager。

## 实施顺序

1. 建立测试入口和可隔离启动方式。
2. 修复配置、会话、认证和 OIDC。
3. 修复 Pattern 验证、数据库事务和路由顺序。
4. 修复代理、日志、RSS 和 TMDB。
5. 修复前端安全、正确性、性能与 Service Worker。
6. 更新依赖、容器、CI 和文档。
7. 运行完整测试、隔离烟测、依赖扫描和最终代码审阅。

每一步都必须保持可运行并有对应回归测试；不把无关重构混入安全修复。
