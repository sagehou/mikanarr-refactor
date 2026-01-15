const express = require('express');
const { verifyToken } = require('./auth');
const { createProxyMiddleware } = require('http-proxy-middleware');

const router = express.Router();
router.use(verifyToken);

const SONARR_API_KEY = process.env.SONARR_API_KEY;
const SONARR_HOST = process.env.SONARR_HOST;

if (!SONARR_API_KEY || !SONARR_HOST) {
  console.error('[Sonarr Proxy] Missing configuration');
  router.use((req, res) => {
    res.status(503).json({ error: 'Sonarr proxy not configured' });
  });
} else {
  router.use('/', createProxyMiddleware({
    target: SONARR_HOST,
    changeOrigin: true,
    pathRewrite(path, req) {
      // req.url in express router does not include the mount point (/sonarr)
      // path argument might be the same as req.url
      
      // Ensure we construct the target path correctly
      // We expect input like /api/v3/series (after stripping /sonarr)
      // And we want to append apikey
      
      const searchParams = new URLSearchParams(new URL(req.originalUrl, 'http://localhost').search);
      searchParams.append('apikey', SONARR_API_KEY);
      
      // path here is likely /api/v3/series
      // remove any query string from path first as we will append it back
      const pathBase = path.split('?')[0];
      
      return `${pathBase}?${searchParams.toString()}`;
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log(`[Sonarr Proxy] ${req.method} ${req.originalUrl} -> ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`);
    },
    onError: (err, req, res) => {
      console.error('[Sonarr Proxy] Error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || 'Proxy error' });
      }
    }
  }));
}

module.exports = router;
