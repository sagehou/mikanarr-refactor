const express = require('express');
const axios = require('axios');

function createProxyRouter({ verifyToken, httpClient = axios, logger = console }) {
  const router = express.Router();
  router.use(verifyToken);
  router.get('/', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url parameter' });
    if (!url.startsWith('https://mikanani.me')) return res.status(403).json({ error: 'Only mikanani.me URLs are allowed' });
    try {
      const response = await httpClient.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
      const result = response.data.replace(/<item>([\s\S]*?)<\/item>/g, (match, itemContent) => {
        const pubDate = itemContent.match(/<torrent[^>]*>[\s\S]*?<pubDate>([^<]+)<\/pubDate>[\s\S]*?<\/torrent>/)?.[1] || new Date().toISOString();
        const content = itemContent.replace(/<torrent[^>]*>[\s\S]*?<\/torrent>/g, '').replace(/<\/title>/, `</title><pubDate>${pubDate}</pubDate>`);
        return `<item>${content}</item>`;
      });
      res.type('application/xml').send(result);
    } catch (error) {
      logger.error('[Mikan Proxy] Error:', error.message);
      res.status(error.response?.status || 500).json({ error: error.response?.data || error.message || 'Failed to fetch RSS' });
    }
  });
  return router;
}

module.exports = { createProxyRouter };
