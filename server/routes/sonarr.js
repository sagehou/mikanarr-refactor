const express = require('express');

function createLazyProxyMiddleware(options) {
  let middlewarePromise;
  return async function lazyProxyMiddleware(req, res, next) {
    try {
      if (!middlewarePromise) {
        middlewarePromise = import('http-proxy-middleware')
          .then(({ createProxyMiddleware }) => createProxyMiddleware(options));
      }
      const middleware = await middlewarePromise;
      return middleware(req, res, next);
    } catch (error) {
      return next(error);
    }
  };
}

function createSonarrRouter({ config, verifyToken, logger = console, proxyMiddleware }) {
  const router = express.Router();
  router.use(verifyToken);
  if (!config.sonarr.apiKey || !config.sonarr.host) {
    router.use((req, res) => res.status(503).json({ error: 'Sonarr proxy not configured', code: 'SONARR_NOT_CONFIGURED' }));
    return router;
  }
  router.use((req, res, next) => {
    req.sonarrStartedAt = Date.now();
    next();
  });
  const proxyOptions = {
    target: config.sonarr.host,
    changeOrigin: true,
    secure: !config.sonarr.tlsInsecure,
    timeout: config.http.timeoutMs,
    proxyTimeout: config.http.timeoutMs,
    pathRewrite(proxyPath) {
      const url = new URL(proxyPath, 'http://localhost');
      for (const key of [...url.searchParams.keys()]) {
        if (['token', 'apikey'].includes(key.toLowerCase())) url.searchParams.delete(key);
      }
      return `${url.pathname}${url.search}`;
    },
    on: {
      proxyReq(proxyReq) {
        proxyReq.removeHeader('cookie');
        proxyReq.removeHeader('authorization');
        proxyReq.removeHeader('proxy-authorization');
        proxyReq.setHeader('X-Api-Key', config.sonarr.apiKey);
      },
      proxyRes(proxyRes, req, res) {
        delete proxyRes.headers['set-cookie'];
        proxyRes.once('aborted', () => res.destroy());
        const pathname = new URL(req.originalUrl, 'http://localhost').pathname;
        logger.log(`[Sonarr Proxy] method=${req.method} path=${pathname} status=${proxyRes.statusCode} duration_ms=${Date.now() - req.sonarrStartedAt}`);
      },
      error(error, req, res) {
        const pathname = new URL(req.originalUrl, 'http://localhost').pathname;
        logger.error(`[Sonarr Proxy] method=${req.method} path=${pathname} status=502 duration_ms=${Date.now() - req.sonarrStartedAt}`);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Sonarr upstream request failed', code: 'UPSTREAM_FAILURE' }));
        } else {
          res.destroy();
        }
      }
    }
  };
  const middleware = proxyMiddleware
    ? proxyMiddleware(proxyOptions)
    : createLazyProxyMiddleware(proxyOptions);
  router.use('/', middleware);
  return router;
}

module.exports = { createSonarrRouter };
