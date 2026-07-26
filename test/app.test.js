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

test('OIDC-only configuration hides local login', async t => {
  const fixture = await createAppFixture({ oidcOnly: true });
  t.after(fixture.close);
  const response = await fetch(`${fixture.baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: '', password: '' })
  });
  assert.equal(response.status, 404);
});
