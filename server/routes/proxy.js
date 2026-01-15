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
    
    let xmlData = response.data;
    
    // 处理每个item，将torrent/pubDate移动到item级别
    const result = xmlData.replace(/<item>([\s\S]*?)<\/item>/g, (match, itemContent) => {
      // 尝试从torrent元素中提取pubDate
      const torrentMatch = itemContent.match(/<torrent[^>]*>([\s\S]*?)<\/torrent>/);
      let pubDate = null;
      
      if (torrentMatch) {
        const torrentContent = torrentMatch[1];
        const pubDateMatch = torrentContent.match(/<pubDate>([^<]+)<\/pubDate>/);
        if (pubDateMatch) {
          pubDate = pubDateMatch[1];
        }
      }
      
      // 如果找到了pubDate，将它添加到item中（title之后，enclosure之前）
      if (pubDate) {
        // 移除torrent元素
        let newContent = itemContent.replace(/<torrent[^>]*>[\s\S]*?<\/torrent>/g, '');
        
        // 在</title>后添加pubDate
        newContent = newContent.replace(/<\/title>/, `</title><pubDate>${pubDate}</pubDate>`);
        
        return `<item>${newContent}</item>`;
      }
      
      // 如果没有pubDate，添加一个
      const now = new Date().toISOString();
      let newContent = itemContent.replace(/<\/title>/, `</title><pubDate>${now}</pubDate>`);
      
      return `<item>${newContent}</item>`;
    });
    
    res.set('Content-Type', 'application/xml');
    res.send(result);
    
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
