const express = require('express');
const axios = require('axios');
const { verifyToken } = require('./auth');

const router = express.Router();
router.use(verifyToken);

const TMDB_API_KEY = process.env.TMDB_API_KEY;

if (!TMDB_API_KEY) {
  console.warn('TMDB_API_KEY not set, TMDB features will be disabled');
}

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
