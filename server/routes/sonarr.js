const express = require('express');
const { verifyToken } = require('./auth');
const { createProxyMiddleware } = require('http-proxy-middleware');

const router = express.Router();
router.use(verifyToken);

const SONARR_API_KEY = process.env.SONARR_API_KEY;
const SONARR_HOST = process.env.SONARR_HOST;

if (!SONARR_API_KEY || !SONARR_HOST) {
  console.error('[Sonarr Proxy] Missing configuration');
}

router.use('/', createProxyMiddleware({
  target: SONARR_HOST,
  changeOrigin: true,
  pathRewrite(path, req) {
    // Remove /sonarr prefix and append apikey
    const url = new URL(req.url, `https://${req.headers.host}`);
    url.searchParams.append('apikey', SONARR_API_KEY);
    const rewrittenPath = path.replace(/^\/sonarr/, '/api/v3');
    return `${rewrittenPath}${url.search}`;
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`[Sonarr Proxy] ${req.method} ${req.originalUrl} -> ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`);
  },
  onError: (err, req, res) => {
    console.error('[Sonarr Proxy] Error:', err.message);
    res.status(500).json({ error: err.message || 'Proxy error' });
  }
}));

module.exports = router;
