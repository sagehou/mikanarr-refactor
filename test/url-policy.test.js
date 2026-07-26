const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MIKAN_POLICY,
  IMAGE_POLICY,
  parseAllowedUrl,
  boundedAxiosOptions
} = require('../server/urlPolicy');

test('image policy allows the four existing hosts and dot-boundary subdomains', () => {
  for (const hostname of [
    'mikanani.me',
    'cdn.mikanani.me',
    'artworks.thetvdb.com',
    'cdn.artworks.thetvdb.com',
    'image.tmdb.org',
    'cdn.image.tmdb.org',
    'thetvdb.com',
    'cdn.thetvdb.com'
  ]) {
    assert.equal(parseAllowedUrl(`https://${hostname}/poster.jpg`, IMAGE_POLICY).hostname, hostname);
  }
});

test('image policy rejects prefix and sibling host attacks', () => {
  for (const raw of [
    'https://evilthetvdb.com/poster.jpg',
    'https://image.tmdb.org.evil.example/poster.jpg',
    'https://thetvdb.com@127.0.0.1/poster.jpg'
  ]) {
    assert.throws(
      () => parseAllowedUrl(raw, IMAGE_POLICY),
      error => error.code === 'URL_NOT_ALLOWED',
      raw
    );
  }
});

test('security policies and their host lists are immutable', () => {
  assert.equal(Object.isFrozen(MIKAN_POLICY), true);
  assert.equal(Object.isFrozen(MIKAN_POLICY.exactHosts), true);
  assert.equal(Object.isFrozen(IMAGE_POLICY), true);
  assert.equal(Object.isFrozen(IMAGE_POLICY.parentDomains), true);
});

for (const blocked of [
  'https://mikanani.me.evil.example/rss',
  'https://mikanani.me@127.0.0.1/private',
  'http://mikanani.me/rss',
  'https://mikanani.me:444/rss'
]) {
  test(`rejects ${blocked}`, () => {
    assert.throws(
      () => parseAllowedUrl(blocked, MIKAN_POLICY),
      error => error.code === 'URL_NOT_ALLOWED'
    );
  });
}

test('allows exact Mikan HTTPS', () => {
  assert.equal(
    parseAllowedUrl('https://mikanani.me/RSS/Bangumi?id=1', MIKAN_POLICY).hostname,
    'mikanani.me'
  );
});

test('rejects a disallowed redirect destination before the next request', () => {
  const options = boundedAxiosOptions(MIKAN_POLICY, {
    http: { timeoutMs: 2345, maxXmlBytes: 4096 }
  });

  assert.throws(
    () => options.beforeRedirect({
      protocol: 'http:', hostname: '169.254.169.254', port: '', path: '/latest/meta-data'
    }),
    error => error.code === 'URL_NOT_ALLOWED'
  );
  assert.equal(options.timeout, 2345);
  assert.equal(options.maxRedirects, 3);
  assert.equal(options.maxContentLength, 4096);
  assert.equal(options.maxBodyLength, 4096);
});

test('redirect validation uses the destination href after Axios applies a proxy', () => {
  const { beforeRedirect } = boundedAxiosOptions(MIKAN_POLICY, {
    http: { timeoutMs: 2345, maxXmlBytes: 4096 }
  });

  assert.doesNotThrow(() => beforeRedirect({
    protocol: 'http:',
    hostname: 'proxy.internal',
    port: '8080',
    path: 'https://mikanani.me/next',
    href: 'https://mikanani.me/next'
  }));
  assert.throws(
    () => beforeRedirect({
      protocol: 'http:',
      hostname: 'proxy.internal',
      port: '8080',
      path: 'http://169.254.169.254/latest/meta-data',
      href: 'http://169.254.169.254/latest/meta-data'
    }),
    error => error.code === 'URL_NOT_ALLOWED'
  );
});
