const test = require('node:test');
const assert = require('node:assert/strict');
const { statSync, chmodSync } = require('node:fs');
const { join } = require('node:path');
const { createApp } = require('../server/app');
const { createAppFixture, login, CookieJar, validPattern } = require('./helpers/fixtures');

function cookieValue(response, name = 'mikanarr_session') {
  const cookie = response.headers.getSetCookie().find(value => value.startsWith(`${name}=`));
  return cookie?.split(';')[0].slice(name.length + 1);
}

async function authenticatedFixture(options) {
  const fixture = await createAppFixture(options);
  const jar = new CookieJar();
  const response = await login(fixture, 'admin', 'secret', jar);
  assert.equal(response.status, 200);
  return { fixture, jar, response };
}

function loginFrom(fixture, address, password = 'wrong') {
  return fetch(`${fixture.baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': address },
    body: JSON.stringify({ username: 'admin', password })
  });
}

test('empty JSON never authenticates when local auth is disabled', async t => {
  const fixture = await createAppFixture({ oidcOnly: true, oidcProvider: {} });
  t.after(fixture.close);
  const response = await fetch(`${fixture.baseUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(response.status, 404);
  assert.equal(response.headers.has('set-cookie'), false);
  assert.deepEqual(await response.json(), { error: 'Local authentication is not available', code: 'LOCAL_AUTH_DISABLED' });
});

test('malformed login JSON returns a stable error object without a session', async t => {
  const fixture = await createAppFixture();
  t.after(fixture.close);
  const response = await fetch(`${fixture.baseUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{'
  });
  assert.equal(response.status, 400);
  assert.equal(response.headers.has('set-cookie'), false);
  assert.deepEqual(await response.json(), { error: 'Invalid JSON', code: 'INVALID_JSON' });
});

test('login stores JWT only in an HttpOnly SameSite cookie', async t => {
  const fixture = await createAppFixture();
  t.after(fixture.close);
  const response = await login(fixture, 'admin', 'secret');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: { username: 'admin' } });
  assert.match(response.headers.get('set-cookie'), /mikanarr_session=.*HttpOnly.*SameSite=Strict/i);
});

test('session lookup authenticates only the exact session cookie', async t => {
  const { fixture, jar, response: loginResponse } = await authenticatedFixture();
  t.after(fixture.close);

  const session = await fetch(`${fixture.baseUrl}/auth/session`, { headers: { cookie: jar.header() } });
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), { user: { username: 'admin' } });

  const token = cookieValue(loginResponse);
  for (const [name, url, headers] of [
    ['query JWT', `${fixture.baseUrl}/auth/session?token=${token}`, {}],
    ['bearer JWT', `${fixture.baseUrl}/auth/session`, { authorization: `Bearer ${token}` }],
    ['similar cookie name', `${fixture.baseUrl}/auth/session`, { cookie: `not_mikanarr_session=${token}` }]
  ]) {
    const rejected = await fetch(url, { headers });
    assert.equal(rejected.status, 401, name);
    assert.deepEqual(await rejected.json(), { error: 'Authentication required', code: 'AUTH_REQUIRED' }, name);
  }
});

test('logout clears the HttpOnly session cookie', async t => {
  const { fixture, jar } = await authenticatedFixture();
  t.after(fixture.close);
  const response = await fetch(`${fixture.baseUrl}/auth/logout`, { method: 'POST', headers: { cookie: jar.header() } });
  assert.equal(response.status, 204);
  assert.match(response.headers.get('set-cookie'), /mikanarr_session=;.*HttpOnly.*SameSite=Strict/i);
  jar.set(response);
  assert.equal(jar.header(), '');
});

test('session expires after the configured 24-hour lifetime', async t => {
  let now = Date.now();
  const { fixture, jar } = await authenticatedFixture({ clock: () => now });
  t.after(fixture.close);
  now += 24 * 60 * 60 * 1000 + 1;
  const response = await fetch(`${fixture.baseUrl}/auth/session`, { headers: { cookie: jar.header() } });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Invalid session', code: 'INVALID_SESSION' });
});

test('all current mutation routers reject explicit cross-site requests', async t => {
  const { fixture, jar } = await authenticatedFixture();
  t.after(fixture.close);
  const cases = [
    ['POST', '/auth/login', { username: 'admin', password: 'secret' }],
    ['POST', '/auth/logout', undefined],
    ['POST', '/api/patterns', validPattern],
    ['POST', '/api/patterns/import', { patterns: [] }],
    ['PUT', '/api/patterns/1', validPattern],
    ['DELETE', '/api/patterns/1', undefined],
    ['POST', '/tmdb/cache/sync', { series: [] }],
    ['POST', '/sonarr/series', {}]
  ];
  for (const [method, path, body] of cases) {
    const response = await fetch(`${fixture.baseUrl}${path}`, {
      method,
      headers: { cookie: jar.header(), 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    assert.equal(response.status, 403, `${method} ${path}`);
    assert.deepEqual(await response.json(), { error: 'Cross-site request rejected', code: 'CROSS_SITE_REQUEST' });
  }
});

test('mutation guard rejects a same-host Origin with a different scheme', async t => {
  const fixture = await createAppFixture();
  t.after(fixture.close);
  const host = new URL(fixture.baseUrl).host;
  const response = await fetch(`${fixture.baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: `https://${host}` },
    body: JSON.stringify({ username: 'admin', password: 'secret' })
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Cross-site request rejected', code: 'CROSS_SITE_REQUEST' });
  assert.equal(response.headers.has('set-cookie'), false);
});

test('mutation guard rejects an Origin with a different host', async t => {
  const fixture = await createAppFixture();
  t.after(fixture.close);
  const response = await fetch(`${fixture.baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://attacker.example' },
    body: JSON.stringify({ username: 'admin', password: 'secret' })
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Cross-site request rejected', code: 'CROSS_SITE_REQUEST' });
  assert.equal(response.headers.has('set-cookie'), false);
});

test('local login rate limits the sixth failure per IP for 15 minutes', async t => {
  let now = 1_000;
  const fixture = await createAppFixture({ clock: () => now });
  t.after(fixture.close);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await login(fixture, 'admin', 'wrong');
    assert.equal(response.status, 401, `failure ${attempt}`);
  }
  const limited = await login(fixture, 'admin', 'wrong');
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: 'Too many login attempts', code: 'LOGIN_RATE_LIMITED' });

  now += 15 * 60 * 1000;
  assert.equal((await login(fixture, 'admin', 'wrong')).status, 401);
});

test('successful login resets the failure counter', async t => {
  const fixture = await createAppFixture({ clock: () => 1_000 });
  t.after(fixture.close);
  for (let attempt = 0; attempt < 4; attempt += 1) assert.equal((await login(fixture, 'admin', 'wrong')).status, 401);
  assert.equal((await login(fixture, 'admin', 'secret')).status, 200);
  for (let attempt = 0; attempt < 5; attempt += 1) assert.equal((await login(fixture, 'admin', 'wrong')).status, 401);
  assert.equal((await login(fixture, 'admin', 'wrong')).status, 429);
});

test('five failures block even correct credentials until the window expires', async t => {
  let now = 1_000;
  const fixture = await createAppFixture({ clock: () => now });
  t.after(fixture.close);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await login(fixture, 'admin', 'wrong')).status, 401);
  }
  assert.equal((await login(fixture, 'admin', 'secret')).status, 429);

  now += 15 * 60 * 1000;
  assert.equal((await login(fixture, 'admin', 'secret')).status, 200);
});

test('forwarded client addresses are ignored unless exact proxy hops are trusted', async t => {
  const direct = await createAppFixture({ clock: () => 1_000 });
  t.after(direct.close);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    assert.equal((await loginFrom(direct, `198.51.100.${attempt}`)).status, 401);
  }
  assert.equal((await loginFrom(direct, '198.51.100.99', 'secret')).status, 429);

  const proxied = await createAppFixture({ clock: () => 1_000, env: { TRUST_PROXY_HOPS: '1' } });
  t.after(proxied.close);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await loginFrom(proxied, '198.51.100.1')).status, 401);
  }
  assert.equal((await loginFrom(proxied, '198.51.100.2', 'secret')).status, 200);
});

test('application enforces private and public key file modes', async t => {
  const fixture = await createAppFixture();
  t.after(fixture.close);
  const privateKey = join(fixture.dataDir, 'jwt.key');
  const publicKey = join(fixture.dataDir, 'jwt.key.pub');
  assert.equal(statSync(privateKey).mode & 0o777, 0o600);
  assert.equal(statSync(publicKey).mode & 0o777, 0o644);

  chmodSync(privateKey, 0o666);
  chmodSync(publicKey, 0o666);
  createApp({ config: fixture.config, database: fixture.database, logger: { log() {}, warn() {}, error() {} } });
  assert.equal(statSync(privateKey).mode & 0o777, 0o600);
  assert.equal(statSync(publicKey).mode & 0o777, 0o644);
});
