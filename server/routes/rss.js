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
    console.log(`[RSS] Original URL: ${req.originalUrl}`);

    const patterns = getPatterns();

    // Use req.originalUrl to get the full path including /RSS prefix
    const originalPath = req.originalUrl.split('?')[0];
    const queryString = new URLSearchParams(req.query).toString();
    const mikanUrl = `https://mikanani.me${originalPath}${queryString ? '?' + queryString : ''}`;

    console.log(`[RSS] Fetching from: ${mikanUrl}`);

    const response = await axios.get(mikanUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response.data);

    const items = [];
    for (const item of result.rss.channel[0].item || []) {
      const title = item.title[0];
      // pubDate is inside <torrent> element in Mikan RSS
      const pubDate = item['torrent']?.[0]?.pubDate?.[0] || item.pubDate?.[0];
      const enclosureAttrs = item.enclosure?.[0]?.$;
      const link = item.link?.[0];

      for (const pattern of patterns) {
        const newTitle = transformTitle(title, pattern);
        if (newTitle) {
          items.push({
            title: [newTitle],
            pubDate: pubDate ? [pubDate] : undefined,
            // xml2js Builder requires { $: {...} } format for XML attributes
            enclosure: enclosureAttrs ? [{ $: enclosureAttrs }] : undefined,
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
      error: {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data
      },
      stack: error.stack
    });

    const errorMessage = error.response?.status
      ? `Mikanani returned ${error.response.status}: ${error.message}`
      : `Failed to fetch from Mikanani: ${error.message}`;

    res.status(500).send(`Error: ${errorMessage}`);
  }
});

module.exports = router;
