const express = require('express');
const { getPatterns, createPattern, updatePattern, deletePattern } = require('../database');
const { verifyToken } = require('./auth');

const router = express.Router();
router.use(verifyToken);

router.get('/', (req, res) => {
  res.json(getPatterns());
});

router.post('/', (req, res) => {
  try {
    const pattern = createPattern(req.body);
    res.status(201).json(pattern);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id', (req, res) => {
  const pattern = getPattern(parseInt(req.params.id));
  if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
  res.json(pattern);
});

router.put('/:id', (req, res) => {
  try {
    const pattern = updatePattern(parseInt(req.params.id), req.body);
    if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
    res.json(pattern);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', (req, res) => {
  deletePattern(parseInt(req.params.id));
  res.status(204).send();
});

module.exports = router;
