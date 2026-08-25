const test = require('node:test');
const assert = require('node:assert/strict');
const xml2js = require('xml2js');
const { createApp } = require('../server/app');
const { loadConfig } = require('../server/config');
const { compilePatterns, transformTitle } = require('../server/routes/rss');
const { createTestDatabase } = require('./helpers/fixtures');
const { listen } = require('./helpers/http');

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Mikan Project</title>
    <item>
      <title>[A] Alpha 01</title>
      <link>https://mikanani.me/Home/Episode/1</link>
      <pubDate>Sun, 26 Jul 2026 00:00:00 GMT</pubDate>
      <enclosure url="https://mikanani.me/Download/1.torrent" length="1" type="application/x-bittorrent" />
    </item>
    <item>
      <title>[B] Beta 07</title>
      <link>https://mikanani.me/Home/Episode/2</link>
      <pubDate>Sun, 26 Jul 2026 01:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

function pattern(overrides = {}) {
  return {
    remote: '', pattern: '\\[A\\] Alpha (?<episode>\\d+)', series: 'Alpha',
    season: '1', language: 'Chinese', quality: 'WEBDL 1080p', offset: 0,
    releasegroup: 'A', ...overrides
  };
}

async function createRssFixture(t, { xml = RSS_XML, env = {}, logger, failIncrement = false, onGet } = {}) {
  const fixture = createTestDatabase();
  const config = loadConfig({
    NODE_ENV: 'test', DATA_DIR: fixture.dataDir,
    ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'secret', ...env
  });
  const calls = [];
  const database = {
    ...fixture.database,
    incrementMatchCount() {
      throw new Error('RSS must not update one match at a time');
    },
    incrementMatchCounts(counts) {
      calls.push(new Map(counts));
      if (failIncrement) fixture.database.close();
      fixture.database.incrementMatchCounts(counts);
    }
  };
  const httpClient = { async get(url, options) { onGet?.(url, options); return { status: 200, data: xml, headers: {} }; } };
  const app = createApp({
    config, database, httpClient,
    logger: logger || { log() {}, warn() {}, error() {} }
  });
  const http = await listen(app);
  t.after(async () => {
    await new Promise(resolve => http.server.close(resolve));
    fixture.close();
  });
  return { ...fixture, ...http, config, database, calls };
}

test('RSS applies the shared Mikan policy to redirects and response bounds', async t => {
  let request;
  const fixture = await createRssFixture(t, {
    onGet(url, options) { request = { url, options }; }
  });

  const response = await fetch(`${fixture.baseUrl}/RSS/Bangumi?id=1`);

  assert.equal(response.status, 200);
  assert.equal(request.url, 'https://mikanani.me/RSS/Bangumi?id=1');
  assert.equal(request.options.maxRedirects, 3);
  assert.equal(request.options.maxContentLength, fixture.config.http.maxXmlBytes);
  assert.throws(
    () => request.options.beforeRedirect({ protocol: 'http:', hostname: '127.0.0.1', path: '/' }),
    error => error.code === 'URL_NOT_ALLOWED'
  );
});

test('compiles valid stored regexes once and skips invalid stored entries', () => {
  const compiled = compilePatterns([
    { id: 1, ...pattern() },
    { id: 2, ...pattern({ pattern: '(?<episode>' }) },
    { id: 3, ...pattern({ pattern: '(?<episode>(a+)+)' }) },
    { id: 4, ...pattern({ pattern: '[(?<episode>)]+' }) }
  ]);
  assert.equal(compiled.length, 1);
  assert.equal(transformTitle('[A] Alpha 01', compiled[0]), '[A] Alpha - S01E01 - Chinese - WEBDL 1080p');
});

test('anchors top-level alternatives around the complete source title', () => {
  const [compiled] = compilePatterns([
    { id: 1, ...pattern({ pattern: 'foo|bar(?<episode>\\d+)' }) }
  ]);
  assert.equal(transformTitle('prefixbar12', compiled), null);
  assert.equal(transformTitle('bar12', compiled), '[A] Alpha - S01E12 - Chinese - WEBDL 1080p');
});

test('does not transform or count a nonnumeric episode capture', () => {
  const [compiled] = compilePatterns([
    { id: 1, ...pattern({ pattern: '(?<episode>[A-Z]+)' }) }
  ]);
  assert.equal(transformTitle('SPECIAL', compiled), null);
});

test('rejects an episode capture that is only partially numeric', () => {
  const [compiled] = compilePatterns([
    { id: 1, ...pattern({ pattern: '(?<episode>\\d+[a-z]+)' }) }
  ]);
  assert.equal(transformTitle('12abc', compiled), null);
});

