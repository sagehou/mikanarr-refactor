import express from 'express';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { getPatterns } from '../db.js';

const router = express.Router();

interface PatternData {
  pattern: string;
  series: string;
  season: string;
  language?: string;
  quality?: string;
  offset?: number;
  releasegroup?: string;
}

function transformTitle(title: string, { pattern, series, season = '01', language = '', quality = '', offset = 0, releasegroup = '' }: PatternData) {
  try {
    const regex = new RegExp(`^${pattern}$`);
    const match = title.match(regex);
    if (!match?.groups?.episode) return null;
    
    const episodeWithOffset = Number.parseInt(match.groups.episode) + (offset || 0);
    const seasonNum = season.padStart(2, '0');
    const episodeNum = `${episodeWithOffset}`.padStart(2, '0');
    
    return `[${releasegroup}] ${series} - S${seasonNum}E${episodeNum} - ${language} - ${quality}`;
  } catch {
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
    const xml = await parseStringPromise(response.data);
    
    const items = [];
    for (const item of xml.rss.channel[0].item || []) {
      const title = item.title[0];
      const pubDate = item.pubDate?.[0];
      const enclosure = item.enclosure?.[0]?.$;
      const link = item.link?.[0];
      const guid = item.guid?.[0];
      
      for (const pattern of patterns as PatternData[]) {
        const newTitle = transformTitle(title, pattern);
        if (newTitle) {
          items.push({
            title: [newTitle],
            pubDate,
            enclosure,
            link,
            guid,
          });
          break;
        }
      }
    }
    
    const rss = {
      rss: {
        channel: [{
          title: ['Mikanarr RSS'],
          description: ['Transformed RSS for Sonarr'],
          link: ['https://github.com/std4453/mikanarr'],
          item: items,
        }],
      },
    };
    
    const builder = new (await import('xml2js')).Builder();
    res.set('Content-Type', 'application/xml');
    res.send(builder.buildObject(rss));
} catch (error) {
    console.error('RSS transform error:', error);
    res.status(500).send(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
});

export default router;
