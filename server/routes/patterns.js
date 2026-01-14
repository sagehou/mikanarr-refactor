const express = require('express');
const { getPatterns, getPattern, createPattern, updatePattern, deletePattern, db } = require('../database');
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
router.post('/import', verifyToken, async (req, res) => {
  try {
    const { patterns, mode = 'append' } = req.body; // 默认为追加模式
    
    if (!Array.isArray(patterns)) {
      return res.status(400).json({ error: 'Invalid data format: patterns should be an array' });
    }
    
    let importedCount = 0;
    let errorCount = 0;
    const errors = [];
    const validPatterns = [];
    
    // 第一步：验证和预处理数据
    for (const pattern of patterns) {
      try {
        // 验证必需字段
        if (!pattern.pattern || !pattern.series || !pattern.season) {
          errors.push(`Pattern missing required fields: ${JSON.stringify(pattern)}`);
          errorCount++;
          continue;
        }
        
        // 预处理数据，设置默认值
        const processedPattern = {
          remote: pattern.remote || '',
          pattern: pattern.pattern,
          series: pattern.series,
          season: pattern.season,
          language: pattern.language || 'Chinese',
          quality: pattern.quality || 'WEBDL 1080p',
          offset: pattern.offset || 0,
          releasegroup: pattern.releasegroup || '',
          created_at: pattern.created_at || new Date().toISOString()
        };
        
        validPatterns.push(processedPattern);
        importedCount++;
      } catch (error) {
        errors.push(`Error processing pattern ${JSON.stringify(pattern)}: ${error.message}`);
        errorCount++;
      }
    }
    
    let successCount = 0;
    let actionMessage = '';
    
    if (mode === 'overwrite') {
      // 覆盖模式：先删除所有现有patterns，并重置自增ID
      try {
        // 先检查当前记录数
        const countBefore = db.prepare('SELECT COUNT(*) as count FROM patterns').get().count;
        console.log(`[patterns] Records before delete: ${countBefore}`);
        
        // 直接执行删除操作，better-sqlite3的exec本身就是原子的
        const deleteResult = db.exec('DELETE FROM patterns');
        console.log('[patterns] Delete operation executed, result:', deleteResult);
        
        // 验证删除是否成功
        const countAfterDelete = db.prepare('SELECT COUNT(*) as count FROM patterns').get().count;
        console.log(`[patterns] Records after delete: ${countAfterDelete}`);
        
        if (countAfterDelete > 0) {
          // 如果删除失败，尝试使用不同的方法
          console.log('[patterns] Attempting alternative delete method...');
          try {
            const stmt = db.prepare('DELETE FROM patterns');
            const result = stmt.run();
            console.log('[patterns] Prepared statement delete result:', result);
            
            const countAfterStmt = db.prepare('SELECT COUNT(*) as count FROM patterns').get().count;
            console.log(`[patterns] Records after prepared statement: ${countAfterStmt}`);
            
            if (countAfterStmt > 0) {
              throw new Error(`Failed to delete records. Still have ${countAfterStmt} records after multiple attempts`);
            }
          } catch (altError) {
            console.error('[patterns] Alternative delete method also failed:', altError);
            throw altError;
          }
        }
        
        console.log('[patterns] Successfully cleared all existing patterns');
        
        // 重置自增ID - 使用最直接有效的方法
        try {
          console.log('[patterns] Starting ID reset process...');
          
          // 方法1: 删除并重建表（最可靠的方法）
          console.log('[patterns] Method 1: Drop and recreate table');
          
          // 获取现有数据
          const existingData = db.prepare('SELECT * FROM patterns').all();
          console.log('[patterns] Backup', existingData.length, 'records');
          
          // 删除表
          db.exec('DROP TABLE patterns');
          console.log('[patterns] Dropped patterns table');
          
          // 重新创建表
          db.exec(`
            CREATE TABLE patterns (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              remote TEXT,
              pattern TEXT NOT NULL,
              series TEXT NOT NULL,
              season TEXT NOT NULL,
              language TEXT DEFAULT 'Chinese',
              quality TEXT DEFAULT 'WEBDL 1080p',
              offset INTEGER DEFAULT 0,
              releasegroup TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);
          console.log('[patterns] Recreated patterns table');
          
          // 验证表是否为空
          const countAfterRecreate = db.prepare('SELECT COUNT(*) as count FROM patterns').get().count;
          console.log('[patterns] Records after table recreation:', countAfterRecreate);
          
          if (countAfterRecreate !== 0) {
            throw new Error(`Table recreation failed. Still have ${countAfterRecreate} records`);
          }
          
          console.log('[patterns] Successfully reset auto-increment ID by recreating table');
          
        } catch (error) {
          console.error('[patterns] Table recreation failed:', error);
          
          // 备用方法: 手动设置下一个ID
          try {
            console.log('[patterns] Attempting fallback method: manual ID reset');
            
            // 获取当前最大ID
            const result = db.prepare('SELECT MAX(id) as max_id FROM patterns').get();
            const currentMaxId = result.max_id || 0;
            console.log('[patterns] Current max ID:', currentMaxId);
            
            // 如果表存在且有数据，手动重置
            if (currentMaxId > 0) {
              // 这个方法在某些SQLite版本中可能不工作，但值得一试
              db.exec(`UPDATE sqlite_sequence SET seq = 0 WHERE name = 'patterns'`);
              console.log('[patterns] Attempted to set seq = 0 in sqlite_sequence');
            }
            
          } catch (fallbackError) {
            console.error('[patterns] Fallback method also failed:', fallbackError);
          }
        }
        
        actionMessage = 'All existing patterns have been cleared and ';
      } catch (error) {
        console.error('[patterns] Error clearing patterns:', error);
        errors.push(`Error clearing existing patterns: ${error.message}`);
        errorCount++;
      }
    }
    
    // 插入patterns（追加模式或覆盖模式）
    for (const pattern of validPatterns) {
      try {
        const createdPattern = createPattern(pattern);
        successCount++;
      } catch (error) {
        errors.push(`Error importing pattern ${JSON.stringify(pattern)}: ${error.message}`);
        errorCount++;
      }
    }
    
    // 验证结果：检查数据库中的实际记录数
    let finalCount = 0;
    try {
      // 在删除后立即检查记录数
      if (mode === 'overwrite') {
        const afterDeleteCount = db.prepare('SELECT COUNT(*) as count FROM patterns').get().count;
        console.log(`[patterns] Records after delete operation: ${afterDeleteCount}`);
        
        if (afterDeleteCount > 0) {
          console.warn('[patterns] WARNING: Delete operation did not clear all records!');
          errors.push('Warning: Delete operation did not clear all records');
        }
      }
      
      finalCount = db.prepare('SELECT COUNT(*) as count FROM patterns').get().count;
      console.log(`[patterns] Final record count: ${finalCount}`);
    } catch (error) {
      console.error('[patterns] Error counting patterns:', error);
    }
    
    let finalMessage = '';
    if (mode === 'overwrite') {
      finalMessage = `${actionMessage}${successCount} patterns imported, ${errorCount} errors. Patterns have been re-indexed starting from ID 1. Total patterns in database: ${finalCount}`;
    } else {
      finalMessage = `${successCount} patterns imported, ${errorCount} errors. Data has been appended to existing patterns. Total patterns in database: ${finalCount}`;
    }
    
    res.json({
      success: true,
      importedCount: successCount,
      errorCount,
      errors,
      mode,
      finalCount,
      message: finalMessage
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
  const { sortBy = 'created_at', order = 'desc' } = req.query;
  
  let query = 'SELECT * FROM patterns';
  let orderBy = 'created_at';
  
  // 处理排序字段
  switch (sortBy.toLowerCase()) {
    case 'id':
      orderBy = 'id';
      break;
    case 'series':
      orderBy = 'series';
      break;
    case 'season':
      orderBy = 'season';
      break;
    case 'language':
      orderBy = 'language';
      break;
    case 'quality':
      orderBy = 'quality';
      break;
    case 'created_at':
      orderBy = 'created_at';
      break;
    default:
      orderBy = 'created_at';
  }
  
  // 处理排序方向
  const direction = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  query += ` ORDER BY ${orderBy} ${direction}`;
  
  try {
    const patterns = db.prepare(query).all();
    res.json(patterns);
  } catch (error) {
    console.error('[patterns] Error fetching sorted patterns:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
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

// 临时测试端点 - 清空数据库
router.delete('/test-clear', (req, res) => {
  try {
    const countBefore = db.prepare('SELECT COUNT(*) as count FROM patterns').get().count;
    console.log(`[patterns] Test clear: Records before: ${countBefore}`);
    
    db.exec('DELETE FROM patterns');
    db.exec('DELETE FROM sqlite_sequence WHERE name = "patterns"');
    
    const countAfter = db.prepare('SELECT COUNT(*) as count FROM patterns').get().count;
    console.log(`[patterns] Test clear: Records after: ${countAfter}`);
    
    res.json({
      success: true,
      message: 'Database cleared successfully',
      countBefore,
      countAfter
    });
  } catch (error) {
    console.error('[patterns] Test clear error:', error);
    res.status(500).json({ error: error.message });
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
