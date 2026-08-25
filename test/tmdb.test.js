const test = require('node:test');
const assert = require('node:assert/strict');
const { mapConcurrent } = require('../server/concurrency');
const { createApp } = require('../server/app');
const { loadConfig } = require('../server/config');
const { createTestDatabase, login, CookieJar } = require('./helpers/fixtures');
const { listen } = require('./helpers/http');

async function createTmdbFixture(t, { httpClient, logger } = {}) {
  const fixture = createTestDatabase();
  const config = loadConfig({
    NODE_ENV: 'test', DATA_DIR: fixture.dataDir,
    ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'secret', TMDB_API_KEY: 'tmdb-secret'
  });
  const app = createApp({
    config,
    database: fixture.database,
    httpClient,
    logger: logger || { log() {}, warn() {}, error() {} }
  });
  const http = await listen(app);
  const jar = new CookieJar();
  await login(http, 'admin', 'secret', jar);
  t.after(async () => {
    await new Promise(resolve => http.server.close(resolve));
    fixture.close();
  });
  return { ...fixture, ...http, config, cookie: jar.header() };
}

async function sync(fixture, series) {
  return fetch(`${fixture.baseUrl}/tmdb/cache/sync`, {
    method: 'POST',
    headers: {
      cookie: fixture.cookie,
      origin: fixture.baseUrl,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ series })
  });
}

test('mapConcurrent runs multiple workers but never exceeds four', async () => {
  let active = 0;
  let maximum = 0;
  const results = await mapConcurrent([1, 2, 3, 4, 5, 6, 7, 8], 4, async value => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return value * 2;
  });

  assert.equal(maximum, 4);
  assert.deepEqual(results, [2, 4, 6, 8, 10, 12, 14, 16]);
});

test('TMDB sync runs eight requests with exactly four-worker concurrency and bounded Axios options', async t => {
  let active = 0;
  let maximum = 0;
  const optionsSeen = [];
  const fixture = await createTmdbFixture(t, {
    httpClient: {
      async get(url, options) {
        active++;
        maximum = Math.max(maximum, active);
        optionsSeen.push(options);
        await new Promise(resolve => setImmediate(resolve));
        active--;
        return { data: { name: `ZH-${url.split('/').at(-1)}` } };
      }
    }
  });

  const response = await sync(fixture, Array.from({ length: 8 }, (_, index) => ({
    tmdbId: index + 1, titleEn: `Series ${index + 1}`
  })));

  assert.equal(response.status, 200);
  assert.equal((await response.json()).synced, 8);
  assert.equal(maximum, 4);
  assert.equal(optionsSeen.length, 8);
  for (const options of optionsSeen) {
    assert.equal(options.timeout, fixture.config.tmdb.timeoutMs);
    assert.equal(options.maxContentLength, fixture.config.http.maxXmlBytes);
    assert.equal(options.maxBodyLength, fixture.config.http.maxXmlBytes);
  }
});

test('TMDB transport failures are not cached and are retried', async t => {
  let calls = 0;
  const logs = [];
  const fixture = await createTmdbFixture(t, {
    httpClient: {
      async get() {
        calls++;
        if (calls === 1) throw new Error('TRANSPORT-SECRET');
        return { data: { name: 'Recovered' } };
      }
    },
    logger: {
      log(...parts) { logs.push(parts.join(' ')); },
      warn(...parts) { logs.push(parts.join(' ')); },
      error(...parts) { logs.push(parts.join(' ')); }
    }
  });
  const series = [{ tmdbId: 20, titleEn: 'Twenty' }];

  assert.equal((await sync(fixture, series)).status, 200);
  assert.deepEqual(fixture.database.getTmdbCacheByIds([20]), []);
  assert.equal((await sync(fixture, series)).status, 200);
  assert.equal(calls, 2);
  assert.equal(fixture.database.getTmdbCacheByIds([20])[0].title_zh, 'Recovered');
  assert.equal(logs.some(line => line.includes('TRANSPORT-SECRET')), false);
});