test('requires the complete episode capture to be decimal integer text', () => {
  for (const [source, title] of [
    ['(?<episode>\\s+)', '   '],
    ['(?<episode>\\d+e\\d+)', '1e2']
  ]) {
    const [compiled] = compilePatterns([{ id: 1, ...pattern({ pattern: source }) }]);
    assert.equal(transformTitle(title, compiled), null, title);
  }
});

test('skips stored Patterns with invalid offsets before transformation', () => {
  const invalidPatterns = [
    { id: 1, ...pattern({ offset: '1' }) },
    { id: 2, ...pattern({ offset: Infinity }) }
  ];
  assert.deepEqual(compilePatterns(invalidPatterns), []);
  assert.equal(transformTitle('[A] Alpha 01', {
    expression: /^(?:\[A\] Alpha (?<episode>\d+))$/,
    pattern: invalidPatterns[0]
  }), null);
});

test('RSS keeps exact title bytes and updates all Pattern counts in one aggregate', async t => {
  const fixture = await createRssFixture(t);
  const alpha = fixture.database.createPattern(pattern());
  const beta = fixture.database.createPattern(pattern({
    pattern: '\\[B\\] Beta (?<episode>\\d+)', series: 'Beta', season: '2',
    language: 'Japanese', quality: 'WEB 2160p', offset: 1, releasegroup: 'B'
  }));
  fixture.database.createPattern(pattern({ pattern: '(?<episode>' }));

  const response = await fetch(`${fixture.baseUrl}/RSS/Bangumi?token=do-not-log`);

  assert.equal(response.status, 200);
  const result = await new xml2js.Parser().parseStringPromise(await response.text());
  assert.deepEqual(result.rss.channel[0].item.map(item => item.title[0]), [
    '[A] Alpha - S01E01 - Chinese - WEBDL 1080p',
    '[B] Beta - S02E08 - Japanese - WEB 2160p'
  ]);
  assert.equal(fixture.calls.length, 1);
  assert.deepEqual([...fixture.calls[0]], [[alpha.id, 1], [beta.id, 1]]);
  assert.equal(fixture.database.getPattern(alpha.id).match_count, 1);
  assert.equal(fixture.database.getPattern(beta.id).match_count, 1);
});

test('RSS aggregates two matching items for one Pattern as count two', async t => {
  const fixture = await createRssFixture(t, {
    xml: RSS_XML.replace('[B] Beta 07', '[A] Alpha 02')
  });
  const alpha = fixture.database.createPattern(pattern());

  const response = await fetch(`${fixture.baseUrl}/RSS/Bangumi`);

  assert.equal(response.status, 200);
  assert.equal(fixture.calls.length, 1);
  assert.deepEqual([...fixture.calls[0]], [[alpha.id, 2]]);
  assert.equal(fixture.database.getPattern(alpha.id).match_count, 2);
});

test('RSS returns fixed 500 when aggregate database accounting fails', async t => {
  const logs = [];
  const logger = {
    log(...parts) { logs.push(parts.join(' ')); },
    warn(...parts) { logs.push(parts.join(' ')); },
    error(...parts) { logs.push(parts.join(' ')); }
  };
  const fixture = await createRssFixture(t, { logger, failIncrement: true });
  fixture.database.createPattern(pattern());

  const response = await fetch(`${fixture.baseUrl}/RSS/Bangumi?token=QUERY-SECRET`);

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Internal server error', code: 'REQUEST_FAILED' });
  assert.equal(logs.some(line => line.includes('QUERY-SECRET') || line.includes('token=')), false);
  assert.equal(logs.some(line => line.includes('database connection')), false);
  assert.match(logs.join('\n'), /route=\/RSS status=500 duration_ms=\d+/);
});

test('oversized upstream RSS returns a fixed 502 without content or query secrets', async t => {
  const logs = [];
  const logger = {
    log(...parts) { logs.push(parts.join(' ')); },
    warn(...parts) { logs.push(parts.join(' ')); },
    error(...parts) { logs.push(parts.join(' ')); }
  };
  const upstreamSecret = 'UPSTREAM-SECRET-CONTENT';
  const fixture = await createRssFixture(t, {
    env: { MAX_XML_BYTES: '1024' },
    xml: `<rss>${upstreamSecret}${'x'.repeat(1100)}</rss>`,
    logger
  });

  const response = await fetch(`${fixture.baseUrl}/RSS/Bangumi?token=QUERY-SECRET`);

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Upstream RSS request failed', code: 'UPSTREAM_FAILURE' });
  assert.equal(logs.some(line => line.includes(upstreamSecret)), false);
  assert.equal(logs.some(line => line.includes('QUERY-SECRET') || line.includes('token=')), false);
  assert.match(logs.join('\n'), /route=\/RSS status=502 duration_ms=\d+/);
  assert.equal(fixture.calls.length, 0);
});
