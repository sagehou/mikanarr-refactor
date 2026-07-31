const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');

function createDatabase({ dataDir }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const raw = new Database(path.join(dataDir, 'database.sqlite'));
  let closed = false;

  raw.exec(`
    CREATE TABLE IF NOT EXISTS patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote TEXT,
      pattern TEXT NOT NULL,
      series TEXT NOT NULL,
      season TEXT NOT NULL,
      language TEXT DEFAULT 'Chinese',
      quality TEXT DEFAULT 'WEBDL 1080p',
      offset INTEGER DEFAULT 0,
      releasegroup TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_matched_at DATETIME,
      match_count INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS tmdb_cache (
      tmdb_id INTEGER PRIMARY KEY,
      title_en TEXT NOT NULL,
      title_zh TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const columns = raw.pragma('table_info(patterns)').map(column => column.name);
  if (!columns.includes('last_matched_at')) raw.exec('ALTER TABLE patterns ADD COLUMN last_matched_at DATETIME');
  if (!columns.includes('match_count')) raw.exec('ALTER TABLE patterns ADD COLUMN match_count INTEGER DEFAULT 0');

  const statements = {
    getPatterns: raw.prepare('SELECT * FROM patterns ORDER BY created_at DESC'),
    getPattern: raw.prepare('SELECT * FROM patterns WHERE id = ?'),
    createPattern: raw.prepare(`
      INSERT INTO patterns (remote, pattern, series, season, language, quality, offset, releasegroup)
      VALUES (@remote, @pattern, @series, @season, @language, @quality, @offset, @releasegroup)
    `),
    updatePattern: raw.prepare(`
      UPDATE patterns SET remote = @remote, pattern = @pattern, series = @series, season = @season,
      language = @language, quality = @quality, offset = @offset, releasegroup = @releasegroup WHERE id = @id
    `),
    deletePattern: raw.prepare('DELETE FROM patterns WHERE id = ?'),
    deletePatterns: raw.prepare('DELETE FROM patterns'),
    resetPatternSequence: raw.prepare("DELETE FROM sqlite_sequence WHERE name = 'patterns'"),
    countPatterns: raw.prepare('SELECT COUNT(*) AS count FROM patterns'),
    getTmdbCache: raw.prepare('SELECT * FROM tmdb_cache'),
    upsertTmdbCache: raw.prepare(`
      INSERT INTO tmdb_cache (tmdb_id, title_en, title_zh, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tmdb_id) DO UPDATE SET title_en = excluded.title_en, title_zh = excluded.title_zh,
      updated_at = CURRENT_TIMESTAMP
    `),
    incrementMatchCount: raw.prepare('UPDATE patterns SET match_count = match_count + ?, last_matched_at = CURRENT_TIMESTAMP WHERE id = ?'),
    healthCheck: raw.prepare('SELECT 1 AS healthy')
  };
  const overwritePatterns = raw.transaction(patterns => {
    statements.deletePatterns.run();
    statements.resetPatternSequence.run();
    for (const pattern of patterns) statements.createPattern.run(pattern);
    return statements.countPatterns.get().count;
  });
  const appendPatterns = raw.transaction(patterns => {
    for (const pattern of patterns) statements.createPattern.run(pattern);
    return statements.countPatterns.get().count;
  });
  const incrementMatchCounts = raw.transaction(counts => {
    for (const [id, count] of counts) statements.incrementMatchCount.run(count, id);
  });

  return {
    raw,
    getPatterns: () => statements.getPatterns.all(),
    getPattern: id => statements.getPattern.get(id),
    createPattern(pattern) {
      const result = statements.createPattern.run(pattern);
      return statements.getPattern.get(result.lastInsertRowid);
    },
    updatePattern(id, pattern) {
      statements.updatePattern.run({ ...pattern, id });
      return statements.getPattern.get(id);
    },
    deletePattern: id => statements.deletePattern.run(id).changes,
    appendPatterns,
    overwritePatterns,
    getTmdbCache: () => statements.getTmdbCache.all(),
    getTmdbCacheByIds(ids) {
      if (!ids?.length) return [];
      return raw.prepare(`SELECT * FROM tmdb_cache WHERE tmdb_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    },
    upsertTmdbCache: (id, titleEn, titleZh) => statements.upsertTmdbCache.run(id, titleEn, titleZh),
    incrementMatchCount: id => statements.incrementMatchCount.run(1, id),
    incrementMatchCounts,
    healthCheck() {
      statements.healthCheck.get();
      return 'ok';
    },
    close() {
      if (closed) return;
      raw.close();
      closed = true;
    }
  };
}

module.exports = { createDatabase };