test('TMDB caches confirmed 404 negatives for one hour and retries them when stale', async t => {
  let calls = 0;
  const fixture = await createTmdbFixture(t, {
    httpClient: {
      async get() {
        calls++;
        if (calls === 1) {
          const error = new Error('not found');
          error.response = { status: 404, data: 'UPSTREAM-SECRET' };
          throw error;
        }
        return { data: { name: 'Now Found' } };
      }
    }
  });
  const series = [{ tmdbId: 30, titleEn: 'Thirty' }];

  await sync(fixture, series);
  assert.equal(fixture.database.getTmdbCacheByIds([30])[0].title_zh, null);
  await sync(fixture, series);
  assert.equal(calls, 1);

  fixture.database.raw.prepare("UPDATE tmdb_cache SET updated_at = datetime('now', '-2 hours') WHERE tmdb_id = 30").run();
  await sync(fixture, series);
  assert.equal(calls, 2);
  assert.equal(fixture.database.getTmdbCacheByIds([30])[0].title_zh, 'Now Found');
});

test('TMDB refreshes successful cache values only after thirty days', async t => {
  const calls = [];
  const fixture = await createTmdbFixture(t, {
    httpClient: {
      async get(url) {
        const id = Number(url.split('/').at(-1));
        calls.push(id);
        return { data: { name: `Fresh ${id}` } };
      }
    }
  });
  fixture.database.upsertTmdbCache(40, 'Forty', 'Recent Forty');
  fixture.database.upsertTmdbCache(41, 'Forty One', 'Old Forty One');
  fixture.database.raw.prepare("UPDATE tmdb_cache SET updated_at = datetime('now', '-31 days') WHERE tmdb_id = 41").run();

  await sync(fixture, [
    { tmdbId: 40, titleEn: 'Forty' },
    { tmdbId: 41, titleEn: 'Forty One' }
  ]);

  assert.deepEqual(calls, [41]);
  assert.equal(fixture.database.getTmdbCacheByIds([40])[0].title_zh, 'Recent Forty');
  assert.equal(fixture.database.getTmdbCacheByIds([41])[0].title_zh, 'Fresh 41');
});

test('TMDB direct routes use response bounds and fixed upstream errors', async t => {
  const calls = [];
  let fail = false;
  const fixture = await createTmdbFixture(t, {
    httpClient: {
      async get(url, options) {
        calls.push({ url, options });
        if (fail) {
          const error = new Error('UPSTREAM-SECRET');
          error.response = { status: 500, data: '<html>UPSTREAM-SECRET</html>' };
          throw error;
        }
        return { data: { ok: true } };
      }
    }
  });

  for (const path of ['/tmdb/tv/1', '/tmdb/find/2']) {
    const response = await fetch(`${fixture.baseUrl}${path}`, { headers: { cookie: fixture.cookie } });
    assert.equal(response.status, 200);
  }
  for (const { options } of calls) {
    assert.equal(options.timeout, fixture.config.tmdb.timeoutMs);
    assert.equal(options.maxContentLength, fixture.config.http.maxXmlBytes);
    assert.equal(options.maxBodyLength, fixture.config.http.maxXmlBytes);
  }

  fail = true;
  const failed = await fetch(`${fixture.baseUrl}/tmdb/tv/3`, { headers: { cookie: fixture.cookie } });
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), { error: 'TMDB upstream request failed', code: 'UPSTREAM_FAILURE' });
});

test('removed TMDB search route returns 404 promptly', async t => {
  const fixture = await createTmdbFixture(t, {
    httpClient: { async get() { throw new Error('must not run'); } }
  });
  const response = await fetch(`${fixture.baseUrl}/tmdb/search`, { headers: { cookie: fixture.cookie } });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Not found', code: 'NOT_FOUND' });
});
