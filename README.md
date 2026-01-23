# Mikanarr Refactor

Mikanarr - Mikan Anime to Sonarr Bridge (重构版)

## 功能特性

- ✅ **RSS 转换**：将 Mikan RSS 转换为 Sonarr 可识别的标准格式，支持自定义正则表达式匹配剧集
- ✅ **智能管理**：
  - 自动同步 Sonarr 剧集列表
  - TMDB 中文剧集信息自动匹配（支持英文/中文双语搜索）
  - 自动检测并修复大小写不一致的系列名
- ✅ **便捷操作**：
  - **一键添加剧集**：直接从 RSS 搜索并添加新剧集到 Sonarr，自动配置根目录和质量
  - **智能导入**：粘贴 Mikan URL 自动解析参数并匹配剧集
  - **批量管理**：支持批量删除、批量修复系列名
  - **实时预览**：编辑正则时实时高亮匹配结果，所见即所得
- ✅ **现代化界面**：
  - 美拉德 (Maillard) 配色风格，深色模式支持
  - **PWA 支持**：可安装到桌面/手机主屏幕，提供原生 App 般的沉浸式体验
  - **响应式卡片视图**：
    - 极度紧凑的网格布局，大屏展示更多内容
    - 显示 TMDB/Sonarr 高清海报
    - 集成 Sonarr 下载进度条和缺失集数显示
    - 支持移动端滑动操作（左滑删除，右滑编辑）
- ✅ **安全可靠**：
  - JWT 用户认证
  - 图片代理服务（解决混合内容和访问受限问题）
  - 支持 Traefik 等反向代理集成

## 快速开始

### Docker Compose 部署（推荐）

```yaml
version: '3.8'

services:
  mikanarr:
    container_name: mikanarr
    image: ghcr.io/sagehou/mikanarr-refactor:latest  # 多平台镜像，自动适配 amd64/arm64
    volumes:
      - ./data:/app/data
    env_file: .env
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Asia/Shanghai
    restart: unless-stopped
    ports:
      - "12306:12306"
    # 如果使用 Traefik，请参考下面的 labels 配置
    # networks:
    #   - traefik
```

### 环境变量 (.env)

| 变量名 | 说明 | 必填 | 示例 |
|--------|------|------|------|
| `SONARR_API_KEY` | Sonarr API Key | 是 | `your_sonarr_api_key` |
| `SONARR_HOST` | Sonarr 内部访问地址 (后端代理使用) | 是 | `http://sonarr:8989` 或 `http://192.168.1.100:8989` |
| `SONARR_PUBLIC_URL`| Sonarr 外部访问地址 (前端跳转使用) | 否 | `https://sonarr.yourdomain.com` (不填则回退到 HOST) |
| `TMDB_API_KEY` | TMDB API Key（用于中文信息和图片） | 否 | `your_tmdb_api_key` |
| `ADMIN_USERNAME` | 管理员用户名 | 是 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | 是 | `your_secure_password` |
| `PORT` | 服务端口 | 否 | `12306` |

### OIDC SSO 配置（可选）

| 变量名 | 说明 |
|--------|------|
| `OIDC_CLIENT_ID` | OAuth2 Client ID |
| `OIDC_CLIENT_SECRET` | OAuth2 Client Secret |
| `OIDC_AUTH_URL` | 认证地址 (e.g. `https://auth.example.com/application/o/authorize/`) |
| `OIDC_TOKEN_URL` | Token 地址 (e.g. `https://auth.example.com/application/o/token/`) |
| `OIDC_REDIRECT_URI` | 回调地址 (e.g. `https://mikanarr.example.com/auth/oidc/callback`) |
| `OIDC_AUTO_LOGIN` | 设为 `true` 则自动跳转 SSO，隐藏登录表单 |

### 高级部署 (Traefik 示例)

```yaml
services:
  mikanarr:
    # ... image & volumes ...
    labels:
      - 'traefik.enable=true'
      - 'traefik.http.routers.mikanarr.rule=Host(`mikanarr.example.com`)'
      - 'traefik.http.routers.mikanarr.entrypoints=websecure'
      - 'traefik.http.routers.mikanarr.tls.certresolver=myresolver'
      - 'traefik.http.services.mikanarr.loadbalancer.server.port=12306'
      # 可选：集成 Authentik 或其他外部鉴权
      # - 'traefik.http.routers.mikanarr.middlewares=authentik@file'
    networks:
      - traefik
```

## 使用指南

### 1. 添加新订阅

1.  复制 Mikan 上的 RSS 链接或番剧详情页链接。
2.  在 Mikanarr 首页点击「新建」或粘贴链接到导入框点击「解析」。
3.  系统会自动解析链接，并尝试在 Sonarr 中匹配对应剧集。
4.  **如果 Sonarr 中已有剧集**：系统会自动选中。
5.  **如果 Sonarr 中没有剧集**：
    -   点击系列输入框旁的绿色 `+` 按钮。
    -   确认搜索词，点击搜索。
    -   选择正确的剧集，配置根目录和质量，点击「添加」。
    -   添加成功后，系统会自动选中该剧集。
6.  调整正则表达式（Pattern），确保能匹配到正确的集数（预览区会显示匹配结果）。
7.  点击「保存」。

### 2. 在 Sonarr 中使用

将 Mikan 的 RSS URL 替换为 Mikanarr 生成的代理 URL：

```
原: https://mikanani.me/RSS/Bangumi?bangumiId=xxxx&subgroupid=yyy
新: https://mikanarr.yourdomain.com/RSS/Bangumi?bangumiId=xxxx&subgroupid=yyy
```

在 Sonarr 的 `Settings` -> `Indexers` -> `RSS` 中添加此 URL。

## 常见问题

### 图片加载失败？
Mikanarr 内置了图片代理服务。如果 Sonarr 或 TMDB 的图片无法直接加载（例如被墙），系统会自动通过后端代理加载图片。请确保服务器端能访问 `artworks.thetvdb.com` 和 `image.tmdb.org`。

### 添加剧集时提示超时？
这通常是因为网络原因导致 Sonarr 响应慢。我们优化了代理逻辑，支持大体积请求体转发。如果依然失败，请检查 Sonarr 日志。

### 为什么需要 TMDB API Key？
虽然不是必须的，但配置 TMDB API Key 可以让界面显示剧集的中文名称和海报，极大地提升使用体验。

## 许可证

ISC
