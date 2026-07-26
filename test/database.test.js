const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { randomUUID } = require('node:crypto');
const { createDatabase } = require('../server/database');

function createTestDatabase(t) {
  const dataDir = join(tmpdir(), `mikanarr-${randomUUID()}`);
  const db = createDatabase({ dataDir });
  t.after(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  return db;
}

function validPattern(overrides = {}) {
  return {
    remote: '', pattern: '(?<episode>\\d+)', series: 'Example', season: '1',
    language: 'Chinese', quality: 'WEBDL 1080p', offset: 0, releasegroup: '',
    ...overrides
  };
}

test('creates the data directory and complete Pattern schema', t => {
  const dataDir = join(tmpdir(), `mikanarr-${randomUUID()}`);
  const db = createDatabase({ dataDir });
  t.after(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  assert.equal(existsSync(join(dataDir, 'database.sqlite')), true);
  assert.deepEqual(
    db.raw.pragma('table_info(patterns)').map(column => column.name),
    ['id', 'remote', 'pattern', 'series', 'season', 'language', 'quality',
      'offset', 'releasegroup', 'created_at', 'last_matched_at', 'match_count']
  );
});

test('closes safely more than once and reports database health', t => {
  const dataDir = join(tmpdir(), `mikanarr-${randomUUID()}`);
  const db = createDatabase({ dataDir });
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  assert.equal(db.healthCheck(), 'ok');
  db.close();
  assert.doesNotThrow(() => db.close());
});

test('overwrite retains schema and rolls back every row on failure', t => {
  const db = createTestDatabase(t);
  db.createPattern(validPattern({ series: 'Original' }));

  assert.throws(() => db.overwritePatterns([
    validPattern({ series: 'Replacement' }),
    validPattern({ series: null })
  ]));

  assert.deepEqual(db.getPatterns().map(row => row.series), ['Original']);
  assert.equal(db.raw.pragma('table_info(patterns)').some(column => column.name === 'match_count'), true);
});

test('overwrite resets IDs and returns the final row count', t => {
  const db = createTestDatabase(t);
  db.createPattern(validPattern({ series: 'Old' }));
  db.createPattern(validPattern({ series: 'Older' }));

  assert.equal(db.overwritePatterns([
    validPattern({ series: 'First' }),
    validPattern({ series: 'Second' })
  ]), 2);
  assert.deepEqual(db.getPatterns().map(({ id, series }) => ({ id, series })), [
    { id: 1, series: 'First' },
    { id: 2, series: 'Second' }
  ]);
});

test('increments each Pattern match count by its aggregated request total', t => {
  const db = createTestDatabase(t);
  const first = db.createPattern(validPattern({ series: 'First' }));
  const second = db.createPattern(validPattern({ series: 'Second' }));

  db.incrementMatchCounts(new Map([[first.id, 3], [second.id, 2]]));

  assert.equal(db.getPattern(first.id).match_count, 3);
  assert.equal(db.getPattern(second.id).match_count, 2);
  assert.ok(db.getPattern(first.id).last_matched_at);
});

test('update always uses its explicit resource ID', t => {
  const db = createTestDatabase(t);
  const first = db.createPattern(validPattern({ series: 'First' }));
  const second = db.createPattern(validPattern({ series: 'Second' }));

  db.updatePattern(first.id, validPattern({ id: second.id, series: 'Changed' }));

  assert.equal(db.getPattern(first.id).series, 'Changed');
  assert.equal(db.getPattern(second.id).series, 'Second');
});

test('delete returns the affected row count', t => {
  const db = createTestDatabase(t);
  const pattern = db.createPattern(validPattern());

  assert.equal(db.deletePattern(pattern.id), 1);
  assert.equal(db.deletePattern(pattern.id), 0);
});
