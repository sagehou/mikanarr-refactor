# Mikanarr 故障排除指南

## 常见问题

### 1. Sonarr 查询没有反应

#### 现象
- 系列下拉框为空
- 选择系列时没有反应
- 控制台显示错误

#### 可能原因
1. **环境变量未设置或错误**
   - 检查 `.env` 文件是否存在
   - 确认 `SONARR_API_KEY` 和 `SONARR_HOST` 是否正确

2. **Sonarr 不可访问**
   - 检查 Mikanarr 所在服务器能否访问 Sonarr
   - 使用 `curl` 或浏览器测试：
     ```bash
     curl -H "X-Api-Key: YOUR_KEY" https://your-sonarr.com/api/v3/series
     ```

3. **API Key 错误**
   - 确认 API Key 没有多余空格
   - 重新从 Sonarr 设置页面获取

4. **Sonarr 版本问题**
   - 确认 Sonarr 版本为 v3.x
   - 旧版本 API 路径不同

#### 解决方法

**步骤 1: 检查环境变量**
```bash
# 查看当前环境变量
cat data/.env

# 应该包含：
SONARR_API_KEY=your_actual_api_key
SONARR_HOST=https://your-sonarr-domain.com
```

**步骤 2: 测试 Sonarr 连接**
```bash
# 在服务器上运行
curl -H "X-Api-Key: YOUR_API_KEY" https://your-sonarr.com/api/v3/series

# 如果返回 JSON 数据，说明 Sonarr 可访问
# 如果返回错误，检查网络和认证
```

**步骤 3: 查看服务器日志**
```bash
# Docker 环境
docker-compose logs -f mikanarr

# 看到类似日志说明请求已发送：
# [Sonarr Proxy] Request: GET /api/v3/series
# [Sonarr Proxy] Forwarding to: https://xxx/api/v3/series
```

**步骤 4: 浏览器控制台**
- 打开开发者工具 (F12)
- 切换到 Console 标签
- 刷新页面
- 查看是否有错误信息

---

### 2. Proxy URL 不正确

#### 现象
- 生成的 Proxy URL 格式错误
- Sonarr 无法识别 RSS
- 点击复制后 URL 不对

#### 正确格式
```
正确: https://mikanarr.yourdomain.com/RSS/MyBangumi?token=xxx
错误: https://mikanarr.yourdomain.com/RSS?token=xxx
```

#### 解决方法

**步骤 1: 检查 Remote URL**
- Remote URL 必须来自 https://mikanani.me
- 必须包含完整的路径和 token

示例：
```
https://mikanani.me/RSS/MyBangumi?token=xxx
https://mikanani.me/RSS/Bangumi?bangumiId=1234&subgroupid=5678
```

**步骤 2: 检查 Proxy URL 生成**
编辑 Pattern 时，Proxy URL 会自动生成：
- 替换域名: `mikanani.me` → `mikanarr.yourdomain.com`
- 保留所有路径和参数

**步骤 3: 验证 Proxy URL**
在浏览器中打开生成的 Proxy URL：
- 应该返回 XML 格式的 RSS 数据
- 标题应为转换后的 Sonarr 格式

---

### 3. RSS 预览加载失败

#### 现象
- 右侧预览区域显示"加载失败"
- 显示错误信息

#### 解决方法

**步骤 1: 检查 URL 格式**
```
✓ 正确: https://mikanani.me/RSS/MyBangumi?token=xxx
✗ 错误: http://mikanani.me/RSS/MyBangumi?token=xxx  (必须是 https)
✗ 错误: mikanani.me/RSS/MyBangumi?token=xxx      (必须有协议)
```

**步骤 2: 检查 Token**
- Token 必须有效且未过期
- 登录 Mikan 账号重新获取 Token

**步骤 3: 检查网络连接**
```bash
# 测试 Mikan 可访问性
curl -I https://mikanani.me

# 应该返回 200 OK
```

**步骤 4: 查看详细错误**
页面会显示详细错误原因：
- "URL 格式错误" → 检查 URL 结构
- "Token 无效" → 重新登录 Mikan 获取新 Token
- "网络错误" → 检查防火墙和网络
- "无数据" → RSS Feed 可能为空

---

### 4. TMDB 信息不显示

#### 现象
- 选择 Series 后不显示中文信息
- 海报和简介为空

#### 解决方法

**步骤 1: 检查 TMDB API Key**
```bash
# 检查 .env 中是否有 TMDB_API_KEY
cat data/.env | grep TMDB
```

如果没有，按以下步骤获取：
1. 访问 https://www.themoviedb.org/settings/api
2. 登录或注册账号
3. 申请 API Key
4. 复制到 `.env`

