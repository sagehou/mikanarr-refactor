const express = require('express');
const { getPatterns, getPattern, createPattern, updatePattern, deletePattern } = require('../database');
const { verifyToken } = require('./auth');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// 导出patterns数据 - 不需要认证
router.get('/export', (req, res) => {
  try {
    const patterns = getPatterns();
    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      patterns: patterns
    };
    
    const jsonData = JSON.stringify(exportData, null, 2);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="patterns_export_${new Date().toISOString().split('T')[0]}.json"`);
    res.send(jsonData);
  } catch (error) {
    console.error('[patterns] Export error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// 导入patterns数据 - 需要认证
router.post('/import', verifyToken, (req, res) => {
  try {
    const { patterns } = req.body;
    
    if (!Array.isArray(patterns)) {
      return res.status(400).json({ error: 'Invalid data format: patterns should be an array' });
    }
    
    let importedCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (const pattern of patterns) {
      try {
        // 验证必需字段
        if (!pattern.pattern || !pattern.series || !pattern.season) {
          errors.push(`Pattern missing required fields: ${JSON.stringify(pattern)}`);
          errorCount++;
          continue;
        }
        
        // 创建pattern，忽略id字段让数据库自动生成
        const { id, ...patternData } = pattern;
        const createdPattern = createPattern(patternData);
        importedCount++;
      } catch (error) {
        errors.push(`Error importing pattern ${JSON.stringify(pattern)}: ${error.message}`);
        errorCount++;
      }
    }
    
    res.json({
      success: true,
      importedCount,
      errorCount,
      errors,
      message: `Import completed: ${importedCount} patterns imported, ${errorCount} errors`
    });
  } catch (error) {
    console.error('[patterns] Import error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// 其他路由需要认证
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

// 导出patterns数据
router.get('/export', (req, res) => {
  try {
    const patterns = getPatterns();
    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      patterns: patterns
    };
    
    const jsonData = JSON.stringify(exportData, null, 2);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="patterns_export_${new Date().toISOString().split('T')[0]}.json"`);
    res.send(jsonData);
  } catch (error) {
    console.error('[patterns] Export error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// 导入patterns数据
router.post('/import', (req, res) => {
  try {
    const { patterns } = req.body;
    
    if (!Array.isArray(patterns)) {
      return res.status(400).json({ error: 'Invalid data format: patterns should be an array' });
    }
    
    let importedCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (const pattern of patterns) {
      try {
        // 验证必需字段
        if (!pattern.pattern || !pattern.series || !pattern.season) {
          errors.push(`Pattern missing required fields: ${JSON.stringify(pattern)}`);
          errorCount++;
          continue;
        }
        
        // 创建pattern，忽略id字段让数据库自动生成
        const { id, ...patternData } = pattern;
        const createdPattern = createPattern(patternData);
        importedCount++;
      } catch (error) {
        errors.push(`Error importing pattern ${JSON.stringify(pattern)}: ${error.message}`);
        errorCount++;
      }
    }
    
    res.json({
      success: true,
      importedCount,
      errorCount,
      errors,
      message: `Import completed: ${importedCount} patterns imported, ${errorCount} errors`
    });
  } catch (error) {
    console.error('[patterns] Import error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Error handling middleware for this router
router.use((err, req, res, next) => {
  console.error('[patterns] Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = router;
