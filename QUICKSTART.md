# Mikanarr Refactor - 快速开始指南

## 🚀 30秒快速部署

### Docker 方式（推荐）

```bash
# 1. 克隆仓库
git clone https://gitlab.tyo-arm.755022.xyz/sage/mikanarr-refactor.git
cd mikanarr-refactor

# 2. 创建数据目录和配置
mkdir -p data

# 3. 配置环境变量
cat > data/.env << 'EOF'
# 修改这些值
SONARR_API_KEY=your_sonarr_api_key
SONARR_HOST=https://sonarr.yourdomain.com
TMDB_API_KEY=your_tmdb_api_key          # 可选，但推荐
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
EOF

# 4. 启动服务
docker-compose up -d

# 5. 访问
# 打开浏览器访问: http://localhost:12306
```

## 📝 获取所需密钥

### Sonarr API Key

1. 登录你的 Sonarr
2. 进入 Settings → General → Security
3. 找到 API Key，点击复制
4. 粘贴到 `data/.env` 的 `SONARR_API_KEY`

### TMDB API Key（可选，推荐）

1. 访问 https://www.themoviedb.org/settings/api
2. 登录或注册账号
3. 点击 "Request an API key"
4. 选择 "Developer"
5. 填写基本信息，提交申请
6. 复制 API Key 到 `data/.env` 的 `TMDB_API_KEY`

## 🎯 使用流程

### 第一步：登录

访问 http://localhost:12306，使用 `.env` 中配置的用户名和密码登录。

### 第二步：创建 Pattern

1. 访问 https://mikanani.me
2. 登录并找到你想订阅的动画
3. 点击 "Subscribe" 按钮
4. 复制弹出的 RSS 链接

5. 回到 Mikanarr，点击 "新建"
6. 粘贴 RSS 链接到 "Remote RSS URL" 字段
7. 等待右侧加载 RSS 预览

8. 点击预览中的任意条目，自动填充 Pattern
9. 调整 Pattern（可选）：
   - 点击 "Escape" 转义特殊字符
   - 点击 "Episode" 复制剧集正则组

### 第三步：关联 Sonarr

1. 从 "系列" 下拉框选择对应的动画
   - 列表会自动从 Sonarr 同步
2. 如果没有找到，先在 Sonarr 中添加该动画
3. 从 "季度" 下拉框选择季度号
   - 绿色表示正在监控
   - 红色表示未监控

### 第四步：查看中文信息（如果配置了 TMDB）

选择 Series 后，会自动显示：
- 中文标题
- 剧集海报
- 剧集简介

### 第五步：配置其他参数

- **语言**: 默认 Chinese
- **质量**: 默认 WEBDL 1080p
- **偏移**: 如果剧集编号不一致，设置偏移量
- **字幕组**: 自动从 Pattern 提取

### 第六步：保存

点击 "保存" 按钮完成创建。

## 🔗 添加到 Sonarr

1. 复制 "Proxy URL"（编辑页面会自动生成）
2. 在 Sonarr 中：
   - 进入 Settings → Indexers → Add
   - 选择 "Torznab" 或 "Newznab"
   - 粘贴 Proxy URL
   - 保存并测试

## 📊 Pattern 示例

### 完整示例

```
Remote: https://mikanani.me/RSS/Bangumi?bangumiId=3700&subgroupid=730

Pattern: \[Lilith-Raws\] 转生为第七王子 - (?<episode>\d+) \[Baha\]\[WEB-DL\]\[1080p\]\[AVC AAC\]\[CHT\]\[MP4\]

Series: 转生为第七王子，随心所欲的魔法学习之路
Season: 01
Language: Chinese
Quality: WEBDL 1080p
Offset: 0
ReleaseGroup: Lilith-Raws
```

### 简化示例

```
Pattern: \[.*\] (.+) - (?<episode>\d+) .*
```

## 🔧 常见问题

### Q: 如何获取 Sonarr 中的 Series？

A: 
1. 确保 `.env` 中的 `SONARR_API_KEY` 和 `SONARR_HOST` 正确
2. 确保 Mikanarr 可以访问 Sonarr（网络可达）
3. 刷新页面重试

### Q: TMDB 信息不显示？

A:
1. 检查 `.env` 中是否配置了 `TMDB_API_KEY`
2. 确保 Sonarr 中的 Series 有 `tvdbId`
3. 刷新页面重试

### Q: RSS 预览加载失败？

A:
1. 确认 Mikan URL 格式正确
2. 检查 Mikan 网站是否可访问
3. 检查 Token 是否有效

### Q: Pattern 匹配不到剧集？

A:
1. 检查 Pattern 是否包含 `(?<episode>\\d+)`
2. 使用右侧预览功能测试匹配
3. 点击 "Escape" 转义特殊字符

### Q: 如何批量导入 Patterns？

A:
目前不支持批量导入，需要手动创建。
如需此功能，可以提交 Issue 或 PR。

## 📱 移动端使用

Mikanarr 支持移动端浏览器访问：
- 响应式设计自动适配
- 触摸友好的交互
- 所有功能与桌面端一致

## 🔄 更新

```bash
# 拉取最新代码
git pull

# 重新构建镜像
docker-compose build

# 重启服务
docker-compose up -d
```

## 📚 更多文档

- [完整文档](README.md)
- [项目总结](PROJECT_SUMMARY.md)
- [原项目](https://gitlab.tyo-arm.755022.xyz/sage/mikanarr)

## 💡 最佳实践

1. **使用 TMDB**: 获取 API Key，享受中文剧集信息
2. **测试 Pattern**: 创建前先在右侧预览中测试匹配
3. **命名规范**: Series 名称与 Sonarr 保持一致
4. **定期检查**: 检查 Pattern 是否仍然匹配新的种子
5. **备份配置**: 定期备份 `data/database.sqlite` 文件

## 🆘 获取帮助

遇到问题？
- 查看日志: `docker-compose logs -f`
- 检查配置: 确认 `.env` 文件正确
- 查看文档: 阅读 [README.md](README.md)
- 提交 Issue: https://gitlab.tyo-arm.755022.xyz/sage/mikanarr-refactor/-/issues

---

祝你使用愉快！🎉
