const express = require('express');
const axios = require('axios');
const { verifyToken } = require('./auth');

const router = express.Router();
router.use(verifyToken);

const ALLOWED_DOMAINS = [
  'mikanani.me',
  'artworks.thetvdb.com',
  'image.tmdb.org',
  'thetvdb.com'
];

router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  try {
    const parsedUrl = new URL(url);
    // Strict domain checking: match exact domain or subdomains
    const isAllowed = ALLOWED_DOMAINS.some(d => 
      parsedUrl.hostname === d || parsedUrl.hostname.endsWith('.' + d)
    );

    if (!isAllowed) {
      return res.status(403).send('Domain not allowed');
    }

    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    res.set('Content-Type', response.headers['content-type']);
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24h
    response.data.pipe(res);
  } catch (error) {
    console.error('[Image Proxy] Error:', error.message);
    res.status(500).send('Failed to fetch image');
  }
});

module.exports = router;
