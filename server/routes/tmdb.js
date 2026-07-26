const express = require('express');
const axios = require('axios');

function createTmdbRouter({ config, database, verifyToken, httpClient = axios, logger = console }) {
  const router = express.Router();
  const apiKey = config.tmdb.apiKey;
  router.use(verifyToken);
  router.get('/cache', (req, res) => {
    try {
      res.json(Object.fromEntries(database.getTmdbCache().map(item => [item.tmdb_id, item.title_zh])));
    } catch (error) {
      logger.error('[TMDB Cache] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });
  router.post('/cache/sync', async (req, res) => {
    if (!apiKey) return res.status(503).json({ error: 'TMDB not configured' });
    const { series } = req.body;
    if (!Array.isArray(series)) return res.status(400).json({ error: 'series array required' });
    try {
      const ids = series.map(item => item.tmdbId).filter(Boolean);
      const cached = new Set(database.getTmdbCacheByIds(ids).map(item => item.tmdb_id));
      const results = [];
      for (const seriesItem of series.filter(item => item.tmdbId && !cached.has(item.tmdbId))) {
        try {
          const response = await httpClient.get(`https://api.themoviedb.org/3/tv/${seriesItem.tmdbId}`, { params: { api_key: apiKey, language: 'zh-CN' }, timeout: 5000 });
          database.upsertTmdbCache(seriesItem.tmdbId, seriesItem.titleEn, response.data.name || null);
          results.push({ tmdbId: seriesItem.tmdbId, titleZh: response.data.name || null });
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          logger.warn(`[TMDB Cache] Failed to fetch ${seriesItem.tmdbId}:`, error.message);
          database.upsertTmdbCache(seriesItem.tmdbId, seriesItem.titleEn, null);
        }
      }
      res.json({ synced: results.length, cache: Object.fromEntries(database.getTmdbCache().map(item => [item.tmdb_id, item.title_zh])) });
    } catch (error) {
      logger.error('[TMDB Cache Sync] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });
  router.get('/tv/:id', async (req, res) => {
    if (!apiKey) return res.status(503).json({ error: 'TMDB not configured' });
    try {
      const response = await httpClient.get(`https://api.themoviedb.org/3/tv/${req.params.id}`, { params: { api_key: apiKey, language: req.query.language || 'zh-CN', append_to_response: 'external_ids,credits' } });
      res.json(response.data);
    } catch (error) {
      res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
  });
  router.get('/search', (req, res) => res.end());
  router.get('/find/:id', async (req, res) => {
    if (!apiKey) return res.status(503).json({ error: 'TMDB not configured' });
    try {
      const response = await httpClient.get(`https://api.themoviedb.org/3/find/${req.params.id}`, { params: { api_key: apiKey, external_source: req.query.source || 'tvdb_id', language: req.query.language || 'zh-CN' } });
      res.json(response.data);
    } catch (error) {
      res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
  });
  return router;
}

module.exports = { createTmdbRouter };
