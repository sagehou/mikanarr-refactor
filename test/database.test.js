const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { randomUUID } = require('node:crypto');
const { createDatabase } = require('../server/database');

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
