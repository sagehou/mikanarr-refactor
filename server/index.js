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
const { verifyToken } = require('./routes/auth');

const app = express();
const PORT = parseInt(process.env.PORT || '12306');

app.use(cors());
app.use(express.json());

// 设置Permissions-Policy头，移除不支持的特性
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', '');
  next();
});

app.use(express.static(path.join(__dirname, '../public')));

// Config API - expose Sonarr host for frontend
app.get('/api/config', verifyToken, (req, res) => {
  // Return public URL for frontend links, fallback to internal host
  res.json({
    sonarrHost: process.env.SONARR_PUBLIC_URL || process.env.SONARR_HOST || ''
  });
});

app.use('/auth', authRoutes);
app.use('/api/patterns', patternRoutes);
app.use('/proxy', proxyRoutes);
app.use('/sonarr', sonarrRoutes);
app.use('/RSS', rssRoutes);
app.use('/tmdb', tmdbRoutes);

// Catch-all for static files and SPA routing (only for non-API requests)
app.get('*', (req, res, next) => {
  // Don't interfere with API requests
  if (req.path.startsWith('/api') || req.path.startsWith('/sonarr') ||
      req.path.startsWith('/proxy') || req.path.startsWith('/RSS') ||
      req.path.startsWith('/tmdb') || req.path.startsWith('/auth')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
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
