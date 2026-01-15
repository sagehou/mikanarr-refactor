const express = require('express');
const axios = require('axios');
const { verifyToken } = require('./auth');
const { getTmdbCache, getTmdbCacheByIds, upsertTmdbCache } = require('../database');

const router = express.Router();
router.use(verifyToken);

const TMDB_API_KEY = process.env.TMDB_API_KEY;

if (!TMDB_API_KEY) {
  console.warn('TMDB_API_KEY not set, TMDB features will be disabled');
}

// Get cached Chinese names for series list
router.get('/cache', async (req, res) => {
  try {
    const cache = getTmdbCache();
    // Convert to map for easy lookup: { tmdbId: titleZh }
    const cacheMap = {};
    cache.forEach(item => {
      cacheMap[item.tmdb_id] = item.title_zh;
    });
    res.json(cacheMap);
  } catch (error) {
    console.error('[TMDB Cache] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Batch update Chinese names for new series
router.post('/cache/sync', async (req, res) => {
  if (!TMDB_API_KEY) {
    return res.status(503).json({ error: 'TMDB not configured' });
  }

  const { series } = req.body; // Array of { tmdbId, titleEn }
  if (!series || !Array.isArray(series)) {
    return res.status(400).json({ error: 'series array required' });
  }

  try {
    // Get existing cache
    const tmdbIds = series.map(s => s.tmdbId).filter(id => id);
    const existingCache = getTmdbCacheByIds(tmdbIds);
    const existingIds = new Set(existingCache.map(c => c.tmdb_id));

    // Find new series that need to be fetched
    const newSeries = series.filter(s => s.tmdbId && !existingIds.has(s.tmdbId));

    console.log(`[TMDB Cache] Syncing ${newSeries.length} new series out of ${series.length} total`);

    // Fetch Chinese names for new series (with rate limiting)
    const results = [];
    for (const s of newSeries) {
      try {
        const response = await axios.get(
          `https://api.themoviedb.org/3/tv/${s.tmdbId}`,
          {
            params: {
              api_key: TMDB_API_KEY,
              language: 'zh-CN'
            },
            timeout: 5000
          }
        );
        const titleZh = response.data.name || null;
        upsertTmdbCache(s.tmdbId, s.titleEn, titleZh);
        results.push({ tmdbId: s.tmdbId, titleZh });
        
        // Rate limit: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.warn(`[TMDB Cache] Failed to fetch ${s.tmdbId}:`, error.message);
        // Cache with null titleZh to avoid repeated failed requests
        upsertTmdbCache(s.tmdbId, s.titleEn, null);
      }
    }

    // Return updated cache
    const updatedCache = getTmdbCache();
    const cacheMap = {};
    updatedCache.forEach(item => {
      cacheMap[item.tmdb_id] = item.title_zh;
    });

    res.json({ 
      synced: results.length,
      cache: cacheMap 
    });
  } catch (error) {
    console.error('[TMDB Cache Sync] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/tv/:id', async (req, res) => {
  if (!TMDB_API_KEY) {
    return res.status(503).json({ error: 'TMDB not configured' });
  }
  
  const { id } = req.params;
  const { language = 'zh-CN' } = req.query;
  
  try {
    const response = await axios.get(
      `https://api.themoviedb.org/3/tv/${id}`,
      {
        params: {
          api_key: TMDB_API_KEY,
          language,
          append_to_response: 'external_ids,credits'
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    const axiosError = error;
    res.status(axiosError.response?.status || 500).json({ 
      error: axiosError.response?.data || axiosError.message 
    });
  }
});

router.get('/search', async (req, res) => {
  if (!TMDB_API_KEY) {
    return res.status(503).json({ error: 'TMDB not configured' });
  }
  
  const { query, language = 'zh-CN' } = req.query;
  
  if (!query) {
    return res.status(400).json({ error: 'Query parameter required' });
  }
  
  try {
    const response = await axios.get(
      `https://api.themoviedb.org/3/search/tv`,
      {
        params: {
          api_key: TMDB_API_KEY,
          query,
          language
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    const axiosError = error;
    res.status(axiosError.response?.status || 500).json({ 
      error: axiosError.response?.data || axiosError.message 
    });
  }
});

module.exports = router;
