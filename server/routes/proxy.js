const express = require('express');
const axios = require('axios');
const { verifyToken } = require('./auth');

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  console.log(`[Mikan Proxy] Request URL: ${url}`);

  if (!url.startsWith('https://mikanani.me')) {
    console.error('[Mikan Proxy] Invalid URL domain');
    return res.status(403).json({ error: 'Only mikanani.me URLs are allowed' });
  }

  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    console.log(`[Mikan Proxy] Response: ${response.status}, Data length: ${response.data?.length || 0}`);
    
    const xmlData = response.data;
    
    // 为每个item添加pubDate元素（如果不存在）
    if (xmlData.includes('<item>')) {
      const updatedXml = xmlData.replace(
        /(<item>[\s\S]*?)(?=<\/item>|$)/g,
        (match, itemContent) => {
          // 检查是否已经有pubDate
          if (!itemContent.includes('<pubDate>')) {
            // 如果没有pubDate，添加当前时间
            const now = new Date().toUTCString();
            return itemContent.replace(/(<item>)/, `$1<pubDate>${now}</pubDate>`);
          }
          return match;
        }
      );
      
      res.set('Content-Type', 'application/xml');
      res.send(updatedXml);
    } else {
      res.set('Content-Type', 'application/xml');
      res.send(xmlData);
    }
  } catch (error) {
    const axiosError = error;
    console.error('[Mikan Proxy] Error:', axiosError.message);
    console.error('[Mikan Proxy] Error details:', axiosError.response?.data || axiosError.config?.url);
    res.status(axiosError.response?.status || 500).json({
      error: axiosError.response?.data || axiosError.message || 'Failed to fetch RSS'
    });
  }
});

module.exports = router;
