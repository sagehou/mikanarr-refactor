const test = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { randomUUID } = require('node:crypto');
const { rmSync } = require('node:fs');
const { start } = require('../server/index');

test('starts an isolated app on an ephemeral port', async t => {
  const dataDir = join(tmpdir(), `mikanarr-${randomUUID()}`);
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const runtime = await start({ env: { NODE_ENV: 'test', DATA_DIR: dataDir, ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'secret', PORT: '0' }, logger: { log() {}, error() {} } });
  t.after(() => new Promise(resolve => runtime.server.close(() => { runtime.database.close(); resolve(); })));
  assert.notEqual(runtime.server.address().port, 0);
});
