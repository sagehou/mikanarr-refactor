const express = require('express');
const axios = require('axios');
const { mapConcurrent } = require('../concurrency');

function tmdbAxiosOptions(config) {
  return {
    timeout: config.tmdb.timeoutMs,
    maxContentLength: config.http.maxXmlBytes,
    maxBodyLength: config.http.maxXmlBytes
  };
}

function updatedAtMs(value) {
  if (typeof value !== 'string') return NaN;
  return Date.parse(`${value.replace(' ', 'T')}Z`);
}

function isFreshCache(item, config, now = Date.now()) {
  const ttl = item.title_zh === null ? config.tmdb.negativeTtlMs : config.tmdb.cacheTtlMs;
  return now - updatedAtMs(item.updated_at) < ttl;
}

function createTmdbRouter({ config, database, verifyToken, httpClient = axios, logger = console }) {
  const router = express.Router();
  const apiKey = config.tmdb.apiKey;
  const requestOptions = tmdbAxiosOptions(config);
  router.use(verifyToken);
  router.get('/cache', (req, res) => {
    try {
      res.json(Object.fromEntries(database.getTmdbCache().map(item => [item.tmdb_id, item.title_zh])));
    } catch {
      logger.error('[TMDB Cache] route=/tmdb/cache status=500');
      res.status(500).json({ error: 'Internal server error', code: 'REQUEST_FAILED' });
    }
  });
  router.post('/cache/sync', async (req, res) => {
    if (!apiKey) return res.status(503).json({ error: 'TMDB not configured', code: 'TMDB_NOT_CONFIGURED' });
    const { series } = req.body;
    if (!Array.isArray(series)) return res.status(400).json({ error: 'series array required', code: 'INVALID_REQUEST' });
    try {
      const candidates = series.filter(item => item?.tmdbId);
      const cached = new Map(database.getTmdbCacheByIds(candidates.map(item => item.tmdbId))
        .map(item => [String(item.tmdb_id), item]));
      const now = Date.now();
      const pending = candidates.filter(item => {
        const existing = cached.get(String(item.tmdbId));
        return !existing || !isFreshCache(existing, config, now);
      });
      const results = await mapConcurrent(pending, config.tmdb.concurrency, async seriesItem => {
        try {
          const response = await httpClient.get(
            `https://api.themoviedb.org/3/tv/${encodeURIComponent(seriesItem.tmdbId)}`,
            {
              ...requestOptions,
              params: { api_key: apiKey, language: 'zh-CN' }
            }
          );
          const titleZh = typeof response.data?.name === 'string' && response.data.name ? response.data.name : null;
          if (titleZh !== null) {
            database.upsertTmdbCache(seriesItem.tmdbId, seriesItem.titleEn, titleZh);
            return { tmdbId: seriesItem.tmdbId, titleZh };
          }
        } catch (error) {
          if (error.response?.status === 404) {
            database.upsertTmdbCache(seriesItem.tmdbId, seriesItem.titleEn, null);
          } else {
            logger.warn('[TMDB Cache] route=/tmdb/cache/sync status=upstream_failure');
          }
        }
        return null;
      });
      res.json({
        synced: results.filter(Boolean).length,
        cache: Object.fromEntries(database.getTmdbCache().map(item => [item.tmdb_id, item.title_zh]))
      });
    } catch {
      logger.error('[TMDB Cache] route=/tmdb/cache/sync status=500');
      res.status(500).json({ error: 'Internal server error', code: 'REQUEST_FAILED' });
    }
  });
  router.get('/tv/:id', async (req, res) => {
    if (!apiKey) return res.status(503).json({ error: 'TMDB not configured', code: 'TMDB_NOT_CONFIGURED' });
    try {
      const response = await httpClient.get(
        `https://api.themoviedb.org/3/tv/${encodeURIComponent(req.params.id)}`,
        {
          ...requestOptions,
          params: {
            api_key: apiKey,
            language: req.query.language || 'zh-CN',
            append_to_response: 'external_ids,credits'
          }
        }
      );
      res.json(response.data);
    } catch (error) {
      if (error.response?.status === 404) {
        return res.status(404).json({ error: 'TMDB item not found', code: 'TMDB_NOT_FOUND' });
      }
      res.status(502).json({ error: 'TMDB upstream request failed', code: 'UPSTREAM_FAILURE' });
    }
  });
  router.get('/find/:id', async (req, res) => {
    if (!apiKey) return res.status(503).json({ error: 'TMDB not configured', code: 'TMDB_NOT_CONFIGURED' });
    try {
      const response = await httpClient.get(
        `https://api.themoviedb.org/3/find/${encodeURIComponent(req.params.id)}`,
        {
          ...requestOptions,
          params: {
            api_key: apiKey,
            external_source: req.query.source || 'tvdb_id',
            language: req.query.language || 'zh-CN'
          }
        }
      );
      res.json(response.data);
    } catch (error) {
      if (error.response?.status === 404) {
        return res.status(404).json({ error: 'TMDB item not found', code: 'TMDB_NOT_FOUND' });
      }
      res.status(502).json({ error: 'TMDB upstream request failed', code: 'UPSTREAM_FAILURE' });
    }
  });
  return router;
}

module.exports = { createTmdbRouter };
