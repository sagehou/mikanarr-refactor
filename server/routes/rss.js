const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const safeRegex = require('safe-regex2');
const { hasNamedEpisodeGroup } = require('../patternValidation');

function compilePatterns(patterns) {
  const compiled = [];
  for (const pattern of patterns) {
    try {
      const expression = new RegExp(`^(?:${pattern.pattern})$`);
      if (!hasNamedEpisodeGroup(expression.source) || !safeRegex(expression)) continue;
      compiled.push({ pattern, expression });
    } catch {
      // Legacy rows may predate Pattern validation.
    }
  }
  return compiled;
}

function transformTitle(title, compiledPattern) {
  const match = compiledPattern.expression.exec(title);
  if (!match?.groups?.episode) return null;
  const pattern = compiledPattern.pattern;
  const parsedEpisode = parseInt(match.groups.episode);
  if (!Number.isFinite(parsedEpisode)) return null;
  const episode = String(parsedEpisode + (pattern.offset || 0)).padStart(2, '0');
  return `[${pattern.releasegroup || ''}] ${pattern.series} - S${String(pattern.season).padStart(2, '0')}E${episode} - ${pattern.language} - ${pattern.quality}`;
}

function createRssRouter({ database, config, httpClient = axios, logger = console }) {
  const router = express.Router();
  router.use(async (req, res) => {
    const startedAt = Date.now();
    let status = 200;
    try {
      const originalPath = req.originalUrl.split('?')[0];
      const queryString = new URLSearchParams(req.query).toString();
      const response = await httpClient.get(
        `https://mikanani.me${originalPath}${queryString ? `?${queryString}` : ''}`,
        {
          timeout: config.http.timeoutMs,
          maxContentLength: config.http.maxXmlBytes,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        }
      );
      if ((!Buffer.isBuffer(response.data) && typeof response.data !== 'string') ||
          Buffer.byteLength(response.data) > config.http.maxXmlBytes) {
        throw new Error('Upstream RSS response too large');
      }

      const result = await new xml2js.Parser().parseStringPromise(response.data);
      const channel = result?.rss?.channel?.[0];
      if (!channel) throw new Error('Invalid upstream RSS');
      const patterns = compilePatterns(database.getPatterns());
      const counts = new Map();
      const items = [];
      for (const item of channel.item || []) {
        const title = item.title?.[0];
        if (typeof title !== 'string') continue;
        const pubDate = item.torrent?.[0]?.pubDate?.[0] || item.pubDate?.[0];
        const enclosure = item.enclosure?.[0]?.$;
        const link = item.link?.[0];
        for (const compiledPattern of patterns) {
          const transformed = transformTitle(title, compiledPattern);
          if (!transformed) continue;
          const id = compiledPattern.pattern.id;
          counts.set(id, (counts.get(id) || 0) + 1);
          items.push({
            title: [transformed],
            pubDate: pubDate ? [pubDate] : undefined,
            enclosure: enclosure ? [{ $: enclosure }] : undefined,
            link,
            guid: [{ $: { isPermaLink: 'true' }, _: link }]
          });
          break;
        }
      }
      channel.item = items;
      if (counts.size) database.incrementMatchCounts(counts);
      res.type('application/xml').send(new xml2js.Builder().buildObject(result));
    } catch {
      status = 502;
      res.status(status).json({ error: 'Upstream RSS request failed', code: 'UPSTREAM_FAILURE' });
    } finally {
      const message = `[RSS] route=/RSS status=${status} duration_ms=${Date.now() - startedAt}`;
      (status >= 500 ? logger.error : logger.log)(message);
    }
  });
  return router;
}

module.exports = { createRssRouter, compilePatterns, transformTitle };
