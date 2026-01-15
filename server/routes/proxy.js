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
    
    // 首先替换空pubDate标签为有效的pubDate
    xmlData = xmlData.replace(/<pubDate\s*\/>/g, () => {
      const now = new Date().toISOString();
      return `<pubDate>${now}</pubDate>`;
    });
    
    // 检查是否还有item缺少pubDate
    const items = xmlData.split('<item>');
    let needsUpdate = false;
    
    for (let i = 1; i < items.length; i++) {
      const item = items[i];
      const itemEnd = item.lastIndexOf('</item>');
      if (itemEnd === -1) continue;
      
      const itemContent = item.substring(0, itemEnd);
      
      // 检查是否有完整的pubDate元素
      if (!itemContent.includes('<pubDate>')) {
        needsUpdate = true;
        break;
      }
    }
    
    // 如果所有items都有pubDate，直接返回处理后的数据
    if (!needsUpdate) {
      console.log('[Mikan Proxy] All items have pubDate, returning XML');
      res.set('Content-Type', 'application/xml');
      res.send(xmlData);
      return;
    }
    
    // 需要更新，逐个处理items
    console.log('[Mikan Proxy] Adding missing pubDate elements');
    const updatedItems = items.map((item, index) => {
      if (index === 0) return item; // RSS头
      
      const itemEnd = item.lastIndexOf('</item>');
      if (itemEnd === -1) return item;
      
      const itemContent = item.substring(0, itemEnd);
      const remainingContent = item.substring(itemEnd);
      
      // 检查是否有完整的pubDate元素
      if (itemContent.includes('<pubDate>')) {
        return `<item>${item}`;
      }
      
      // 在title元素后添加pubDate
      const titleEnd = itemContent.indexOf('</title>');
      if (titleEnd !== -1) {
        const now = new Date().toISOString();
        return `<item>${itemContent.substring(0, titleEnd + 9)}<pubDate>${now}</pubDate>${itemContent.substring(titleEnd + 9)}${remainingContent}`;
      }
      
      return `<item>${item}`;
    });
    
    const updatedXml = updatedItems.join('<item>');
    res.set('Content-Type', 'application/xml');
    res.send(updatedXml);
    
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
