import express from 'express';
import axios from 'axios';
import { verifyToken } from './auth.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
  
  try {
    const response = await axios.get(url.toString(), {
      timeout: 10000,
    });
    res.set('Content-Type', 'application/xml');
    res.send(response.data);
  } catch (error) {
    const axiosError = error as { response?: { status?: number, data?: unknown }, message?: string };
    res.status(axiosError.response?.status || 500).json({ error: axiosError.response?.data || axiosError.message || 'Failed to fetch RSS' });
  }
});

export default router;
