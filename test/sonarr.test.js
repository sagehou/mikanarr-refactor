const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../server/app');
const { loadConfig } = require('../server/config');
const { createSonarrRouter } = require('../server/routes/sonarr');
const { createTestDatabase, login, CookieJar } = require('./helpers/fixtures');
const { listen } = require('./helpers/http');

test('Sonarr proxy wires production TLS verification through the v3 event API', () => {
  let options;
  createSonarrRouter({
    config: {
      sonarr: {
        host: 'https://sonarr.example', apiKey: 'sonarr-secret', tlsInsecure: false
      }
    },
    verifyToken(req, res, next) { next(); },
    logger: { log() {}, error() {} },
    proxyMiddleware(value) {
      options = value;
      return (req, res) => res.end();
    }
  });

  assert.equal(options.secure, true);
  assert.equal(typeof options.on.proxyReq, 'function');
  assert.equal(typeof options.on.error, 'function');
});

test('Sonarr sends only the header API key and preserves streamed request bodies', async t => {
  let received;
  const upstream = http.createServer((req, res) => {
    if (req.url.startsWith('/fail')) {
      req.socket.destroy();
      return;
    }
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      received = {
        url: req.url,
        apiKey: req.headers['x-api-key'],
        body: Buffer.concat(chunks).toString('utf8')
      };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
  });
  const upstreamHttp = await listen(upstream);
  const databaseFixture = createTestDatabase();
  const logs = [];
  const config = loadConfig({
    NODE_ENV: 'test', DATA_DIR: databaseFixture.dataDir,
    ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'secret',
    SONARR_HOST: upstreamHttp.baseUrl, SONARR_API_KEY: 'sonarr-secret'
  });
  const app = createApp({
    config,
    database: databaseFixture.database,
    logger: {
      log(...parts) { logs.push(parts.join(' ')); },
      warn(...parts) { logs.push(parts.join(' ')); },
      error(...parts) { logs.push(parts.join(' ')); }
    }
  });
  const appHttp = await listen(app);
  t.after(async () => {
    await new Promise(resolve => appHttp.server.close(resolve));
    await new Promise(resolve => upstreamHttp.server.close(resolve));
    databaseFixture.close();
  });
  const jar = new CookieJar();
  await login(appHttp, 'admin', 'secret', jar);

  const response = await fetch(`${appHttp.baseUrl}/sonarr/api/v3/series?token=BROWSER-SECRET&apikey=INBOUND-KEY&term=kept`, {
    method: 'POST',
    headers: {
      cookie: jar.header(),
      origin: appHttp.baseUrl,
      'content-type': 'application/json'
    },
    body: '{"streamed":true}'
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(received, {
    url: '/api/v3/series?term=kept',
    apiKey: 'sonarr-secret',
    body: '{"streamed":true}'
  });
  assert.equal(logs.some(line => /sonarr-secret|BROWSER-SECRET|INBOUND-KEY|token=|apikey=|term=/.test(line)), false);
  assert.match(logs.join('\n'), /method=POST path=\/sonarr\/api\/v3\/series status=200 duration_ms=\d+/);

  const failed = await fetch(`${appHttp.baseUrl}/sonarr/fail?token=ERROR-QUERY-SECRET`, {
    headers: { cookie: jar.header() }
  });
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), { error: 'Sonarr upstream request failed', code: 'UPSTREAM_FAILURE' });
  assert.equal(logs.some(line => /ERROR-QUERY-SECRET|token=/.test(line)), false);
  assert.match(logs.join('\n'), /method=GET path=\/sonarr\/fail status=502 duration_ms=\d+/);
});

test('production Sonarr TLS verification is enabled unless explicitly disabled', () => {
  const base = {
    NODE_ENV: 'production', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'secret',
    SONARR_HOST: 'https://sonarr.example', SONARR_API_KEY: 'sonarr-secret'
  };
  assert.equal(loadConfig(base).sonarr.tlsInsecure, false);
  assert.equal(loadConfig({ ...base, SONARR_TLS_INSECURE: 'true' }).sonarr.tlsInsecure, true);
});
