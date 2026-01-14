import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/database.sqlite');

const db = new Database(dbPath);

export function initDb() {
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
}

export function getPatterns() {
  return db.prepare('SELECT * FROM patterns ORDER BY created_at DESC').all();
}

export function getPattern(id) {
  return db.prepare('SELECT * FROM patterns WHERE id = ?').get(id);
}

export function createPattern(pattern) {
  const stmt = db.prepare(`
    INSERT INTO patterns (remote, pattern, series, season, language, quality, offset, releasegroup)
    VALUES (@remote, @pattern, @series, @season, @language, @quality, @offset, @releasegroup)
  `);
  const result = stmt.run(pattern);
  return getPattern(result.lastInsertRowid);
}

export function updatePattern(id, pattern) {
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

export function deletePattern(id) {
  const stmt = db.prepare('DELETE FROM patterns WHERE id = ?');
  return stmt.run(id);
}

export default db;
