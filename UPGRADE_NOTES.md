# 依赖包升级记录

更新日期：2026-01-23

## 升级摘要

所有依赖包已成功升级到最新版本，应用程序测试通过。

## 升级的包

| 包名 | 旧版本 | 新版本 | 类型 |
|------|--------|--------|------|
| **axios** | 1.6.7 | 1.13.2 | 次要更新 |
| **better-sqlite3** | 9.4.3 | 12.6.2 | 主版本更新 |
| **cors** | 2.8.5 | 2.8.6 | 小版本更新 |
| **dotenv** | 16.4.1 | 17.2.3 | 主版本更新 |
| **express** | 4.18.2 | 5.2.1 | 主版本更新 |
| **jsonwebtoken** | 9.0.2 | 9.0.3 | 小版本更新 |

## 代码变更

### Express 5 兼容性修复

Express 5 对路由路径验证更加严格，不再支持 `*` 和 `/*` 作为通配符路径。

**修改文件：**

1. **server/routes/rss.js:25**
   - 变更前: `router.get('/*', async (req, res) => {`
   - 变更后: `router.use(async (req, res) => {`
   - 原因：Express 5 使用 middleware 模式处理 catch-all 路由

2. **server/index.js:51**
   - 变更前: `app.get('*', (req, res, next) => {`
   - 变更后: `app.use((req, res, next) => {`
   - 原因：SPA 支持路由改用 middleware 模式

## 测试结果

✅ 应用成功启动（端口 12306）  
✅ 无安全漏洞  
✅ 所有路由正常加载

## 注意事项

- **dotenv 17.x** 新增了扩展功能和更好的环境变量管理提示
- **Express 5.x** 包含多项重大变更：
  - 改进的路由匹配器
  - 原生 Promise 支持
  - 更严格的路径验证
- **better-sqlite3 12.x** 可能包含 SQLite 引擎更新和性能改进

## 备份文件

- `package.json.backup`
- `package-lock.json.backup`

如需回滚，运行：
```bash
cp package.json.backup package.json
cp package-lock.json.backup package-lock.json
npm install
```