**步骤 2: 检查 Sonarr 中的 tvdbId**
- TMDB 需要 tvdbId 来查询
- 在 Sonarr 中编辑 Series
- 确认 "TVDB ID" 字段有值

**步骤 3: 测试 TMDB API**
```bash
# 替换 YOUR_KEY 和 SERIES_ID
curl "https://api.themoviedb.org/3/tv/SERIES_ID?api_key=YOUR_KEY&language=zh-CN"

# 应该返回 JSON 数据
```

---

### 5. Pattern 匹配不到剧集

#### 现象
- RSS 预览中没有高亮的条目
- Pattern 无法匹配种子标题

#### 解决方法

**步骤 1: 检查 Pattern 语法**
- 必须包含命名捕获组: `(?<episode>\\d+)`
- 特殊字符需要转义

**步骤 2: 使用 ESCAPE 按钮**
- 粘贴种子标题
- 点击 "Escape" 按钮转义特殊字符
- 手动替换集数为 `(?<episode>\\d+)`

**步骤 3: 测试 Pattern**
在右侧预览中：
- 查看哪些条目被高亮（蓝色）
- 蓝色表示匹配，灰色表示不匹配
- 调整 Pattern 直到正确匹配

**步骤 4: 常见错误**
```
✗ 错误: \[Lilith-Raws\] Test - 03
✓ 正确: \[Lilith-Raws\] Test - (?<episode>\d+)
```

---

### 6. 登录失败

#### 现象
- 输入正确用户名密码仍然登录失败
- 提示"用户名或密码错误"

#### 解决方法

**步骤 1: 检查环境变量**
```bash
# 查看 .env 中的管理员账号
cat data/.env | grep ADMIN
```

**步骤 2: 重启服务**
```bash
# 修改 .env 后需要重启
docker-compose restart mikanarr
```

**步骤 3: 清除浏览器缓存**
- 清除 localStorage
- 删除旧 token
- 重新登录

---

### 7. Docker 构建失败

#### 现象
- docker-compose build 失败
- 提示 "no such file or directory"

#### 解决方法

**步骤 1: 检查 Dockerfile**
```bash
# Dockerfile 应该很简单
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY public ./public
COPY server ./server
...
```

**步骤 2: 清理 Docker 缓存**
```bash
docker-compose build --no-cache
```

**步骤 3: 检查文件权限**
```bash
# 确保 Docker 有读取权限
ls -la .
```

---

## 调试技巧

### 查看服务器日志
```bash
# 实时查看日志
docker-compose logs -f mikanarr

# 查看最近 100 行
docker-compose logs --tail=100 mikanarr
```

### 浏览器开发者工具
1. 按 F12 打开开发者工具
2. 切换到 Console 标签
3. 查看错误信息
4. 切换到 Network 标签
5. 查看请求/响应

### 测试 API 端点
```bash
# 测试登录
curl -X POST http://localhost:12306/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 测试获取系列（需要 token）
curl http://localhost:12306/sonarr/api/v3/series \
  -H "Authorization: Bearer YOUR_TOKEN"

# 测试 RSS 转换
curl "http://localhost:12306/RSS/MyBangumi?token=xxx"
```

### 启用详细日志
修改 `server/index.js` 临时添加：
```javascript
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});
```

---

## 获取帮助

如果以上方法都无法解决问题：

1. **收集信息**
   - 错误截图
   - 服务器日志
   - 浏览器控制台信息
   - `.env` 配置（隐藏敏感信息）

2. **提交 Issue**
   https://gitlab.tyo-arm.755022.xyz/sage/mikanarr-refactor/-/issues

3. **提供详细信息**
   - Mikanarr 版本
   - Sonarr 版本
   - Docker/Node 版本
   - 操作系统
   - 具体错误信息

---

## 常用命令

```bash
# 重启服务
docker-compose restart mikanarr

# 查看日志
docker-compose logs -f mikanarr

# 进入容器
docker-compose exec mikanarr sh

# 备份数据库
docker cp mikanarr:/app/data/database.sqlite ./backup.sqlite

# 恢复数据库
docker cp ./backup.sqlite mikanarr:/app/data/database.sqlite

# 更新到最新版本
git pull
docker-compose build
docker-compose up -d
```

---

## 预防措施

1. **定期备份数据**
   - 备份 `data/database.sqlite`
   - 备份 `data/.env`

2. **监控日志**
   - 定期查看错误日志
   - 及时发现问题

3. **保持更新**
   - 定期拉取最新代码
   - 更新 Docker 镜像

4. **测试配置**
   - 修改配置后先测试
   - 避免生产环境问题

---

祝你使用愉快！如有问题请随时反馈。
