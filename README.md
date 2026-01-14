# Mikanarr Refactor

Mikanarr - Mikan Anime to Sonarr Bridge (重构版)

## 功能特性

- ✅ 用户认证（JWT）
- ✅ Pattern 管理（增删改查）
- ✅ URL 判断和匹配（正则表达式）
- ✅ Sonarr API 代理
- ✅ RSS 转换（Mikan → Sonarr）
- ✅ TMDB 中文剧集信息同步
- ✅ 美观的响应式界面
- ✅ 实时 RSS 预览

## 技术栈

- **后端**: Node.js + Express
- **数据库**: SQLite (better-sqlite3)
- **前端**: 原生 HTML/JS + Bootstrap 5
- **认证**: JWT (RS512)

## 快速开始

### Docker 部署（推荐）

```bash
# 1. 创建数据目录
mkdir -p data

# 2. 创建 .env 文件
cat > data/.env << EOF
SONARR_API_KEY=your_sonarr_api_key
SONARR_HOST=https://sonarr.yourdomain.com
TMDB_API_KEY=your_tmdb_api_key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_password
EOF

# 3. 使用 Docker Compose
docker-compose up -d
```

### 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填写配置

# 3. 初始化数据库
mkdir -p data

# 4. 启动服务
npm run dev
```

访问 http://localhost:12306

## 配置说明

### 环境变量

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `SONARR_API_KEY` | Sonarr API Key | 是 |
| `SONARR_HOST` | Sonarr 地址 | 是 |
| `TMDB_API_KEY` | TMDB API Key（用于中文剧集信息） | 否 |
| `ADMIN_USERNAME` | 管理员用户名 | 是 |
| `ADMIN_PASSWORD` | 管理员密码 | 是 |
| `PORT` | 服务端口，默认 12306 | 否 |

### Sonarr 配置

1. 登录 Sonarr，获取 API Key
2. 在 Mikanarr 中填写 SONARR_API_KEY 和 SONARR_HOST
3. 创建 Pattern 时，Series 会自动从 Sonarr 同步

### TMDB 配置（可选）

1. 访问 https://www.themoviedb.org/settings/api 申请 API Key
2. 在 .env 中填写 TMDB_API_KEY
3. 启用后，选择 Series 时会显示中文剧集信息

## 使用说明

### 创建 Pattern

1. 访问 Mikan Anime，复制需要订阅的 RSS URL
2. 在 Mikanarr 中点击"新建"
3. 粘贴 RSS URL 到 Remote 字段
4. 在右侧预览中选择一个条目，自动填充 Pattern
5. 手动调整 Pattern，使用 `(?<episode>\\d+)` 标记剧集号
6. 从下拉框选择 Series 和 Season
7. 设置 Language、Quality、Offset 等参数
8. 点击"保存"

### 使用 RSS

将 Mikan 的 RSS URL 中的域名替换为 Mikanarr 的地址：

```
原: https://mikanani.me/RSS/MyBangumi?token=xxx
新: https://mikanarr.yourdomain.com/RSS/MyBangumi?token=xxx
```

将新 URL 添加到 Sonarr 的 RSS Feed 中即可。

### Pattern 示例

```
Remote: https://mikanani.me/RSS/MyBangumi?token=xxx

Pattern: \[Lilith-Raws\] (.+) - (?<episode>\d+) \[Baha\]\[WEB-DL\]\[1080p\]\[AVC AAC\]\[CHT\]\[MP4\]

Series: 转生为第七王子，随心所欲的魔法学习之路
Season: 01
Language: Chinese
Quality: WEBDL 1080p
Offset: 0
ReleaseGroup: Lilith-Raws
```

## API 端点

### 认证

- `POST /auth/login` - 用户登录

### Patterns

- `GET /api/patterns` - 获取所有 patterns
- `POST /api/patterns` - 创建 pattern
- `GET /api/patterns/:id` - 获取单个 pattern
- `PUT /api/patterns/:id` - 更新 pattern
- `DELETE /api/patterns/:id` - 删除 pattern

### Sonarr 代理

- `ALL /sonarr/*` - Sonarr API 代理（需认证）

### RSS 转换

- `GET /RSS/*` - RSS 转换端点（Sonarr 使用）

### TMDB 集成

- `GET /tmdb/tv/:id` - 获取剧集信息
- `GET /tmdb/search` - 搜索剧集

## Docker Compose 示例

```yaml
version: '3.8'

services:
  mikanarr:
    image: gitlab.tyo-arm.755022.xyz:5050/sage/mikanarr-refactor:arm64-latest
    container_name: mikanarr
    restart: unless-stopped
    ports:
      - "12306:12306"
    volumes:
      - ./data:/app/data
    environment:
      - PORT=12306
      - TZ=Asia/Shanghai
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

## 故障排除

### 无法加载 Series

- 检查 SONARR_API_KEY 和 SONARR_HOST 是否正确
- 确保 Sonarr 可以从 Mikanarr 所在服务器访问

### TMDB 信息不显示

- 检查 TMDB_API_KEY 是否配置
- 确认 Sonarr 中的 Series 有 tvdbId

### RSS 预览失败

- 确保 Mikan URL 可以访问
- 检查 URL 格式是否正确

## 许可证

ISC

## 原项目

https://gitlab.tyo-arm.755022.xyz/sage/mikanarr
