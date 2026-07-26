const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppFixture, login, CookieJar } = require('./helpers/fixtures');

function validPattern(overrides = {}) {
  return {
    remote: 'https://mikanani.me/RSS/Bangumi?bangumiId=1',
    pattern: '\\[Group\\] Show - (?<episode>\\d+)',
    series: 'Show', season: '1', language: 'Chinese', quality: 'WEBDL 1080p',
    offset: 0, releasegroup: 'Group', ...overrides
  };
}

async function authenticatedFixture(t) {
  const fixture = await createAppFixture();
  t.after(fixture.close);
  const jar = new CookieJar();
  assert.equal((await login(fixture, 'admin', 'secret', jar)).status, 200);
  return { fixture, headers: { cookie: jar.header() } };
}

async function jsonRequest(fixture, headers, path, method, body) {
  return fetch(`${fixture.baseUrl}${path}`, {
    method,
    headers: { ...headers, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

test('export and import each require authentication', async t => {
  const fixture = await createAppFixture();
  t.after(fixture.close);

  const exported = await fetch(`${fixture.baseUrl}/api/patterns/export`);
  assert.equal(exported.status, 401);
  assert.deepEqual(await exported.json(), { error: 'Authentication required', code: 'AUTH_REQUIRED' });

  const imported = await jsonRequest(fixture, {}, '/api/patterns/import', 'POST', { patterns: [] });
  assert.equal(imported.status, 401);
  assert.deepEqual(await imported.json(), { error: 'Authentication required', code: 'AUTH_REQUIRED' });
});

test('PUT uses the path ID and ignores body-owned metadata', async t => {
  const { fixture, headers } = await authenticatedFixture(t);
  const first = fixture.database.createPattern(validPattern({ series: 'First' }));
  const second = fixture.database.createPattern(validPattern({ series: 'Second' }));

  const response = await jsonRequest(fixture, headers, `/api/patterns/${first.id}`, 'PUT', {
    ...validPattern({ series: 'Changed' }), id: second.id, match_count: 999,
    created_at: 'forged', last_matched_at: 'forged'
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, first.id);
  assert.equal(fixture.database.getPattern(first.id).series, 'Changed');
  assert.equal(fixture.database.getPattern(first.id).match_count, 0);
  assert.equal(fixture.database.getPattern(second.id).series, 'Second');
});

test('malformed and non-positive resource IDs return stable 400 errors', async t => {
  const { fixture, headers } = await authenticatedFixture(t);
  for (const [method, id, body] of [
    ['GET', '1x'], ['PUT', '0', validPattern()], ['DELETE', '-1']
  ]) {
    const response = await jsonRequest(fixture, headers, `/api/patterns/${id}`, method, body);
    assert.equal(response.status, 400, `${method} ${id}`);
    assert.deepEqual(await response.json(), { error: 'Invalid Pattern ID', code: 'INVALID_ID' }, `${method} ${id}`);
  }
});

test('missing Pattern resources return stable 404 errors', async t => {
  const { fixture, headers } = await authenticatedFixture(t);
  for (const [method, body] of [['GET'], ['PUT', validPattern()], ['DELETE']]) {
    const response = await jsonRequest(fixture, headers, '/api/patterns/999', method, body);
    assert.equal(response.status, 404, method);
    assert.deepEqual(await response.json(), { error: 'Pattern not found', code: 'PATTERN_NOT_FOUND' }, method);
  }
});

test('create and import reject invalid Patterns without partial writes', async t => {
  const { fixture, headers } = await authenticatedFixture(t);
  const invalidCreate = await jsonRequest(fixture, headers, '/api/patterns', 'POST', validPattern({ pattern: '(a+)+(?<episode>\\d+)' }));
  assert.equal(invalidCreate.status, 400);
  assert.deepEqual(await invalidCreate.json(), { error: 'Invalid Pattern', code: 'INVALID_PATTERN' });

  const invalidImport = await jsonRequest(fixture, headers, '/api/patterns/import', 'POST', {
    patterns: [validPattern({ series: 'Would write' }), validPattern({ series: '' })]
  });
  assert.equal(invalidImport.status, 400);
  assert.deepEqual(await invalidImport.json(), { error: 'Invalid Pattern', code: 'INVALID_PATTERN' });
  assert.deepEqual(fixture.database.getPatterns(), []);
});

test('overwrite import retains statistics columns and reports the final count', async t => {
  const { fixture, headers } = await authenticatedFixture(t);
  fixture.database.createPattern(validPattern({ series: 'Old' }));

  const response = await jsonRequest(fixture, headers, '/api/patterns/import', 'POST', {
    mode: 'overwrite',
    patterns: [validPattern({ series: 'First' }), validPattern({ series: 'Second' })]
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true, importedCount: 2, errorCount: 0, errors: [], mode: 'overwrite', finalCount: 2
  });
  assert.deepEqual(fixture.database.getPatterns().map(({ id, series }) => ({ id, series })), [
    { id: 1, series: 'First' }, { id: 2, series: 'Second' }
  ]);
  assert.equal(fixture.database.raw.pragma('table_info(patterns)').some(column => column.name === 'match_count'), true);
});

test('last_matched_at is an allowed Pattern sort field', async t => {
  const { fixture, headers } = await authenticatedFixture(t);
  const later = fixture.database.createPattern(validPattern({ series: 'Later' }));
  const earlier = fixture.database.createPattern(validPattern({ series: 'Earlier' }));
  fixture.database.raw.prepare('UPDATE patterns SET last_matched_at = ? WHERE id = ?').run('2026-02-01 00:00:00', later.id);
  fixture.database.raw.prepare('UPDATE patterns SET last_matched_at = ? WHERE id = ?').run('2026-01-01 00:00:00', earlier.id);

  const response = await fetch(`${fixture.baseUrl}/api/patterns?sortBy=last_matched_at&order=asc`, { headers });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).map(pattern => pattern.series), ['Earlier', 'Later']);
});

test('removed test-clear endpoint returns 404', async t => {
  const { fixture, headers } = await authenticatedFixture(t);
  const response = await fetch(`${fixture.baseUrl}/api/patterns/test-clear`, { method: 'DELETE', headers });
  assert.equal(response.status, 404);
});

test('authenticated export and append import run once', async t => {
  const { fixture, headers } = await authenticatedFixture(t);
  const imported = await jsonRequest(fixture, headers, '/api/patterns/import', 'POST', { patterns: [validPattern()] });
  assert.equal(imported.status, 200);
  assert.equal((await imported.json()).importedCount, 1);

  const exported = await fetch(`${fixture.baseUrl}/api/patterns/export`, { headers });
  assert.equal(exported.status, 200);
  const body = await exported.json();
  assert.equal(body.patterns.length, 1);
  assert.equal(fixture.database.getPatterns().length, 1);
});

test('unexpected Pattern failures return fixed errors without logging query secrets', async t => {
  const logs = [];
  const logger = {
    log(...parts) { logs.push(parts.join(' ')); },
    warn(...parts) { logs.push(parts.join(' ')); },
    error(...parts) { logs.push(parts.join(' ')); }
  };
  const fixture = await createAppFixture({ logger });
  t.after(fixture.close);
  const jar = new CookieJar();
  assert.equal((await login(fixture, 'admin', 'secret', jar)).status, 200);
  fixture.database.close();

  const response = await fetch(`${fixture.baseUrl}/api/patterns?token=QUERY-SECRET`, {
    headers: { cookie: jar.header() }
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Internal server error', code: 'REQUEST_FAILED' });
  assert.equal(logs.some(line => line.includes('QUERY-SECRET') || line.includes('token=')), false);
});

test('create distinguishes database failures from invalid Pattern input', async t => {
  const fixture = await createAppFixture();
  t.after(fixture.close);
  const jar = new CookieJar();
  assert.equal((await login(fixture, 'admin', 'secret', jar)).status, 200);
  fixture.database.close();

  const response = await jsonRequest(
    fixture, { cookie: jar.header() }, '/api/patterns', 'POST', validPattern()
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Internal server error', code: 'REQUEST_FAILED' });
});
