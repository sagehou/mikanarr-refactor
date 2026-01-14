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
  try {
    console.log(`[RSS] Request: ${req.path} with query:`, req.query);

    const patterns = getPatterns();

    // Build mikan URL with all query parameters
    const queryString = new URLSearchParams(req.query).toString();
    const mikanUrl = `https://mikanani.me${req.path}${queryString ? '?' + queryString : ''}`;

    console.log(`[RSS] Fetching from: ${mikanUrl}`);

    const response = await axios.get(mikanUrl, {
      timeout: 15000
    });

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
    console.error('[RSS] Transform error:', error.message);
    console.error('[RSS] Error details:', {
      path: req.path,
      query: req.query,
      stack: error.stack
    });
    res.status(500).send(`Error: ${error.message}`);
  }
});

module.exports = router;
