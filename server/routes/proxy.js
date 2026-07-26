const express = require('express');
const axios = require('axios');
const { MIKAN_POLICY, parseAllowedUrl, boundedAxiosOptions } = require('../urlPolicy');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function createProxyRouter({ config, verifyToken, httpClient = axios, logger = console }) {
  const router = express.Router();
  router.use(verifyToken);
  router.get('/', async (req, res) => {
    const startedAt = Date.now();
    let status = 200;
    let bytes = 0;
    try {
      if (!req.query.url) {
        status = 400;
        return res.status(status).json({ error: 'Missing url parameter', code: 'MISSING_URL' });
      }
      let url;
      try {
        url = parseAllowedUrl(req.query.url, MIKAN_POLICY);
      } catch {
        status = 403;
        return res.status(status).json({ error: 'URL not allowed', code: 'URL_NOT_ALLOWED' });
      }
      const response = await httpClient.get(url.href, {
        ...boundedAxiosOptions(MIKAN_POLICY, config),
        headers: { 'User-Agent': USER_AGENT }
      });
      if (!Buffer.isBuffer(response.data) && typeof response.data !== 'string') throw new Error('invalid response');
      bytes = Buffer.byteLength(response.data);
      if (bytes > config.http.maxXmlBytes) throw new Error('response too large');
      const xml = Buffer.isBuffer(response.data) ? response.data.toString('utf8') : response.data;
      const result = xml.replace(/<item>([\s\S]*?)<\/item>/g, (match, itemContent) => {
        const pubDate = itemContent.match(/<torrent[^>]*>[\s\S]*?<pubDate>([^<]+)<\/pubDate>[\s\S]*?<\/torrent>/)?.[1] || new Date().toISOString();
        const content = itemContent.replace(/<torrent[^>]*>[\s\S]*?<\/torrent>/g, '').replace(/<\/title>/, `</title><pubDate>${pubDate}</pubDate>`);
        return `<item>${content}</item>`;
      });
      res.type('application/xml').send(result);
    } catch {
      status = 502;
      res.status(status).json({ error: 'Upstream request failed', code: 'UPSTREAM_FAILURE' });
    } finally {
      const message = `[Mikan Proxy] route=/proxy status=${status} bytes=${bytes} duration_ms=${Date.now() - startedAt}`;
      (status >= 500 ? logger.error : logger.log)(message);
    }
  });
  return router;
}

module.exports = { createProxyRouter };
