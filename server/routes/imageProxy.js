const express = require('express');
const axios = require('axios');

const allowedDomains = ['mikanani.me', 'artworks.thetvdb.com', 'image.tmdb.org', 'thetvdb.com'];

function createImageProxyRouter({ verifyToken, httpClient = axios, logger = console }) {
  const router = express.Router();
  router.use(verifyToken);
  router.get('/', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('Missing url parameter');
    try {
      const parsedUrl = new URL(url);
      if (!allowedDomains.some(domain => parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`))) return res.status(403).send('Domain not allowed');
      const response = await httpClient.get(url, { responseType: 'stream', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
      res.set('Content-Type', response.headers['content-type']);
      res.set('Cache-Control', 'public, max-age=86400');
      response.data.pipe(res);
    } catch (error) {
      logger.error('[Image Proxy] Error:', error.message);
      res.status(500).send('Failed to fetch image');
    }
  });
  return router;
}

module.exports = { createImageProxyRouter };
