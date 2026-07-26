const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createAppFixture } = require('./helpers/fixtures');

const { MikanarrApp } = require('../public/js/app');

const payload = '<img src=x onerror="globalThis.pwned=1">';

function installDom(body) {
  const dom = new JSDOM(`<!doctype html><body>${body}</body>`, {
    url: 'https://mikanarr.test/'
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.DOMParser = dom.window.DOMParser;
  global.Event = dom.window.Event;
  return dom;
}

function cleanupDom(dom) {
  dom.window.close();
  delete global.window;
  delete global.document;
  delete global.navigator;
  delete global.DOMParser;
  delete global.Event;
}

function makeApp() {
  const app = Object.create(MikanarrApp.prototype);
  app.seriesList = [];
  app.tmdbCache = {};
  app.tmdbDetails = new Map();
  app.allPatterns = [];
  app.currentView = 'table';
  app.sonarrOptions = { rootFolders: [], qualityProfiles: [] };
  return app;
}

test('Pattern table renders names and seasons as literal text', () => {
  const dom = installDom(`
    <input id="search-input" value="">
    <select id="filter-status"><option value="all" selected>all</option></select>
    <table><tbody id="pattern-table-body"></tbody></table>
    <div id="pattern-card-view"></div>
  `);
  const app = makeApp();

  app.renderPatterns([{
    id: 1,
    series: payload,
    season: payload,
    pattern: payload,
    language: 'Chinese',
    quality: 'WEBDL',
    releasegroup: payload,
    remote: ''
  }]);

  const body = document.getElementById('pattern-table-body');
  assert.equal(body.querySelector('img[src="x"]'), null);
  assert.equal(body.querySelector('[onerror]'), null);
  assert.match(body.textContent, new RegExp(payload.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(body.textContent, /S<img src=x/);

  app.renderPatternCards([{
    id: 1,
    series: payload,
    season: payload,
    language: 'Chinese',
    quality: 'WEBDL',
    remote: ''
  }]);
  const cards = document.getElementById('pattern-card-view');
  assert.equal(cards.querySelector('img[src="x"]'), null);
  assert.equal(cards.querySelector('[onerror]'), null);
  assert.match(cards.textContent, /<img src=x onerror=/);

  cleanupDom(dom);
});

test('Pattern progress normalizes hostile Sonarr statistic fields before rendering', () => {
  const dom = installDom(`
    <input id="search-input" value="">
    <select id="filter-status"><option value="all" selected>all</option></select>
    <table><tbody id="pattern-table-body"></tbody></table>
    <div id="pattern-card-view"></div>
  `);
  const app = makeApp();
  const hostileCount = '</span><form action="https://evil.example"><input name="password"></form><span>';
  app.seriesList = [{
    title: 'Series',
    seasons: [{
      seasonNumber: 1,
      statistics: { episodeCount: hostileCount, episodeFileCount: hostileCount }
    }]
  }];
  const pattern = {
    id: 1,
    series: 'Series',
    season: '1',
    pattern: 'pattern',
    language: 'Chinese',
    quality: 'WEBDL',
    releasegroup: '',
    remote: ''
  };

  app.renderPatterns([pattern]);
  app.renderPatternCards([pattern]);

  assert.equal(document.querySelector('form'), null);
  assert.match(document.getElementById('pattern-table-body').textContent, /0\/0/);
  cleanupDom(dom);
});

test('Sonarr results and options render caller-controlled fields as literal text', () => {
  const dom = installDom(`
    <div id="sonarr-search-results"></div>
    <select id="sonarr-root-folder"></select>
    <select id="sonarr-quality-profile"></select>
  `);
  const app = makeApp();
  app.searchResults = [{
    title: payload,
    year: payload,
    network: payload,
    tvdbId: 0,
    images: []
  }];
  app.currentSearchPage = 1;
  app.sonarrOptions = {
    rootFolders: [{ path: payload, freeSpace: 1024 }],
    qualityProfiles: [{ id: 1, name: payload }]
  };

  app.renderSearchResults();
  app.renderSonarrOptions();

  const results = document.getElementById('sonarr-search-results');
  assert.equal(results.querySelector('img[src="x"]'), null);
  assert.equal(results.querySelector('[onerror]'), null);
  assert.equal(results.querySelector('[onclick]'), null);
  assert.match(results.textContent, /<img src=x onerror=/);
  assert.equal(document.querySelector('#sonarr-root-folder option:nth-child(2)').textContent, `${payload} (1 KiB Free)`);
  assert.equal(document.querySelector('#sonarr-quality-profile option').textContent, payload);

  cleanupDom(dom);
});

test('RSS request errors are rendered as literal text', async () => {
  const dom = installDom(`
    <input id="remote" value="https://mikanani.me/RSS/test">
    <div id="rss-preview"></div>
  `);
  const app = makeApp();
  app.rssItems = [];
  app.apiRequest = async () => { throw new Error(payload); };

  const originalError = console.error;
  console.error = () => {};
  try {
    await app.loadRssPreview();
  } finally {
    console.error = originalError;
  }

  const preview = document.getElementById('rss-preview');
  assert.equal(preview.querySelector('img'), null);
  assert.equal(preview.querySelector('[onerror]'), null);
  assert.match(preview.textContent, /<img src=x onerror=/);

  cleanupDom(dom);
});

test('TMDB and Sonarr posters use the authenticated same-origin image proxy', async () => {
  const dom = installDom(`
    <div id="tmdb"><div class="pattern-card-poster"><img></div></div>
    <div id="sonarr"><div class="pattern-card-poster"><img></div></div>
  `);
  const app = makeApp();
  app.apiRequest = async () => ({
    ok: true,
    json: async () => ({ poster_path: '/poster.jpg' })
  });

  const tmdbCard = document.getElementById('tmdb');
  await app.loadCardPoster(tmdbCard, { tmdbId: 42, images: [] });
  assert.equal(
    tmdbCard.querySelector('img').getAttribute('src'),
    `/api/image-proxy?url=${encodeURIComponent('https://image.tmdb.org/t/p/w154/poster.jpg')}`
  );

  const sonarrCard = document.getElementById('sonarr');
  await app.loadCardPoster(sonarrCard, {
    images: [{ coverType: 'poster', remoteUrl: 'https://sonarr.example/poster.jpg' }]
  });
  assert.equal(
    sonarrCard.querySelector('img').getAttribute('src'),
    `/api/image-proxy?url=${encodeURIComponent('https://sonarr.example/poster.jpg')}`
  );

  cleanupDom(dom);
});

test('card posters fall back to Sonarr when TMDB details fail', async () => {
  const dom = installDom('<div id="card"><div class="pattern-card-poster"><img></div></div>');
  const app = makeApp();
  app.apiRequest = async () => { throw new Error('TMDB unavailable'); };

  const card = document.getElementById('card');
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await app.loadCardPoster(card, {
      tmdbId: 42,
      images: [{ coverType: 'poster', remoteUrl: 'https://sonarr.example/fallback.jpg' }]
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(
    card.querySelector('img').getAttribute('src'),
    `/api/image-proxy?url=${encodeURIComponent('https://sonarr.example/fallback.jpg')}`
  );
  cleanupDom(dom);
});

test('startup authenticates with the Cookie session endpoint before loading data', async () => {
  const dom = installDom(`
    <div id="login-container"></div>
    <div id="main-container" class="d-none"></div>
  `);
  const app = makeApp();
  let sessionCalls = 0;
  let loads = 0;
  app.client = {
    session: async () => { sessionCalls += 1; return { user: { username: 'user' } }; }
  };
  app.initView = () => {};
  app.loadConfig = async () => { loads += 1; };
  app.loadPatterns = async () => { loads += 1; };
  app.loadSeries = async () => { loads += 1; };

  await app.checkAuth();

  assert.equal(sessionCalls, 1);
  assert.equal(loads, 3);
  assert.equal(document.getElementById('login-container').classList.contains('d-none'), true);
  assert.equal(document.getElementById('main-container').classList.contains('d-none'), false);
  cleanupDom(dom);
});

test('unauthenticated startup resets once and checks OIDC config once', async () => {
  const dom = installDom('');
  const app = makeApp();
  let resets = 0;
  let configChecks = 0;
  app.showLoggedOut = () => { resets += 1; };
  app.checkOidcConfig = async () => { configChecks += 1; };
  app.client = {
    session: async () => {
      const error = new Error('Unauthorized');
      error.status = 401;
      throw error;
    }
  };

  await app.start();

  assert.equal(resets, 1);
  assert.equal(configChecks, 1);
  cleanupDom(dom);
});

test('later session expiry restores the OIDC login path', async () => {
  const dom = installDom('');
  const app = makeApp();
  let resets = 0;
  let configChecks = 0;
  app.showLoggedOut = () => { resets += 1; };
  app.checkOidcConfig = async () => { configChecks += 1; };

  await app.handleAuthExpired();

  assert.equal(resets, 1);
  assert.equal(configChecks, 1);
  cleanupDom(dom);
});

test('login and logout change the visible session state only after successful Cookie requests', async () => {
  const dom = installDom(`
    <form id="login-form"></form>
    <input id="username" value="user">
    <input id="password" value="password">
    <div id="login-error" class="d-none"></div>
    <div id="login-container"></div>
    <div id="main-container" class="d-none"></div>
  `);
  const app = makeApp();
  let loginShouldFail = true;
  let logoutCalls = 0;
  let logoutConfigOptions;
  app.client = {
    login: async credentials => {
      assert.deepEqual(credentials, { username: 'user', password: 'password' });
      if (loginShouldFail) throw new Error('rejected');
      return { user: { username: 'user' } };
    },
    logout: async () => { logoutCalls += 1; }
  };
  app.showAuthenticated = () => {
    document.getElementById('login-container').classList.add('d-none');
    document.getElementById('main-container').classList.remove('d-none');
  };
  app.loadAuthenticatedData = async () => {};
  app.checkOidcConfig = async options => { logoutConfigOptions = options; };

  await app.handleLogin({ preventDefault() {} });
  assert.equal(document.getElementById('main-container').classList.contains('d-none'), true);

  loginShouldFail = false;
  await app.handleLogin({ preventDefault() {} });
  assert.equal(document.getElementById('main-container').classList.contains('d-none'), false);

  await app.handleLogout();
  assert.equal(logoutCalls, 1);
  assert.equal(document.getElementById('main-container').classList.contains('d-none'), true);
  assert.equal(document.getElementById('login-container').classList.contains('d-none'), false);
  assert.deepEqual(logoutConfigOptions, { allowAutoLogin: false });
  cleanupDom(dom);
});

test('logout-mode OIDC config reveals SSO without forcing auto-login', async () => {
  const dom = installDom('<div id="oidc-login-container" class="d-none"></div>');
  const app = makeApp();
  app.apiRequest = async () => ({
    ok: true,
    json: async () => ({ oidcEnabled: true, oidcAutoLogin: true })
  });
  const originalLog = console.log;
  console.log = () => {};
  try {
    await app.checkOidcConfig({ allowAutoLogin: false });
  } finally {
    console.log = originalLog;
  }

  assert.equal(document.getElementById('oidc-login-container').classList.contains('d-none'), false);
  cleanupDom(dom);
});

test('apiRequest delegates to the Cookie client without owning a JWT', async () => {
  const app = makeApp();
  const calls = [];
  const expected = { ok: true };
  app.client = {
    request: async (url, options) => {
      calls.push({ url, options });
      return expected;
    }
  };

  assert.equal(await app.apiRequest('/api/patterns', { method: 'POST' }), expected);
  assert.deepEqual(calls, [{ url: '/api/patterns', options: { method: 'POST' } }]);
  assert.equal(Object.hasOwn(app, 'token'), false);
});

test('card checkboxes drive batch selection in card view', () => {
  const dom = installDom(`
    <input id="select-all" type="checkbox">
    <button id="batch-delete-btn" class="d-none"></button>
    <button id="batch-fix-btn" class="d-none"></button>
    <span id="selected-count"></span>
    <input class="row-checkbox" data-id="1" type="checkbox">
    <input class="card-checkbox" data-id="2" type="checkbox" checked>
  `);
  const app = makeApp();
  app.currentView = 'card';

  app.updateBatchUI();

  assert.equal(document.getElementById('selected-count').textContent, '1');
  assert.equal(document.getElementById('batch-delete-btn').classList.contains('d-none'), false);
  cleanupDom(dom);
});

test('last_matched_at sort is forwarded to the Pattern request', async () => {
  const dom = installDom('<input id="search-input" value="">');
  const app = makeApp();
  let requestedUrl;
  app.currentSort = { field: 'last_matched_at', direction: 'asc' };
  app.showSkeletonLoading = () => {};
  app.filterPatterns = () => {};
  app.updateSortIndicators = () => {};
  app.apiRequest = async url => {
    requestedUrl = url;
    return { ok: true, json: async () => [] };
  };

  await app.loadPatterns();

  assert.equal(requestedUrl, '/api/patterns?sortBy=last_matched_at&order=asc');
  cleanupDom(dom);
});

test('import cancel resolves its own modal when the page has another cancel button', async () => {
  const dom = installDom('<button id="cancel-btn" type="button">page cancel</button>');
  const app = makeApp();

  const result = app.showImportModeDialog();
  document.querySelector('#import-modal [data-import-action="cancel"]').click();
  const value = await Promise.race([
    result,
    new Promise(resolve => setTimeout(() => resolve('timed out'), 20))
  ]);
  if (value === 'timed out') {
    document.querySelector('body > #cancel-btn').click();
    await result;
  }

  assert.equal(value, null);
  cleanupDom(dom);
});

test('two cards sharing a TMDB id make one detail request', async () => {
  const dom = installDom(`
    <div id="first"><div class="pattern-card-poster"><img></div></div>
    <div id="second"><div class="pattern-card-poster"><img></div></div>
  `);
  const app = makeApp();
  let requests = 0;
  app.apiRequest = async () => {
    requests += 1;
    return { ok: true, json: async () => ({ poster_path: '/shared.jpg' }) };
  };
  const series = { tmdbId: 42, images: [] };

  await Promise.all([
    app.loadCardPoster(document.getElementById('first'), series),
    app.loadCardPoster(document.getElementById('second'), series)
  ]);

  assert.equal(requests, 1);
  cleanupDom(dom);
});

test('TMDB sync failures fall back to the existing cache', async () => {
  const app = makeApp();
  const calls = [];
  app.apiRequest = async url => {
    calls.push(url);
    if (url === '/tmdb/cache/sync') throw new Error('sync failed');
    return { ok: true, json: async () => ({ 42: '中文名' }) };
  };
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  console.error = console.warn = console.log = () => {};
  try {
    await app.syncTmdbCache([{ tmdbId: 42, title: 'Series' }]);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
    console.log = originalLog;
  }

  assert.deepEqual(calls, ['/tmdb/cache/sync', '/tmdb/cache']);
  assert.deepEqual(app.tmdbCache, { 42: '中文名' });
});

test('TMDB sync authorization failures do not trigger a second protected request', async () => {
  const app = makeApp();
  const calls = [];
  app.apiRequest = async url => {
    calls.push(url);
    const error = new Error('Unauthorized');
    error.status = 401;
    throw error;
  };
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  console.error = console.warn = console.log = () => {};
  try {
    await app.syncTmdbCache([{ tmdbId: 42, title: 'Series' }]);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
    console.log = originalLog;
  }

  assert.deepEqual(calls, ['/tmdb/cache/sync']);
});

test('filtering renders only the visible view', () => {
  const dom = installDom(`
    <select id="filter-status"><option value="all" selected>all</option></select>
    <input id="search-input" value="">
    <input id="select-all" type="checkbox">
    <button id="batch-delete-btn" class="d-none"></button>
    <button id="batch-fix-btn" class="d-none"></button>
    <span id="selected-count"></span>
  `);
  const app = makeApp();
  app.currentView = 'card';
  app.allPatterns = [{ id: 1, series: 'Series', pattern: 'pattern', releasegroup: '' }];
  let tableRenders = 0;
  let cardRenders = 0;
  app.renderPatterns = () => { tableRenders += 1; };
  app.renderPatternCards = () => { cardRenders += 1; };

  app.filterPatterns('');

  assert.equal(tableRenders, 0);
  assert.equal(cardRenders, 1);
  cleanupDom(dom);
});

test('Series completion redraws locally without a second Pattern request', async () => {
  const dom = installDom(`
    <input id="search-input" value="Series">
    <select id="filter-status"><option value="not-found" selected>not found</option></select>
    <input id="select-all" type="checkbox">
    <button id="batch-delete-btn" class="d-none"></button>
    <button id="batch-fix-btn" class="d-none"></button>
    <span id="selected-count"></span>
  `);
  const app = makeApp();
  const series = [{ title: 'Series', tmdbId: 42 }];
  let patternFetches = 0;
  let renderedPatterns;
  app.allPatterns = [{ id: 1, series: 'Series', pattern: 'pattern', releasegroup: '' }];
  app.currentView = 'card';
  app.apiRequest = async url => {
    assert.equal(url, '/sonarr/api/v3/series');
    return { ok: true, status: 200, json: async () => series };
  };
  app.syncTmdbCache = async () => {};
  app.renderSeriesOptions = () => {};
  app.loadPatterns = () => { patternFetches += 1; };
  app.renderCurrentView = patterns => { renderedPatterns = patterns; };

  const originalLog = console.log;
  console.log = () => {};
  try {
    await app.loadSeries();
  } finally {
    console.log = originalLog;
  }

  assert.equal(patternFetches, 0);
  assert.deepEqual(renderedPatterns, []);
  cleanupDom(dom);
});

test('failed batch fixes do not mutate local Pattern state', async () => {
  const dom = installDom('<input class="row-checkbox" data-id="1" type="checkbox" checked>');
  const app = makeApp();
  app.currentView = 'table';
  app.allPatterns = [{ id: 1, series: 'series' }];
  app.seriesList = [{ title: 'Series' }];
  app.apiRequest = async () => { throw new Error('update failed'); };

  const update = app.batchFix();
  document.querySelector('#confirm-ok').click();
  await update;

  assert.equal(app.allPatterns[0].series, 'series');
  cleanupDom(dom);
});

test('browser responses set the restrictive security headers', async t => {
  const fixture = await createAppFixture();
  t.after(fixture.close);

  const response = await fetch(`${fixture.baseUrl}/`);

  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('content-security-policy'), [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "font-src 'self' https://cdn.jsdelivr.net data:",
    "form-action 'self'"
  ].join('; '));
  const permissions = response.headers.get('permissions-policy');
  assert.match(permissions, /camera=\(\)/);
  assert.match(permissions, /geolocation=\(\)/);
  assert.match(permissions, /microphone=\(\)/);
});

test('HTML pins CDN assets without inline script handlers and names icon controls', async t => {
  const fixture = await createAppFixture();
  t.after(fixture.close);
  const response = await fetch(`${fixture.baseUrl}/`);
  const dom = new JSDOM(await response.text());
  const document = dom.window.document;

  assert.equal(document.querySelector('meta[name="viewport"]').content, 'width=device-width, initial-scale=1.0');
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
  assert.deepEqual(styles.slice(0, 2).map(link => [link.getAttribute('href'), link.getAttribute('integrity'), link.crossOrigin]), [
    [
      'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css',
      'sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB',
      'anonymous'
    ],
    [
      'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css',
      'sha384-CK2SzKma4jA5H/MXDUU7i1TqZlCFaD4T01vtyDFvPlD97JQyS+IsSh1nI2EFbpyk',
      'anonymous'
    ]
  ]);
  const scripts = Array.from(document.querySelectorAll('script'));
  assert.deepEqual(scripts.map(script => script.getAttribute('src')), [
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js',
    '/js/ui.js',
    '/js/api.js',
    '/js/app.js'
  ]);
  assert.equal(scripts[0].getAttribute('integrity'), 'sha384-FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI');
  assert.equal(scripts[0].crossOrigin, 'anonymous');
  assert.equal(document.querySelector('[onclick], [onerror]'), null);
  assert.equal(document.querySelector('script:not([src])'), null);

  const unnamedIconControls = Array.from(document.querySelectorAll('button, label'))
    .filter(control => !control.textContent.trim() && control.querySelector('i, .navbar-toggler-icon'))
    .filter(control => !control.getAttribute('aria-label'));
  assert.deepEqual(unnamedIconControls, []);
  dom.window.close();
});
