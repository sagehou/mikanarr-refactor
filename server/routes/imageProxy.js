const express = require('express');
const axios = require('axios');
const { Transform, pipeline } = require('node:stream');
const { IMAGE_POLICY, parseAllowedUrl, boundedAxiosOptions } = require('../urlPolicy');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const IMAGE_TYPES = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']);

function createImageProxyRouter({ config, verifyToken, httpClient = axios, logger = console }) {
  const router = express.Router();
  router.use(verifyToken);
  router.get('/', async (req, res) => {
    const startedAt = Date.now();
    let status = 200;
    let bytes = 0;
    let upstream;
    try {
      if (!req.query.url) {
        status = 400;
        return res.status(status).json({ error: 'Missing url parameter', code: 'MISSING_URL' });
      }
      let url;
      try {
        url = parseAllowedUrl(req.query.url, IMAGE_POLICY);
      } catch {
        status = 403;
        return res.status(status).json({ error: 'URL not allowed', code: 'URL_NOT_ALLOWED' });
      }
      const response = await httpClient.get(url.href, {
        ...boundedAxiosOptions(IMAGE_POLICY, config),
        responseType: 'stream',
        headers: { 'User-Agent': USER_AGENT }
      });
      upstream = response.data;
      const contentType = String(response.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
      const contentLength = Number(response.headers['content-length']);
      if (!IMAGE_TYPES.has(contentType) ||
          (Number.isFinite(contentLength) && contentLength > config.http.maxImageBytes) ||
          !upstream || typeof upstream.pipe !== 'function') {
        upstream?.destroy?.();
        throw new Error('invalid upstream image');
      }
      const limiter = new Transform({
        transform(chunk, encoding, callback) {
          bytes += chunk.length;
          if (bytes > config.http.maxImageBytes) {
            const error = new Error('UPSTREAM_TOO_LARGE');
            error.code = 'UPSTREAM_TOO_LARGE';
            return callback(error);
          }
          callback(null, chunk);
        }
      });
      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'private, max-age=86400');
      await new Promise((resolve, reject) => pipeline(upstream, limiter, res, error => error ? reject(error) : resolve()));
    } catch {
      status = 502;
      upstream?.destroy?.();
      if (!res.headersSent) {
        res.status(status).json({ error: 'Upstream image request failed', code: 'UPSTREAM_FAILURE' });
      } else {
        res.destroy();
      }
    } finally {
      const message = `[Image Proxy] route=/api/image-proxy status=${status} bytes=${bytes} duration_ms=${Date.now() - startedAt}`;
      (status >= 500 ? logger.error : logger.log)(message);
    }
  });
  return router;
}

module.exports = { createImageProxyRouter };
