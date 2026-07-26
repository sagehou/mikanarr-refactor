const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppFixture } = require('./helpers/fixtures');

test('serves static HTML and database health without listening on import', async t => {
  const fixture = await createAppFixture();
  t.after(fixture.close);
  assert.equal((await fetch(`${fixture.baseUrl}/`)).status, 200);
  const health = await fetch(`${fixture.baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', database: 'ok' });
});
