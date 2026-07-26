const express = require('express');
const cors = require('cors');
const path = require('node:path');
const axios = require('axios');
const { createAuthRouter } = require('./routes/auth');
const { createPatternsRouter } = require('./routes/patterns');
const { createProxyRouter } = require('./routes/proxy');
const { createSonarrRouter } = require('./routes/sonarr');
const { createRssRouter } = require('./routes/rss');
const { createTmdbRouter } = require('./routes/tmdb');
const { createImageProxyRouter } = require('./routes/imageProxy');

function createApp({ config, database, oidcProvider, httpClient = axios, logger = console }) {
  const app = express();
  const authRouter = createAuthRouter({ config, oidcProvider, httpClient, logger });
  const dependencies = { config, database, oidcProvider, httpClient, logger, verifyToken: authRouter.verifyToken };

  app.use(cors());
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', '');
    next();
  });
  app.use('/sonarr', createSonarrRouter(dependencies));
  app.use('/proxy', createProxyRouter(dependencies));
  app.use('/api/image-proxy', createImageProxyRouter(dependencies));
  app.use(express.json({ limit: '256kb' }));
  app.use(express.static(path.join(__dirname, '../public')));
  app.get('/api/health', (req, res) => {
    try {
      res.json({ status: 'ok', database: database.healthCheck() });
    } catch (error) {
      logger.error('[health] Database check failed:', error.message);
      res.status(503).json({ status: 'error', database: 'error' });
    }
  });
  app.get('/api/config', authRouter.verifyToken, (req, res) => res.json({ sonarrHost: config.sonarr.publicUrl || config.sonarr.host }));
  app.use('/auth', authRouter);
  app.use('/api/patterns', createPatternsRouter(dependencies));
  app.use('/RSS', createRssRouter(dependencies));
  app.use('/tmdb', createTmdbRouter(dependencies));
  app.use((req, res, next) => {
    if (['/api', '/sonarr', '/proxy', '/RSS', '/tmdb', '/auth'].some(prefix => req.path.startsWith(prefix))) return next();
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });
  app.use((error, req, res, next) => {
    logger.error('[Server Error]', error);
    if (!res.headersSent) res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  });
  return app;
}

module.exports = { createApp };
