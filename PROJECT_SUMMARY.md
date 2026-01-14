# Mikanarr Refactor - 项目总结

## 完成情况

✅ **已完成完全重构**，使用最简单的技术栈实现所有功能。

## 技术栈

### 后端
- **Node.js** + **Express**: 简单易用的 JavaScript 运行时和 Web 框架
- **SQLite** (better-sqlite3): 零配置的轻量级数据库
- **JWT** (RS512): 安全的用户认证

### 前端
- **原生 HTML/JavaScript**: 无需构建工具
- **Bootstrap 5**: 美观的响应式 UI 组件库
- **Bootstrap Icons**: 丰富的图标库

## 实现的功能

### 1. 用户认证 ✅
- JWT RS512 算法认证
- 登录/退出功能
- Token 自动管理

### 2. Pattern 管理 ✅
- 创建、读取、更新、删除 (CRUD)
- 实时 RSS 预览
- Pattern 匹配高亮显示
- 正则表达式 Escape 工具

### 3. Sonarr 集成 ✅
- API 代理（无需前端保存 API Key）
- 自动获取 Series 列表
- 自动获取 Season 信息（显示监控状态）

### 4. RSS 转换 ✅
- Mikan RSS → Sonarr 兼容格式
- Pattern 匹配和标题转换
- 支持剧集偏移 (Offset)
- 支持字幕组 (Release Group)

### 5. TMDB 集成 ✅ (新增)
- 获取剧集中文信息
- 显示剧集海报
- 显示剧集简介
- 自动关联 Sonarr 中的 tvdbId

### 6. 界面美化 ✅
- Bootstrap 5 响应式设计
- 渐变色登录页
- 卡片式布局
- 表格排序和搜索
- 加载动画
- 错误提示

## 项目结构

```
mikanarr-refactor/
├── .gitlab-ci.yml          # CI/CD 配置（保留）
├── docker-compose.yml        # Docker Compose 配置
├── Dockerfile              # Docker 镜像构建
├── package.json            # 依赖配置
├── README.md              # 使用说明
├── .env.example           # 环境变量示例
├── .gitignore            # Git 忽略配置
├── server/               # 后端代码
│   ├── index.js         # 主入口
│   ├── database.js      # 数据库操作
│   └── routes/         # 路由
│       ├── auth.js     # 认证
│       ├── patterns.js  # Pattern 管理
│       ├── proxy.js    # Mikan 代理
│       ├── sonarr.js   # Sonarr 代理
│       ├── rss.js      # RSS 转换
│       └── tmdb.js     # TMDB 集成
└── public/               # 前端代码
    ├── index.html      # 主页面
    ├── css/
    │   └── style.css  # 样式
    └── js/
        └── app.js      # 应用逻辑
```

## 核心特性

1. **零依赖构建**: 前端无需 Webpack/Vite，直接部署
2. **轻量级**: 整个应用依赖包仅 ~20MB
3. **易于部署**: Docker 一键部署
4. **响应式**: 支持桌面和移动端
5. **安全性**: JWT RS512 + CORS 保护

## 环境变量

```env
SONARR_API_KEY=your_sonarr_api_key
SONARR_HOST=https://sonarr.yourdomain.com
TMDB_API_KEY=your_tmdb_api_key          # 可选
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_password
PORT=12306
```

## 使用示例

### 创建 Pattern

1. 访问 Mikan Anime，复制 RSS URL
2. 在 Mikanarr 点击"新建"
3. 粘贴 URL，自动加载预览
4. 选择预览项，自动填充 Pattern
5. 从下拉框选择 Series（自动从 Sonarr 同步）
6. 选择 Season
7. 查看中文剧集信息（如果配置了 TMDB）
8. 设置语言、质量等参数
9. 保存

### 使用 RSS

```
原: https://mikanani.me/RSS/MyBangumi?token=xxx
新: https://mikanarr.yourdomain.com/RSS/MyBangumi?token=xxx
```

## 部署

### Docker Compose（推荐）

```bash
# 1. 配置环境变量
mkdir -p data
cat > data/.env << EOF
SONARR_API_KEY=xxx
SONARR_HOST=https://xxx
TMDB_API_KEY=xxx
ADMIN_USERNAME=admin
ADMIN_PASSWORD=xxx
EOF

# 2. 启动
docker-compose up -d
```

### Docker

```bash
docker build -t mikanarr .
docker run -v ./data:/data -p 12306:12306 mikanarr
```

### 本地运行

```bash
npm install
npm start
```

## CI/CD

保留原有 `.gitlab-ci.yml`，支持：
- 自动构建 Docker 镜像
- ARM64 架构支持
- 自动部署到服务器

## 与原版对比

| 特性 | 原版 | 重构版 |
|------|------|--------|
| 后端框架 | Express | Express |
| 前端框架 | React | 原生 JS |
| UI 库 | Material-UI | Bootstrap 5 |
| 数据库 | LowDB (JSON) | SQLite |
| 构建 | 需要 Webpack | 无需构建 |
| TMDB 集成 | ❌ | ✅ |
| 包大小 | ~50MB | ~20MB |
| 代码行数 | ~2500 行 | ~1700 行 |

## 未来改进

- [ ] 添加 Pattern 模板功能
- [ ] 支持多语言切换
- [ ] 添加批量导入/导出
- [ ] 添加使用统计
- [ ] 支持 Radarr (电影)
- [ ] 添加通知功能

## 许可证

ISC

## 原项目

https://gitlab.tyo-arm.755022.xyz/sage/mikanarr
