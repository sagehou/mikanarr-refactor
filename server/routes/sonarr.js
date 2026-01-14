const express = require('express');
const axios = require('axios');
const { verifyToken } = require('./auth');

const router = express.Router();
router.use(verifyToken);

router.all('/*', async (req, res) => {
  const SONARR_API_KEY = process.env.SONARR_API_KEY;
  const SONARR_HOST = process.env.SONARR_HOST;
  
  if (!SONARR_API_KEY || !SONARR_HOST) {
    return res.status(503).json({ 
      error: 'Sonarr not configured. Set SONARR_API_KEY and SONARR_HOST environment variables.' 
    });
  }
  
  const path = req.params[0] || '';
  try {
    const response = await axios({
      method: req.method,
      url: `${SONARR_HOST}${path}`,
      params: req.query,
      data: req.body,
      headers: {
        'X-Api-Key': SONARR_API_KEY,
        'Content-Type': 'application/json',
      },
    });
    res.json(response.data);
  } catch (error) {
    const axiosError = error;
    res.status(axiosError.response?.status || 500).json({ 
      error: axiosError.response?.data || axiosError.message || 'Unknown error' 
    });
  }
});

module.exports = router;
