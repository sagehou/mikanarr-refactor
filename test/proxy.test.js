const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createApp } = require('../server/app');
const { loadConfig } = require('../server/config');
const { createTestDatabase, login } = require('./helpers/fixtures');
const { listen } = require('./helpers/http');

async function createProxyFixture(t, { httpClient, env = {}, logger } = {}) {
  const fixture = createTestDatabase();
  const config = loadConfig({
    NODE_ENV: 'test', DATA_DIR: fixture.dataDir,
    ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'secret', ...env
  });
  const app = createApp({
    config,
    database: fixture.database,
    httpClient,
    logger: logger || { log() {}, warn() {}, error() {} }
  });
  const http = await listen(app);
  const jar = { cookies: '', set(response) { this.cookies = response.headers.get('set-cookie').split(';')[0]; }, header() { return this.cookies; } };
  await login(http, 'admin', 'secret', jar);
  t.after(async () => {
    await new Promise(resolve => http.server.close(resolve));
    fixture.close();
  });
  return { ...http, cookie: jar.header() };
}

test('Mikan proxy rejects prefix-host and userinfo bypasses before HTTP', async t => {
  let calls = 0;
  const fixture = await createProxyFixture(t, {
    httpClient: { async get() { calls++; return { data: '<rss />', headers: {} }; } }
  });

  for (const raw of [
    'https://mikanani.me.evil.example/rss',
    'https://mikanani.me@127.0.0.1/private'
  ]) {
    const response = await fetch(`${fixture.baseUrl}/proxy?url=${encodeURIComponent(raw)}`, {
      headers: { cookie: fixture.cookie }
    });
    assert.equal(response.status, 403, raw);
    assert.deepEqual(await response.json(), { error: 'URL not allowed', code: 'URL_NOT_ALLOWED' });
  }
  assert.equal(calls, 0);
});

test('Mikan proxy never exposes upstream bodies, query secrets, or error details', async t => {
  const logs = [];
  const secret = 'UPSTREAM-HTML-SECRET';
  const fixture = await createProxyFixture(t, {
    httpClient: {
      async get() {
        const error = new Error(`request failed with ${secret}`);
        error.response = { status: 418, data: `<html>${secret}</html>` };
        throw error;
      }
    },
    logger: {
      log(...parts) { logs.push(parts.join(' ')); },
      warn(...parts) { logs.push(parts.join(' ')); },
      error(...parts) { logs.push(parts.join(' ')); }
    }
  });

  const response = await fetch(`${fixture.baseUrl}/proxy?url=${encodeURIComponent('https://mikanani.me/rss?token=QUERY-SECRET')}`, {
    headers: { cookie: fixture.cookie }
  });

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Upstream request failed', code: 'UPSTREAM_FAILURE' });
  assert.equal(logs.some(line => line.includes(secret) || line.includes('QUERY-SECRET') || line.includes('token=')), false);
  assert.match(logs.join('\n'), /route=\/proxy status=502 bytes=0 duration_ms=\d+/);
});

test('image proxy rejects non-image content without exposing its body', async t => {
  const secret = 'UPSTREAM-HTML-SECRET';
  const upstream = Readable.from([`<html>${secret}</html>`]);
  const fixture = await createProxyFixture(t, {
    httpClient: {
      async get() {
        return { data: upstream, headers: { 'content-type': 'text/html' } };
      }
    }
  });

  const response = await fetch(`${fixture.baseUrl}/api/image-proxy?url=${encodeURIComponent('https://image.tmdb.org/poster.jpg')}`, {
    headers: { cookie: fixture.cookie }
  });

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Upstream image request failed', code: 'UPSTREAM_FAILURE' });
  assert.equal(upstream.destroyed, true);
});

test('image proxy stops the upstream and client streams at the byte cap', async t => {
  let produced = 0;
  const upstream = new Readable({
    read() {
      setImmediate(() => {
        if (this.destroyed) return;
        produced++;
        this.push(Buffer.alloc(256, produced));
        if (produced === 100) this.push(null);
      });
    }
  });
  const fixture = await createProxyFixture(t, {
    env: { MAX_IMAGE_BYTES: '1024' },
    httpClient: {
      async get() {
        return { data: upstream, headers: { 'content-type': 'image/png' } };
      }
    }
  });

  const response = await fetch(`${fixture.baseUrl}/api/image-proxy?url=${encodeURIComponent('https://image.tmdb.org/poster.png')}`, {
    headers: { cookie: fixture.cookie }
  });

  await assert.rejects(() => response.arrayBuffer());
  assert.equal(upstream.destroyed, true);
  assert.ok(produced < 100, `produced ${produced} chunks`);
  assert.equal(response.headers.get('cache-control'), 'private, max-age=86400');
  assert.equal(response.headers.get('content-type'), 'image/png');
});

test('global request errors use fixed JSON without query or body details', async t => {
  const logs = [];
  const fixture = await createProxyFixture(t, {
    httpClient: { async get() { throw new Error('must not run'); } },
    logger: {
      log(...parts) { logs.push(parts.join(' ')); },
      warn(...parts) { logs.push(parts.join(' ')); },
      error(...parts) { logs.push(parts.join(' ')); }
    }
  });
  const response = await fetch(`${fixture.baseUrl}/api/patterns?token=QUERY-SECRET`, {
    method: 'POST',
    headers: {
      cookie: fixture.cookie,
      origin: fixture.baseUrl,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ value: `BODY-SECRET${'x'.repeat(300000)}` })
  });

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' });
  assert.equal(logs.some(line => /QUERY-SECRET|BODY-SECRET|token=/.test(line)), false);
  assert.match(logs.join('\n'), /route=\/api\/patterns status=413/);
});
