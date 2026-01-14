import express from 'express';
import { getPatterns, createPattern, updatePattern, deletePattern } from '../db.js';
import { verifyToken } from './auth.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', (req, res) => {
  res.json(getPatterns());
});

router.post('/', (req, res) => {
  const pattern = createPattern(req.body);
  res.status(201).json(pattern);
});

router.put('/:id', (req, res) => {
  const pattern = updatePattern(parseInt(req.params.id), req.body);
  res.json(pattern);
});

router.delete('/:id', (req, res) => {
  deletePattern(parseInt(req.params.id));
  res.status(204).send();
});

export default router;
