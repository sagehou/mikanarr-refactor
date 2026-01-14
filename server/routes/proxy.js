const express = require('express');
const axios = require('axios');
const { verifyToken } = require('./auth');

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
  
  if (!url.startsWith('https://mikanani.me')) {
    return res.status(403).json({ error: 'Only mikanani.me URLs are allowed' });
  }
  
  try {
    const response = await axios.get(url, { timeout: 10000 });
    res.set('Content-Type', 'application/xml');
    res.send(response.data);
  } catch (error) {
    const axiosError = error;
    res.status(axiosError.response?.status || 500).json({ 
      error: axiosError.response?.data || axiosError.message || 'Failed to fetch RSS' 
    });
  }
});

module.exports = router;
