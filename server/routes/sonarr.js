const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

function createSonarrRouter({ config, verifyToken, logger = console }) {
  const router = express.Router();
  router.use(verifyToken);
  if (!config.sonarr.apiKey || !config.sonarr.host) {
    router.use((req, res) => res.status(503).json({ error: 'Sonarr proxy not configured' }));
    return router;
  }
  router.use('/', createProxyMiddleware({
    target: config.sonarr.host,
    changeOrigin: true,
    secure: false,
    pathRewrite(proxyPath, req) {
      const searchParams = new URLSearchParams(new URL(req.originalUrl, 'http://localhost').search);
      searchParams.append('apikey', config.sonarr.apiKey);
      return `${proxyPath.split('?')[0]}?${searchParams.toString()}`;
    },
    onProxyReq(proxyReq, req) {
      logger.log(`[Sonarr Proxy] ${req.method} ${req.originalUrl} -> ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`);
    },
    onError(error, req, res) {
      logger.error('[Sonarr Proxy] Error:', error.message);
      if (!res.headersSent) res.status(500).json({ error: error.message || 'Proxy error' });
    }
  }));
  return router;
}

module.exports = { createSonarrRouter };
