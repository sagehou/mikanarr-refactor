import express from 'express';
import axios from 'axios';
import { verifyToken } from './auth.js';

const router = express.Router();
const SONARR_API_KEY = process.env.SONARR_API_KEY;
const SONARR_HOST = process.env.SONARR_HOST;

router.use(verifyToken);

router.all('/*', async (req: express.Request, res: express.Response) => {
  const path: string = req.params[0] || '';
  try {
    const response = await axios({
      method: req.method,
      url: `${SONARR_HOST}${path}`,
      params: req.query,
      data: req.body,
      headers: {
        'X-Api-Key': SONARR_API_KEY,
        'Content-Type': 'application/json',
      },
    });
    res.json(response.data);
  } catch (error) {
    const axiosError = error as { response?: { status?: number }, message?: string };
    res.status(axiosError.response?.status || 500).send(axiosError.message || 'Unknown error');
  }
});

export default router;
