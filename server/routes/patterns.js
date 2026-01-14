const express = require('express');
const { getPatterns, getPattern, createPattern, updatePattern, deletePattern } = require('../database');
const { verifyToken } = require('./auth');

const router = express.Router();
router.use(verifyToken);

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('[patterns] Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

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
  try {
    const id = parseInt(req.params.id);
    console.log(`[patterns] GET /${id}`);
    const pattern = getPattern(id);
    if (!pattern) {
      console.error(`[patterns] Pattern not found: ${id}`);
      return res.status(404).json({ error: 'Pattern not found' });
    }
    console.log(`[patterns] Found pattern:`, pattern.series);
    res.json(pattern);
  } catch (error) {
    console.error(`[patterns] Error:`, error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
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
  try {
    deletePattern(parseInt(req.params.id));
    res.status(204).send();
  } catch (error) {
    console.error(`[patterns] Delete error:`, error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Error handling middleware for this router
router.use((err, req, res, next) => {
  console.error('[patterns] Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = router;
