const express = require('express');
const axios = require('axios');
const { verifyToken } = require('./auth');

const router = express.Router();
router.use(verifyToken);

router.all('/*', async (req, res) => {
  const SONARR_API_KEY = process.env.SONARR_API_KEY;
  const SONARR_HOST = process.env.SONARR_HOST;

  console.log(`[Sonarr Proxy] Request: ${req.method} ${req.originalUrl}`);
  console.log(`[Sonarr Proxy] req.path: ${req.path}`);
  console.log(`[Sonarr Proxy] req.params[0]: ${req.params[0] || 'undefined'}`);

  if (!SONARR_API_KEY || !SONARR_HOST) {
    console.error('[Sonarr Proxy] Missing configuration');
    return res.status(503).json({
      error: 'Sonarr not configured. Set SONARR_API_KEY and SONARR_HOST environment variables.'
    });
  }

  // Use req.params[0] to match original behavior
  const path = req.params[0] || '';
  console.log(`[Sonarr Proxy] Using path: ${path}`);
  console.log(`[Sonarr Proxy] Forwarding to: ${SONARR_HOST}${path}`);

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
      timeout: 10000
    });
    console.log(`[Sonarr Proxy] Response: ${response.status}, Data length: ${JSON.stringify(response.data).length}`);
    res.json(response.data);
  } catch (error) {
    const axiosError = error;
    console.error('[Sonarr Proxy] Error:', {
      message: axiosError.message,
      code: axiosError.code,
      status: axiosError.response?.status,
      data: axiosError.response?.data,
      url: `${SONARR_HOST}${path}`
    });
    res.status(axiosError.response?.status || 500).json({
      error: axiosError.response?.data || axiosError.message || 'Unknown error'
    });
  }
});

module.exports = router;
