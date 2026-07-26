const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');

function transformTitle(title, pattern) {
  try {
    const match = title.match(new RegExp(`^${pattern.pattern}$`));
    if (!match?.groups?.episode) return null;
    const episode = String(parseInt(match.groups.episode) + (pattern.offset || 0)).padStart(2, '0');
    return `[${pattern.releasegroup || ''}] ${pattern.series} - S${String(pattern.season).padStart(2, '0')}E${episode} - ${pattern.language} - ${pattern.quality}`;
  } catch {
    return null;
  }
}

function createRssRouter({ database, httpClient = axios, logger = console }) {
  const router = express.Router();
  router.use(async (req, res) => {
    try {
      const patterns = database.getPatterns();
      const originalPath = req.originalUrl.split('?')[0];
      const queryString = new URLSearchParams(req.query).toString();
      const response = await httpClient.get(`https://mikanani.me${originalPath}${queryString ? `?${queryString}` : ''}`, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
      const result = await new xml2js.Parser().parseStringPromise(response.data);
      const items = [];
      for (const item of result.rss.channel[0].item || []) {
        const title = item.title[0];
        const pubDate = item.torrent?.[0]?.pubDate?.[0] || item.pubDate?.[0];
        const enclosure = item.enclosure?.[0]?.$;
        const link = item.link?.[0];
        for (const pattern of patterns) {
          const transformed = transformTitle(title, pattern);
          if (!transformed) continue;
          database.incrementMatchCount(pattern.id);
          items.push({ title: [transformed], pubDate: pubDate ? [pubDate] : undefined, enclosure: enclosure ? [{ $: enclosure }] : undefined, link, guid: [{ $: { isPermaLink: 'true' }, _: link }] });
          break;
        }
      }
      result.rss.channel[0].item = items;
      res.type('application/xml').send(new xml2js.Builder().buildObject(result));
    } catch (error) {
      logger.error('[RSS] Transform error:', error.message);
      const message = error.response?.status ? `Mikanani returned ${error.response.status}: ${error.message}` : `Failed to fetch from Mikanani: ${error.message}`;
      res.status(500).send(`Error: ${message}`);
    }
  });
  return router;
}

module.exports = { createRssRouter };
