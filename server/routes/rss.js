const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const { getPatterns } = require('../database');

const router = express.Router();

function transformTitle(title, pattern) {
  try {
    const regex = new RegExp(`^${pattern.pattern}$`);
    const match = title.match(regex);
    if (!match?.groups?.episode) return null;
    
    const episodeWithOffset = parseInt(match.groups.episode) + (pattern.offset || 0);
    const seasonNum = String(pattern.season).padStart(2, '0');
    const episodeNum = String(episodeWithOffset).padStart(2, '0');
    const releasegroup = pattern.releasegroup || '';
    
    return `[${releasegroup}] ${pattern.series} - S${seasonNum}E${episodeNum} - ${pattern.language} - ${pattern.quality}`;
  } catch (error) {
    return null;
  }
}

router.get('/*', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).send('Missing token');
  
  try {
    const patterns = getPatterns();
    const mikanUrl = `https://mikanani.me${req.path}?token=${token}`;
    const response = await axios.get(mikanUrl);
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response.data);
    
    const items = [];
    for (const item of result.rss.channel[0].item || []) {
      const title = item.title[0];
      const pubDate = item.pubDate?.[0];
      const enclosure = item.enclosure?.[0]?.$;
      const link = item.link?.[0];
      
      for (const pattern of patterns) {
        const newTitle = transformTitle(title, pattern);
        if (newTitle) {
          items.push({
            title: [newTitle],
            pubDate,
            enclosure,
            link,
            guid: [{ $: { isPermaLink: 'true' }, _: link }],
          });
          break;
        }
      }
    }
    
    result.rss.channel[0].item = items;
    const builder = new xml2js.Builder();
    res.set('Content-Type', 'application/xml');
    res.send(builder.buildObject(result));
  } catch (error) {
    console.error('RSS transform error:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

module.exports = router;
