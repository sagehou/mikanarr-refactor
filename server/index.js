require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./database');
const authRoutes = require('./routes/auth');
const patternRoutes = require('./routes/patterns');
const proxyRoutes = require('./routes/proxy');
const sonarrRoutes = require('./routes/sonarr');
const rssRoutes = require('./routes/rss');
const tmdbRoutes = require('./routes/tmdb');
const imageProxyRoutes = require('./routes/imageProxy');
const { verifyToken } = require('./routes/auth');

const app = express();
const PORT = parseInt(process.env.PORT || '12306');

app.use(cors());

// 设置Permissions-Policy头
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', '');
  next();
});

// 1. 代理路由 (不使用 body-parser，避免流被消费)
app.use('/sonarr', sonarrRoutes);
app.use('/proxy', proxyRoutes);
app.use('/api/image-proxy', imageProxyRoutes);

// 2. 全局 Body Parser (用于后续 API)
app.use(express.json());

// 3. 静态文件
app.use(express.static(path.join(__dirname, '../public')));

// 4. API 路由
// Config API
app.get('/api/config', verifyToken, (req, res) => {
  res.json({
    sonarrHost: process.env.SONARR_PUBLIC_URL || process.env.SONARR_HOST || ''
  });
});

app.use('/auth', authRoutes);
app.use('/api/patterns', patternRoutes);
app.use('/RSS', rssRoutes);
app.use('/tmdb', tmdbRoutes);

// 5. Catch-all (SPA 支持)
app.use((req, res, next) => {
  // 不拦截 API 请求，如果上面的路由没匹配到，交给 Error Handler 或默认 404
  if (req.path.startsWith('/api') || req.path.startsWith('/sonarr') ||
      req.path.startsWith('/proxy') || req.path.startsWith('/RSS') ||
      req.path.startsWith('/tmdb') || req.path.startsWith('/auth')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 6. 全局错误处理
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  if (!res.headersSent) {
    res.status(err.status || 500).json({
      error: err.message || 'Internal server error'
    });
  }
});

async function start() {
  try {
    initDb();
    app.listen(PORT, () => {
      console.log(`Mikanarr started on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

start();
