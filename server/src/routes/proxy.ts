import express from 'express';
import axios from 'axios';
import { verifyToken } from './auth.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');
  
  try {
    const response = await axios.get(url.toString());
    res.set('Content-Type', 'application/xml');
    res.send(response.data);
  } catch (error) {
    res.status(500).send(`Failed to fetch: ${error instanceof Error ? error.message : String(error)}`);
  }
});

export default router;
