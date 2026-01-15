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
    
    // 简单处理：为每个item添加pubDate元素（如果不存在）
    if (xmlData.includes('<item>')) {
      // 分割所有items
      const parts = xmlData.split('<item>');
      const updatedParts = parts.map((part, index) => {
        if (index === 0) return part; // 第一个部分是RSS头，不需要处理
        
        // 检查这个item是否包含</item>
        const itemEndIndex = part.indexOf('</item>');
        if (itemEndIndex === -1) return part; // 没有item结束标记
        
        const itemContent = part.substring(0, itemEndIndex);
        const remainingContent = part.substring(itemEndIndex);
        
        // 检查是否已经有pubDate
        if (itemContent.includes('<pubDate>')) {
          return `<item>${part}`;
        }
        
        // 添加pubDate到item中
        const now = new Date().toISOString();
        return `<item>${itemContent}<pubDate>${now}</pubDate>${remainingContent}`;
      });
      
      const updatedXml = updatedParts.join('<item>');
      
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
