const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../data/database.sqlite');

const db = new Database(dbPath);

function initDb() {
  db.exec(`
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // TMDB Chinese name cache table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tmdb_cache (
      tmdb_id INTEGER PRIMARY KEY,
      title_en TEXT NOT NULL,
      title_zh TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function getPatterns() {
  return db.prepare('SELECT * FROM patterns ORDER BY created_at DESC').all();
}

function getPattern(id) {
  try {
    return db.prepare('SELECT * FROM patterns WHERE id = ?').get(id);
  } catch (error) {
    console.error('[database] Error getting pattern:', id, error);
    throw error;
  }
}

function createPattern(pattern) {
  const stmt = db.prepare(`
    INSERT INTO patterns (remote, pattern, series, season, language, quality, offset, releasegroup)
    VALUES (@remote, @pattern, @series, @season, @language, @quality, @offset, @releasegroup)
  `);
  const result = stmt.run(pattern);
  return getPattern(result.lastInsertRowid);
}

function updatePattern(id, pattern) {
  const stmt = db.prepare(`
    UPDATE patterns SET
      remote = @remote,
      pattern = @pattern,
      series = @series,
      season = @season,
      language = @language,
      quality = @quality,
      offset = @offset,
      releasegroup = @releasegroup
    WHERE id = @id
  `);
  stmt.run({ id, ...pattern });
  return getPattern(id);
}

function deletePattern(id) {
  const stmt = db.prepare('DELETE FROM patterns WHERE id = ?');
  return stmt.run(id);
}

// TMDB Cache functions
function getTmdbCache() {
  return db.prepare('SELECT * FROM tmdb_cache').all();
}

function getTmdbCacheByIds(tmdbIds) {
  if (!tmdbIds || tmdbIds.length === 0) return [];
  const placeholders = tmdbIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM tmdb_cache WHERE tmdb_id IN (${placeholders})`).all(...tmdbIds);
}

function upsertTmdbCache(tmdbId, titleEn, titleZh) {
  const stmt = db.prepare(`
    INSERT INTO tmdb_cache (tmdb_id, title_en, title_zh, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(tmdb_id) DO UPDATE SET
      title_en = excluded.title_en,
      title_zh = excluded.title_zh,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(tmdbId, titleEn, titleZh);
}

module.exports = {
  initDb,
  getPatterns,
  getPattern,
  createPattern,
  updatePattern,
  deletePattern,
  getTmdbCache,
  getTmdbCacheByIds,
  upsertTmdbCache,
  db
};
