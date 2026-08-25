const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../server/app');
const { loadConfig } = require('../server/config');
const { createSonarrRouter } = require('../server/routes/sonarr');
const { createTestDatabase, login, CookieJar } = require('./helpers/fixtures');
const { listen } = require('./helpers/http');

test('Sonarr proxy wires production TLS verification through the proxy event API', () => {
  let options;
  createSonarrRouter({
    config: {
      http: { timeoutMs: 4321 },
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
  assert.equal(options.timeout, 4321);
  assert.equal(options.proxyTimeout, 4321);
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
        cookie: req.headers.cookie,
        authorization: req.headers.authorization,
        proxyAuthorization: req.headers['proxy-authorization'],
        body: Buffer.concat(chunks).toString('utf8')
      };
      res.setHeader('content-type', 'application/json');
      res.setHeader('set-cookie', 'upstream-session=UPSTREAM-COOKIE-SECRET; Path=/');
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

  const response = await fetch(
    `${appHttp.baseUrl}/sonarr/api/v3/series?token=BROWSER-SECRET-1&token=BROWSER-SECRET-2&ToKeN=BROWSER-SECRET-3&apikey=INBOUND-KEY-1&apikey=INBOUND-KEY-2&ApiKey=INBOUND-KEY-3&term=kept`,
    {
      method: 'POST',
      headers: {
        cookie: `${jar.header()}; browser-sentinel=BROWSER-COOKIE-SECRET`,
        authorization: 'Bearer BROWSER-AUTH-SECRET',
        'proxy-authorization': 'Basic BROWSER-PROXY-AUTH-SECRET',
        'x-api-key': 'INBOUND-X-API-KEY-SECRET',
        origin: appHttp.baseUrl,
        'content-type': 'application/json'
      },
      body: '{"streamed":true}'
    }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(received, {
    url: '/api/v3/series?term=kept',
    apiKey: 'sonarr-secret',
    cookie: undefined,
    authorization: undefined,
    proxyAuthorization: undefined,
    body: '{"streamed":true}'
  });
  assert.equal(response.headers.has('set-cookie'), false);
  const poster = await fetch(`${appHttp.baseUrl}/sonarr/MediaCover/8/poster.jpg?width=200`, {
    headers: {
      cookie: `${jar.header()}; poster-sentinel=POSTER-COOKIE-SECRET`,
      authorization: 'Bearer POSTER-AUTH-SECRET'
    }
  });
  assert.equal(poster.status, 200);
  assert.equal(poster.headers.has('set-cookie'), false);
  assert.deepEqual(received, {
    url: '/MediaCover/8/poster.jpg?width=200',
    apiKey: 'sonarr-secret',
    cookie: undefined,
    authorization: undefined,
    proxyAuthorization: undefined,
    body: ''
  });
  assert.equal(logs.some(line => /sonarr-secret|BROWSER-SECRET|POSTER-.*-SECRET|INBOUND-(?:KEY|X-API-KEY)|token=|apikey=|term=/.test(line)), false);
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

test('Sonarr terminates a partial downstream response when upstream disconnects', async t => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.write('partial');
    setTimeout(() => res.destroy(), 25);
  });
  const upstreamHttp = await listen(upstream);
  const databaseFixture = createTestDatabase();
  const config = loadConfig({
    NODE_ENV: 'test', DATA_DIR: databaseFixture.dataDir,
    ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'secret',
    SONARR_HOST: upstreamHttp.baseUrl, SONARR_API_KEY: 'sonarr-secret'
  });
  const appHttp = await listen(createApp({
    config,
    database: databaseFixture.database,
    logger: { log() {}, warn() {}, error() {} }
  }));
  t.after(async () => {
    await new Promise(resolve => appHttp.server.close(resolve));
    await new Promise(resolve => upstreamHttp.server.close(resolve));
    databaseFixture.close();
  });
  const jar = new CookieJar();
  await login(appHttp, 'admin', 'secret', jar);
  const signal = AbortSignal.timeout(1000);

  const response = await fetch(`${appHttp.baseUrl}/sonarr/partial`, {
    headers: { cookie: jar.header() },
    signal
  });
  assert.equal(response.status, 200);
  const outcome = await response.text().then(
    value => ({ value }),
    error => ({ error })
  );

  assert.ok(outcome.error, `unexpected completed body: ${outcome.value}`);
  assert.equal(signal.aborted, false, 'response ended only because the one-second test bound aborted it');
});
