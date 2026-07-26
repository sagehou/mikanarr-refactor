const express = require('express');
const { validatePattern, parsePositiveId } = require('../patternValidation');

const SORT_FIELDS = new Set([
  'id', 'series', 'season', 'language', 'quality', 'created_at', 'last_matched_at'
]);

function createPatternsRouter({ database, verifyToken, logger = console }) {
  const router = express.Router();
  router.use(verifyToken);

  router.get('/export', (req, res) => {
    const exportDate = new Date().toISOString();
    res.attachment(`patterns_export_${exportDate.slice(0, 10)}.json`).json({
      exportDate,
      version: '1.0',
      patterns: database.getPatterns()
    });
  });

  router.post('/import', (req, res) => {
    const mode = req.body?.mode ?? 'append';
    if (!Array.isArray(req.body?.patterns) || !['append', 'overwrite'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid Pattern', code: 'INVALID_PATTERN' });
    }

    let patterns;
    try {
      patterns = req.body.patterns.map(validatePattern);
    } catch {
      return res.status(400).json({ error: 'Invalid Pattern', code: 'INVALID_PATTERN' });
    }

    try {
      const finalCount = mode === 'overwrite'
        ? database.overwritePatterns(patterns)
        : (patterns.forEach(pattern => database.createPattern(pattern)), database.getPatterns().length);
      return res.json({
        success: true,
        importedCount: patterns.length,
        errorCount: 0,
        errors: [],
        mode,
        finalCount
      });
    } catch {
      logger.error('[patterns] import failed');
      return res.status(500).json({ error: 'Internal server error', code: 'REQUEST_FAILED' });
    }
  });

  router.get('/', (req, res) => {
    const requestedSort = typeof req.query.sortBy === 'string' ? req.query.sortBy.toLowerCase() : '';
    const sortBy = SORT_FIELDS.has(requestedSort) ? requestedSort : 'created_at';
    const order = typeof req.query.order === 'string' && req.query.order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const patterns = database.raw.prepare(`SELECT * FROM patterns ORDER BY ${sortBy} ${order}`).all();
    res.json(patterns);
  });

  router.post('/', (req, res, next) => {
    let pattern;
    try {
      pattern = validatePattern(req.body);
    } catch {
      return res.status(400).json({ error: 'Invalid Pattern', code: 'INVALID_PATTERN' });
    }
    try {
      return res.status(201).json(database.createPattern(pattern));
    } catch (error) {
      return next(error);
    }
  });

  router.all('/test-clear', (req, res) => {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  });

  router.get('/:id', (req, res) => {
    let id;
    try {
      id = parsePositiveId(req.params.id);
    } catch {
      return res.status(400).json({ error: 'Invalid Pattern ID', code: 'INVALID_ID' });
    }
    const pattern = database.getPattern(id);
    if (!pattern) return res.status(404).json({ error: 'Pattern not found', code: 'PATTERN_NOT_FOUND' });
    return res.json(pattern);
  });

  router.put('/:id', (req, res) => {
    let id;
    try {
      id = parsePositiveId(req.params.id);
    } catch {
      return res.status(400).json({ error: 'Invalid Pattern ID', code: 'INVALID_ID' });
    }
    if (!database.getPattern(id)) {
      return res.status(404).json({ error: 'Pattern not found', code: 'PATTERN_NOT_FOUND' });
    }
    let pattern;
    try {
      pattern = validatePattern(req.body);
    } catch {
      return res.status(400).json({ error: 'Invalid Pattern', code: 'INVALID_PATTERN' });
    }
    return res.json(database.updatePattern(id, pattern));
  });

  router.delete('/:id', (req, res) => {
    let id;
    try {
      id = parsePositiveId(req.params.id);
    } catch {
      return res.status(400).json({ error: 'Invalid Pattern ID', code: 'INVALID_ID' });
    }
    if (!database.deletePattern(id)) {
      return res.status(404).json({ error: 'Pattern not found', code: 'PATTERN_NOT_FOUND' });
    }
    return res.status(204).send();
  });

  router.use((error, req, res, next) => {
    logger.error('[patterns] route=/api/patterns status=500');
    res.status(500).json({ error: 'Internal server error', code: 'REQUEST_FAILED' });
  });

  return router;
}

module.exports = { createPatternsRouter };
