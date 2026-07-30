const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');
const { createAppFixture } = require('./helpers/fixtures');

const { MikanarrApp } = require('../public/js/app');
const { createClient } = require('../public/js/api');

const payload = '<img src=x onerror="globalThis.pwned=1">';

test('refined application shell preserves semantic login and navigation structure', () => {
  const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');
  const dom = new JSDOM(html);
  const document = dom.window.document;
  assert.ok(document.getElementById('login-container').classList.contains('login-shell'));
  assert.equal(document.querySelector('#login-container > .login-ambient').getAttribute('aria-hidden'), 'true');
  assert.ok(document.getElementById('main-container').classList.contains('app-shell'));
  assert.ok(document.querySelector('nav').classList.contains('app-navbar'));
  assert.ok(document.querySelector('#main-container > .app-content'));
  assert.equal(document.querySelector('#oidc-login-container > .login-divider').textContent.trim(), '或');
  assert.equal(document.querySelector('meta[name="theme-color"]').content, '#a86f4c');
  dom.window.close();
});

test('Pattern workspace groups summary discovery and data actions', () => {
  const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');
  const dom = new JSDOM(html);
  const document = dom.window.document;
  assert.ok(document.querySelector('.pattern-page-heading'));
  assert.deepEqual(
    Array.from(document.querySelectorAll('.pattern-summary-value')).map(node => node.id),
    ['pattern-total-count', 'pattern-issue-count', 'pattern-summary-selected']
  );
  assert.ok(document.querySelector('.pattern-toolbar-discovery #search-input'));
  assert.ok(document.querySelector('.pattern-toolbar-actions #new-pattern-btn'));
  assert.ok(document.getElementById('batch-actions').classList.contains('d-none'));
  assert.equal(document.querySelector('#filter-status').hasAttribute('style'), false);
  assert.equal(document.querySelector('#search-input').hasAttribute('style'), false);
  dom.window.close();
});

test('Pattern editor groups four workflows and a responsive preview', () => {
  const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const sections = Array.from(document.querySelectorAll('#pattern-form > .editor-section'));
  assert.deepEqual(sections.map(section => section.dataset.section), ['source', 'matching', 'mapping', 'output']);
  assert.deepEqual(sections.map(section => Array.from(section.querySelectorAll('input, select, textarea'), field => field.id)), [
    ['mikan-import', 'remote'],
    ['pattern'],
    ['series', 'season'],
    ['language', 'quality', 'offset', 'releasegroup', 'proxy-url']
  ]);
  for (const section of sections) assert.ok(document.getElementById(section.getAttribute('aria-labelledby')));
  assert.ok(document.querySelector('.editor-preview-panel #rss-preview'));
  assert.ok(document.querySelector('.editor-actions #save-btn'));
  assert.equal(document.querySelector('.editor-preview-panel').hasAttribute('style'), false);
  dom.window.close();
});

function installDom(body) {
  const dom = new JSDOM(`<!doctype html><body>${body}</body>`, {
    url: 'https://mikanarr.test/'
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.DOMParser = dom.window.DOMParser;
  global.Event = dom.window.Event;
  global.localStorage = dom.window.localStorage;
  return dom;
}

function cleanupDom(dom) {
  dom.window.close();
  delete global.window;
  delete global.document;
  delete global.navigator;
  delete global.DOMParser;
  delete global.Event;
  delete global.localStorage;
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function makeApp() {
  const app = Object.create(MikanarrApp.prototype);
  app.seriesList = [];
  app.seriesLoadGeneration = 0;
  app.patternLoadGeneration = 0;
  app.patternLoadingGeneration = null;
  app.tmdbCache = {};
  app.tmdbDetails = new Map();
  app.allPatterns = [];
  app.currentView = 'table';
  app.sonarrOptions = { rootFolders: [], qualityProfiles: [] };
  return app;
}

test('older TMDB refresh cannot replace newer Series options or selection', async () => {
  const dom = installDom(`
    <select id="series"><option value="">选择系列...</option></select>
    <input id="search-input" value="">
  `);
  const app = makeApp();
  const oldRefresh = deferred();
  const newRefresh = deferred();
  const responses = [
    [{ title: 'Old Series', tmdbId: 1 }],
    [{ title: 'New Series', tmdbId: 2 }]
  ];
  let responseIndex = 0;
  let patternFetches = 0;
  app.filterPatterns = () => {};
  app.apiRequest = async url => ({
    ok: true,
    status: 200,
    json: async () => responses[responseIndex++]
  });
  app.syncTmdbCache = series => series[0].tmdbId === 1 ? oldRefresh.promise : newRefresh.promise;
  app.loadPatterns = () => { patternFetches += 1; };

  await app.loadSeries();
  await app.loadSeries();
  const select = document.getElementById('series');
  select.value = 'New Series';

  newRefresh.resolve({ 2: '新名称' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Array.from(select.options).map(option => option.value), ['', 'New Series']);
  assert.match(select.options[1].textContent, /新名称/);
  assert.equal(select.value, 'New Series');

  oldRefresh.resolve({ 1: '旧名称' });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(select.options[1].textContent, /新名称/);
  assert.equal(select.value, 'New Series');
  assert.equal(patternFetches, 0);
  cleanupDom(dom);
});

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

test('Pattern summary and compact card states follow data and selection', () => {
  const dom = installDom(`
    <span id="pattern-total-count"></span><span id="pattern-issue-count"></span>
    <span id="pattern-summary-selected"></span><span id="selected-count"></span>
    <div id="batch-actions" class="d-none"><button id="batch-delete-btn"></button><button id="batch-fix-btn"></button></div>
    <input id="select-all" type="checkbox"><input class="card-checkbox" data-id="2" type="checkbox" checked>
    <div id="pattern-card-view"></div><table><tbody id="pattern-table-body"></tbody></table>
    <input id="search-input" value=""><select id="filter-status"><option value="all" selected>all</option></select>
  `);
  const app = makeApp();
  app.currentView = 'card';
  app.seriesList = [{ title: 'Exact' }, { title: 'Canonical' }];
  app.allPatterns = [
    { id: 1, series: 'Exact', season: '01', language: 'Chinese', quality: 'WEBDL', remote: '' },
    { id: 2, series: 'canonical', season: '01', language: 'Chinese', quality: 'WEBDL', remote: '' },
    { id: 3, series: 'Missing', season: '01', language: 'Chinese', quality: 'WEBDL', remote: '' }
  ];
  app.updatePatternSummary();
  app.updateBatchUI();
  app.renderPatternCards(app.allPatterns);
  assert.equal(document.getElementById('pattern-total-count').textContent, '3');
  assert.equal(document.getElementById('pattern-issue-count').textContent, '2');
  assert.equal(document.getElementById('pattern-summary-selected').textContent, '1');
  assert.equal(document.getElementById('batch-actions').classList.contains('d-none'), false);
  assert.equal(document.querySelectorAll('.pattern-card--normal').length, 1);
  assert.equal(document.querySelectorAll('.pattern-card--case-mismatch').length, 1);
  assert.equal(document.querySelectorAll('.pattern-card--not-found').length, 1);
  cleanupDom(dom);
});

test('empty library and filtered-empty results use distinct states', () => {
  const dom = installDom(`
    <input id="search-input" value="">
    <select id="filter-status">
      <option value="all" selected>all</option>
      <option value="not-found">not found</option>
    </select>
    <div id="pattern-card-view"></div>
    <table><tbody id="pattern-table-body"></tbody></table>
  `);
  const app = makeApp();

  app.renderPatternCards([]);
  assert.ok(document.querySelector('.pattern-card-empty.empty-state--library'));
  document.getElementById('search-input').value = 'missing';
  app.renderPatternCards([]);
  assert.ok(document.querySelector('.pattern-card-empty.empty-state--filtered'));

  document.getElementById('search-input').value = '';
  app.renderPatterns([]);
  assert.ok(document.querySelector('.empty-state.empty-state--library'));
  assert.equal(document.querySelector('#pattern-table-body td').colSpan, 10);
  document.getElementById('filter-status').value = 'not-found';
  app.renderPatterns([]);
  assert.ok(document.querySelector('.empty-state.empty-state--filtered'));
  cleanupDom(dom);
});

test('Pattern load failure is distinct and retries the request', () => {
  const dom = installDom(`
    <input id="search-input" value="">
    <select id="filter-status"><option value="all" selected>all</option></select>
    <div id="pattern-card-view"></div>
    <div id="pattern-table-view"><table><tbody id="pattern-table-body"></tbody></table></div>
  `);
  const app = makeApp();
  app.currentView = 'card';
  app.patternLoadError = '无法加载 Patterns';
  let retries = 0;
  app.loadPatterns = () => { retries += 1; };
  app.renderCurrentView([]);
  const state = document.querySelector('.load-error-state');
  assert.ok(state);
  assert.match(state.textContent, /无法加载 Patterns/);
  state.querySelector('.retry-pattern-load').click();
  assert.equal(retries, 1);
  cleanupDom(dom);
});

test('newer successful Pattern load replaces an older failure state', async () => {
  const dom = installDom(`
    <span id="pattern-total-count"></span><span id="pattern-issue-count"></span>
    <span id="pattern-summary-selected"></span><span id="selected-count"></span>
    <div id="batch-actions" class="d-none"></div>
    <button id="batch-delete-btn" class="d-none"></button><button id="batch-fix-btn" class="d-none"></button>
    <input id="select-all" type="checkbox"><input id="search-input" value="">
    <select id="filter-status"><option value="all" selected>all</option></select>
    <div id="pattern-card-view"></div>
    <table><tbody id="pattern-table-body"></tbody></table>
  `);
  const app = makeApp();
  const older = deferred();
  const newer = deferred();
  const requests = [older, newer];
  let requestIndex = 0;
  app.currentView = 'card';
  app.showSkeletonLoading = () => {};
  app.updateSortIndicators = () => {};
  app.apiRequest = async () => requests[requestIndex++].promise;

  const olderLoad = app.loadPatterns();
  const newerLoad = app.loadPatterns();
  const originalError = console.error;
  console.error = () => {};
  try {
    older.resolve({ ok: false, status: 503 });
    await olderLoad;
    newer.resolve({
      ok: true,
      json: async () => [{
        id: 1,
        series: 'Recovered',
        season: '01',
        pattern: 'pattern',
        language: 'Chinese',
        quality: 'WEBDL',
        releasegroup: '',
        remote: ''
      }]
    });
    await newerLoad;
  } finally {
    console.error = originalError;
  }

  assert.equal(app.patternLoadError, null);
  assert.equal(document.querySelectorAll('.pattern-card').length, 1);
  assert.equal(document.querySelector('.load-error-state'), null);
  cleanupDom(dom);
});

test('older Pattern failure cannot replace a newer successful load', async () => {
  const dom = installDom(`
    <span id="pattern-total-count"></span><span id="pattern-issue-count"></span>
    <span id="pattern-summary-selected"></span><span id="selected-count"></span>
    <div id="batch-actions" class="d-none"></div>
    <button id="batch-delete-btn" class="d-none"></button><button id="batch-fix-btn" class="d-none"></button>
    <input id="select-all" type="checkbox"><input id="search-input" value="">
    <select id="filter-status"><option value="all" selected>all</option></select>
    <div id="pattern-card-view"></div>
    <table><tbody id="pattern-table-body"></tbody></table>
  `);
  const app = makeApp();
  const older = deferred();
  const newer = deferred();
  const recovered = {
    id: 2,
    series: 'Recovered',
    season: '01',
    pattern: 'newer',
    language: 'Chinese',
    quality: 'WEBDL',
    releasegroup: '',
    remote: ''
  };
  const requests = [older, newer];
  let requestIndex = 0;
  app.currentView = 'card';
  app.showSkeletonLoading = () => {};
  app.updateSortIndicators = () => {};
  app.apiRequest = async () => requests[requestIndex++].promise;

  const olderLoad = app.loadPatterns();
  const newerLoad = app.loadPatterns();
  const originalError = console.error;
  console.error = () => {};
  try {
    newer.resolve({ ok: true, json: async () => [recovered] });
    await newerLoad;
    older.resolve({ ok: false, status: 503 });
    await olderLoad;
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(app.allPatterns, [recovered]);
  assert.deepEqual(app.filteredPatterns, [recovered]);
  assert.equal(app.patternLoadError, null);
  assert.equal(document.querySelectorAll('.pattern-card').length, 1);
  assert.equal(document.querySelector('.load-error-state'), null);
  assert.equal(document.querySelector('.toast-error'), null);
  cleanupDom(dom);
});

test('older Pattern success cannot replace a newer successful load', async () => {
  const dom = installDom(`
    <span id="pattern-total-count"></span><span id="pattern-issue-count"></span>
    <span id="pattern-summary-selected"></span><span id="selected-count"></span>
    <div id="batch-actions" class="d-none"></div>
    <button id="batch-delete-btn" class="d-none"></button><button id="batch-fix-btn" class="d-none"></button>
    <input id="select-all" type="checkbox"><input id="search-input" value="">
    <select id="filter-status"><option value="all" selected>all</option></select>
    <div id="pattern-card-view"></div>
    <table><tbody id="pattern-table-body"></tbody></table>
  `);
  const app = makeApp();
  const older = deferred();
  const newer = deferred();
  const olderPattern = {
    id: 1,
    series: 'Older',
    season: '01',
    pattern: 'older',
    language: 'Chinese',
    quality: 'WEBDL',
    releasegroup: '',
    remote: ''
  };
  const newerPattern = { ...olderPattern, id: 2, series: 'Newer', pattern: 'newer' };
  const requests = [older, newer];
  let requestIndex = 0;
  app.currentView = 'card';
  app.showSkeletonLoading = () => {};
  app.updateSortIndicators = () => {};
  app.apiRequest = async () => requests[requestIndex++].promise;

  const olderLoad = app.loadPatterns();
  const newerLoad = app.loadPatterns();
  newer.resolve({ ok: true, json: async () => [newerPattern] });
  await newerLoad;
  older.resolve({ ok: true, json: async () => [olderPattern] });
  await olderLoad;

  assert.deepEqual(app.allPatterns, [newerPattern]);
  assert.deepEqual(app.filteredPatterns, [newerPattern]);
  assert.equal(document.querySelector('.pattern-card').dataset.patternId, '2');
  cleanupDom(dom);
});

test('latest Pattern loading survives Series, filter, and view renders until it settles', async () => {
  const dom = installDom(`
    <span id="pattern-total-count"></span><span id="pattern-issue-count"></span>
    <span id="pattern-summary-selected"></span><span id="selected-count"></span>
    <div id="batch-actions" class="d-none"></div>
    <button id="batch-delete-btn" class="d-none"></button><button id="batch-fix-btn" class="d-none"></button>
    <input id="select-all" type="checkbox">
    <button id="view-card-btn" class="active"></button><button id="view-table-btn"></button>
    <input id="search-input" value="">
    <select id="filter-status">
      <option value="all" selected>all</option>
      <option value="normal">normal</option>
    </select>
    <select id="series"><option value="">choose</option></select>
    <div id="pattern-card-view" class="pattern-card-grid"></div>
    <div id="pattern-table-view" class="d-none"><table><tbody id="pattern-table-body"></tbody></table></div>
  `);
  const app = makeApp();
  const older = deferred();
  const newer = deferred();
  const requests = [older, newer];
  const stalePattern = {
    id: 1,
    series: 'Stale Series',
    season: '01',
    pattern: 'stale',
    language: 'Chinese',
    quality: 'WEBDL',
    releasegroup: '',
    remote: ''
  };
  const freshPattern = { ...stalePattern, id: 2, series: 'Fresh Series', pattern: 'fresh' };
  let patternRequest = 0;
  app.currentView = 'card';
  app.allPatterns = [stalePattern];
  app.filteredPatterns = [stalePattern];
  app.updateSortIndicators = () => {};
  app.apiRequest = async url => {
    if (url.startsWith('/api/patterns?')) return requests[patternRequest++].promise;
    if (url === '/sonarr/api/v3/series') {
      return { ok: true, status: 200, json: async () => [{ title: 'Fresh Series' }] };
    }
    throw new Error(`unexpected request: ${url}`);
  };

  const assertBothViewsLoading = () => {
    assert.equal(document.querySelectorAll('.pattern-card-skeleton').length, 6);
    assert.equal(document.querySelectorAll('#pattern-table-body tr').length, 5);
    assert.equal(document.querySelectorAll('#pattern-table-body .skeleton').length > 0, true);
    assert.equal(document.getElementById('pattern-card-view').textContent.includes('Stale Series'), false);
    assert.equal(document.getElementById('pattern-table-body').textContent.includes('Stale Series'), false);
  };

  const olderLoad = app.loadPatterns();
  const newerLoad = app.loadPatterns();
  assertBothViewsLoading();

  older.resolve({ ok: true, json: async () => [stalePattern] });
  await olderLoad;
  assert.equal(app.patternLoadingGeneration, 2);
  assertBothViewsLoading();

  const originalLog = console.log;
  console.log = () => {};
  try {
    await app.loadSeries();
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    console.log = originalLog;
  }
  assertBothViewsLoading();

  document.getElementById('search-input').value = 'stale';
  app.filterPatterns('stale');
  assertBothViewsLoading();

  app.switchView('table');
  assertBothViewsLoading();

  document.getElementById('search-input').value = '';
  newer.resolve({ ok: true, json: async () => [freshPattern] });
  await newerLoad;

  assert.equal(app.patternLoadingGeneration, null);
  assert.equal(document.querySelector('#pattern-table-body .pattern-id').textContent, '2');
  app.switchView('card');
  assert.equal(document.querySelector('.pattern-card').dataset.patternId, '2');
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

test('Add Series reuses one registered Bootstrap modal through submit and dismiss', async () => {
  const dom = installDom(`
    <div id="add-series-modal"><button type="button" data-bs-dismiss="modal"></button></div>
    <input id="sonarr-search-input">
    <div id="sonarr-search-results"></div>
    <div id="add-series-step-1"></div>
    <div id="add-series-step-2" class="d-none"></div>
    <button id="add-series-submit-btn"></button>
    <button id="add-series-back-btn"></button>
    <select id="sonarr-root-folder"><option value="/series" selected>/series</option></select>
    <select id="sonarr-quality-profile"><option value="1" selected>HD</option></select>
    <select id="sonarr-series-type"><option value="anime" selected>Anime</option></select>
    <select id="sonarr-monitor"><option value="all" selected>All</option></select>
    <input id="sonarr-season-folder" type="checkbox" checked>
    <select id="series"></select>
  `);
  const registry = new WeakMap();
  let constructions = 0;
  let listenerAdds = 0;
  class FakeModal {
    constructor(element) {
      this.element = element;
      this.showCalls = 0;
      this.hideCalls = 0;
      this.disposeCalls = 0;
      constructions += 1;
      listenerAdds += 1;
      element.addEventListener('hidden.bs.modal', () => {});
      if (!registry.has(element)) registry.set(element, this);
    }

    show() { this.showCalls += 1; }
    hide() { this.hideCalls += 1; }
    dispose() { this.disposeCalls += 1; registry.delete(this.element); }
    static getInstance(element) { return registry.get(element) || null; }
    static getOrCreateInstance(element) { return this.getInstance(element) || new this(element); }
  }
  window.bootstrap = { Modal: FakeModal };
  const modalElement = document.getElementById('add-series-modal');
  modalElement.querySelector('[data-bs-dismiss="modal"]').addEventListener('click', () => {
    FakeModal.getOrCreateInstance(modalElement).hide();
  });
  const app = new MikanarrApp({ client: {}, autoInit: false });
  app.loadSonarrOptions = async () => {};
  app.getOrCreateMikanarrTag = async () => null;
  app.apiRequest = async () => ({ ok: true });
  app.loadSeries = async () => {};
  app.selectedSeries = { title: 'Series', tvdbId: 42, images: [] };

  app.showAddSeriesModal();
  const instance = FakeModal.getInstance(modalElement);
  await app.submitAddSeries();
  app.showAddSeriesModal();
  modalElement.querySelector('[data-bs-dismiss="modal"]').click();

  assert.equal(FakeModal.getInstance(modalElement), instance);
  assert.equal(constructions, 1);
  assert.equal(listenerAdds, 1);
  assert.equal(instance.showCalls, 2);
  assert.equal(instance.hideCalls, 2);
  assert.equal(instance.disposeCalls, 0);
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

test('approved public TMDB and TVDB posters use the image proxy', async () => {
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
    images: [{ coverType: 'poster', remoteUrl: 'https://artworks.thetvdb.com/poster.jpg' }]
  });
  assert.equal(
    sonarrCard.querySelector('img').getAttribute('src'),
    `/api/image-proxy?url=${encodeURIComponent('https://artworks.thetvdb.com/poster.jpg')}`
  );

  cleanupDom(dom);
});

test('relative and same-origin Sonarr posters use the authenticated Sonarr proxy', async () => {
  const dom = installDom(`
    <img id="relative">
    <div id="absolute"><div class="pattern-card-poster"><img></div></div>
  `);
  const app = makeApp();
  app.sonarrHost = 'http://sonarr:8989';

  app.loadSonarrImage({
    images: [{ coverType: 'poster', url: '/MediaCover/7/poster.jpg' }]
  }, document.getElementById('relative'));
  await app.loadCardPoster(document.getElementById('absolute'), {
    images: [{ coverType: 'poster', remoteUrl: 'http://sonarr:8989/MediaCover/8/poster.jpg' }]
  });

  assert.equal(document.getElementById('relative').getAttribute('src'), '/sonarr/MediaCover/7/poster.jpg');
  assert.equal(
    document.querySelector('#absolute img').getAttribute('src'),
    '/sonarr/MediaCover/8/poster.jpg?width=200'
  );
  cleanupDom(dom);
});

test('Series info fallback routes a relative Sonarr poster through the Sonarr proxy', async () => {
  const dom = installDom(`
    <select id="series"><option value="Series" selected>Series</option></select>
    <div id="series-info-card" class="d-none"></div>
    <img id="series-poster">
    <span id="series-title-zh"></span>
    <span id="series-downloaded"></span>
    <span id="series-missing"></span>
    <span id="series-total"></span>
    <div id="series-progress"></div>
    <a id="series-sonarr-link"></a>
  `);
  const app = makeApp();
  app.sonarrHost = 'http://sonarr:8989';
  app.seriesList = [{
    title: 'Series',
    images: [{ coverType: 'poster', url: '/MediaCover/9/poster.jpg' }]
  }];

  await app.updateSeriesInfoCard();

  assert.equal(document.getElementById('series-poster').getAttribute('src'), '/sonarr/MediaCover/9/poster.jpg');
  cleanupDom(dom);
});

test('refreshing translated Series options preserves the current selection', () => {
  const dom = installDom('<select id="series"><option value="Series" selected>Series</option></select>');
  const app = makeApp();
  const series = [{ title: 'Series', tmdbId: 42 }];

  app.tmdbCache = { 42: '中文名' };
  app.renderSeriesOptions(series);

  assert.equal(document.getElementById('series').value, 'Series');
  assert.equal(document.querySelector('#series option:checked').textContent, 'Series (中文名)');
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

test('config 401 aborts startup data loads and performs one expiry transition', async () => {
  const dom = installDom(`
    <div id="login-container"></div>
    <div id="main-container" class="d-none"></div>
    <div id="oidc-login-container" class="d-none"></div>
  `);
  let app;
  let expiryCalls = 0;
  let resets = 0;
  let patternCalls = 0;
  let seriesCalls = 0;
  const client = createClient({
    fetchImpl: async url => {
      if (url === '/auth/session') {
        return new Response(JSON.stringify({ user: { username: 'user' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (url === '/auth/config') {
        return new Response(JSON.stringify({ oidcEnabled: false, oidcAutoLogin: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      });
    },
    onUnauthorized: async () => {
      expiryCalls += 1;
      await app.handleAuthExpired();
    }
  });
  app = new MikanarrApp({ client, autoInit: false });
  app.initView = () => {};
  const showLoggedOut = app.showLoggedOut.bind(app);
  app.showLoggedOut = () => {
    resets += 1;
    showLoggedOut();
  };
  app.loadPatterns = async () => {
    patternCalls += 1;
    await app.apiRequest('/api/patterns');
  };
  app.loadSeries = async () => {
    seriesCalls += 1;
    await app.apiRequest('/sonarr/api/v3/series');
  };

  await app.start();

  assert.equal(expiryCalls, 1);
  assert.equal(resets, 1);
  assert.equal(patternCalls, 0);
  assert.equal(seriesCalls, 0);
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

test('successful session and login each rearm one expiry transition', async () => {
  const dom = installDom(`
    <input id="username" value="user">
    <input id="password" value="password">
    <div id="login-error" class="d-none"></div>
  `);
  let resets = 0;
  const client = {
    session: async () => ({ user: { username: 'user' } }),
    login: async () => ({ user: { username: 'user' } })
  };
  const app = new MikanarrApp({ client, autoInit: false });
  app.showLoggedOut = () => { resets += 1; };
  app.showAuthenticated = () => {};
  app.checkOidcConfig = async () => {};
  app.loadAuthenticatedData = async () => {};

  await Promise.all([app.handleAuthExpired(), app.handleAuthExpired()]);
  assert.equal(resets, 1);

  await app.checkAuth();
  await Promise.all([app.handleAuthExpired(), app.handleAuthExpired()]);
  assert.equal(resets, 2);

  await app.handleLogin({ preventDefault() {} });
  await Promise.all([app.handleAuthExpired(), app.handleAuthExpired()]);
  assert.equal(resets, 3);
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

test('real constructor can suppress initialization and never owns a stale JWT', async () => {
  const dom = installDom('');
  localStorage.setItem('token', 'stale-browser-bearer');
  const calls = [];
  const expected = { ok: true };
  const client = {
    request: async (url, options) => {
      calls.push({ url, options });
      return expected;
    }
  };
  const originalInit = MikanarrApp.prototype.init;
  let initCalls = 0;
  MikanarrApp.prototype.init = () => { initCalls += 1; };
  let app;
  try {
    app = new MikanarrApp({ client, autoInit: false });
  } finally {
    MikanarrApp.prototype.init = originalInit;
  }

  assert.equal(await app.apiRequest('/api/patterns', { method: 'POST' }), expected);
  assert.deepEqual(calls, [{ url: '/api/patterns', options: { method: 'POST' } }]);
  assert.equal(initCalls, 0);
  assert.equal(Object.hasOwn(app, 'token'), false);
  assert.equal(app.patternLoadingGeneration, null);
  cleanupDom(dom);
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

test('Pattern reload reconciles selection and clears the active view after failure', async () => {
  const dom = installDom(`
    <span id="pattern-total-count">2</span><span id="pattern-issue-count">1</span>
    <span id="pattern-summary-selected">1</span><span id="selected-count">1</span>
    <div id="batch-actions"><button id="batch-delete-btn"></button><button id="batch-fix-btn"></button></div>
    <input id="select-all" type="checkbox" checked>
    <input id="search-input" value="">
    <select id="filter-status"><option value="all" selected>all</option></select>
    <div id="pattern-card-view"><input class="card-checkbox" data-id="1" type="checkbox" checked></div>
    <table><tbody id="pattern-table-body"><tr><td>stale</td></tr></tbody></table>
  `);
  const app = makeApp();
  const request = deferred();
  const stalePatterns = [{
    id: 1,
    series: 'Missing',
    season: '01',
    pattern: 'pattern',
    language: 'Chinese',
    quality: 'WEBDL',
    releasegroup: '',
    remote: ''
  }];
  app.currentView = 'card';
  app.allPatterns = stalePatterns;
  app.filteredPatterns = stalePatterns;
  app.apiRequest = async () => request.promise;

  const loading = app.loadPatterns();
  const duringLoading = {
    loadingGeneration: app.patternLoadingGeneration,
    selected: document.getElementById('pattern-summary-selected').textContent,
    batchHidden: document.getElementById('batch-actions').classList.contains('d-none'),
    selectAll: document.getElementById('select-all').checked,
    cardSkeletons: document.querySelectorAll('.pattern-card-skeleton').length
  };

  const originalError = console.error;
  console.error = () => {};
  try {
    request.resolve({ ok: false, status: 503 });
    await loading;
  } finally {
    console.error = originalError;
  }

  const afterFailure = {
    loadingGeneration: app.patternLoadingGeneration,
    allPatterns: app.allPatterns,
    filteredPatterns: app.filteredPatterns,
    total: document.getElementById('pattern-total-count').textContent,
    issues: document.getElementById('pattern-issue-count').textContent,
    cardSkeletons: document.querySelectorAll('.pattern-card-skeleton').length,
    loadError: Boolean(document.querySelector('#pattern-card-view > .load-error-state')),
    toast: document.querySelector('.toast-error .toast-content')?.textContent
  };

  assert.deepEqual({ duringLoading, afterFailure }, {
    duringLoading: { loadingGeneration: 1, selected: '0', batchHidden: true, selectAll: false, cardSkeletons: 6 },
    afterFailure: {
      loadingGeneration: null,
      allPatterns: [],
      filteredPatterns: [],
      total: '0',
      issues: '0',
      cardSkeletons: 0,
      loadError: true,
      toast: '加载 Patterns 失败'
    }
  });
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

test('import dialog is labelled, focuses its first action, closes on Escape, and restores focus', async () => {
  const dom = installDom('<button id="import-trigger" type="button">Import</button>');
  const app = makeApp();
  const trigger = document.getElementById('import-trigger');
  const addEventListener = document.addEventListener.bind(document);
  const removeEventListener = document.removeEventListener.bind(document);
  let addedKeydown;
  let removedKeydown;
  document.addEventListener = (type, listener, options) => {
    if (type === 'keydown') addedKeydown = listener;
    return addEventListener(type, listener, options);
  };
  document.removeEventListener = (type, listener, options) => {
    if (type === 'keydown') removedKeydown = listener;
    return removeEventListener(type, listener, options);
  };
  trigger.focus();

  const result = app.showImportModeDialog();
  const modal = document.getElementById('import-modal');
  const firstAction = modal.querySelector('[data-import-action="append"]');
  assert.equal(modal.getAttribute('role'), 'dialog');
  assert.equal(modal.getAttribute('aria-modal'), 'true');
  assert.equal(modal.getAttribute('aria-labelledby'), 'import-modal-title');
  assert.equal(document.activeElement, firstAction);

  const cancelAction = modal.querySelector('[data-import-action="cancel"]');
  document.dispatchEvent(new window.KeyboardEvent('keydown', {
    key: 'Tab', shiftKey: true, bubbles: true, cancelable: true
  }));
  assert.equal(document.activeElement, cancelAction);
  document.dispatchEvent(new window.KeyboardEvent('keydown', {
    key: 'Tab', bubbles: true, cancelable: true
  }));
  assert.equal(document.activeElement, firstAction);

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(await result, null);
  assert.equal(document.getElementById('import-modal-overlay'), null);
  assert.equal(document.activeElement, trigger);
  assert.equal(removedKeydown, addedKeydown);

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(document.getElementById('import-modal-overlay'), null);
  cleanupDom(dom);
});

test('sort indicators expose their direction on column headers', () => {
  const dom = installDom(`
    <table><thead><tr>
      <th><button type="button" class="sortable" data-sort="id">ID <i></i></button></th>
      <th><button type="button" class="sortable" data-sort="series">Series <i></i></button></th>
    </tr></thead></table>
  `);
  const app = makeApp();
  app.currentSort = { field: 'id', direction: 'asc' };

  app.updateSortIndicators();
  assert.equal(document.querySelector('[data-sort="id"]').closest('th').getAttribute('aria-sort'), 'ascending');
  assert.equal(document.querySelector('[data-sort="series"]').closest('th').getAttribute('aria-sort'), 'none');

  app.currentSort.direction = 'desc';
  app.updateSortIndicators();
  assert.equal(document.querySelector('[data-sort="id"]').closest('th').getAttribute('aria-sort'), 'descending');
  cleanupDom(dom);
});

test('tag lookup 401 aborts add-Series orchestration before the Series mutation', async () => {
  const dom = installDom(`
    <div id="add-series-modal"></div>
    <button id="add-series-submit-btn"></button>
    <select id="sonarr-root-folder"><option value="/series" selected>/series</option></select>
    <select id="sonarr-quality-profile"><option value="1" selected>HD</option></select>
    <select id="sonarr-series-type"><option value="anime" selected>Anime</option></select>
    <select id="sonarr-monitor"><option value="all" selected>All</option></select>
    <input id="sonarr-season-folder" type="checkbox" checked>
  `);
  const app = makeApp();
  app.selectedSeries = { title: 'Series', tvdbId: 42, images: [] };
  const calls = [];
  app.apiRequest = async url => {
    calls.push(url);
    const error = new Error('Session expired');
    error.status = 401;
    throw error;
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await app.submitAddSeries();
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(calls, ['/sonarr/api/v3/tag']);
  assert.equal(document.getElementById('add-series-submit-btn').disabled, false);
  cleanupDom(dom);
});

test('editing a Pattern never logs its secret-bearing payload', async () => {
  const secret = 'MIKAN-QUERY-SECRET';
  const app = makeApp();
  app.apiRequest = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: 7,
      remote: `https://mikanani.me/RSS/Bangumi?token=${secret}`,
      pattern: '(?<episode>\\d+)',
      series: 'Series'
    })
  });
  app.showPatternEdit = () => {};
  const logs = [];
  const originalLog = console.log;
  console.log = (...parts) => logs.push(parts.map(part =>
    typeof part === 'object' ? JSON.stringify(part) : String(part)
  ).join(' '));
  try {
    await app.editPattern(7);
  } finally {
    console.log = originalLog;
  }

  assert.equal(logs.some(line => line.includes(secret) || line.includes('token=')), false);
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
  let cache;
  try {
    cache = await app.syncTmdbCache([{ tmdbId: 42, title: 'Series' }]);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
    console.log = originalLog;
  }

  assert.deepEqual(calls, ['/tmdb/cache/sync', '/tmdb/cache']);
  assert.deepEqual(cache, { 42: '中文名' });
  assert.deepEqual(app.tmdbCache, {});
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
  let cache;
  try {
    cache = await app.syncTmdbCache([{ tmdbId: 42, title: 'Series' }]);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
    console.log = originalLog;
  }

  assert.deepEqual(calls, ['/tmdb/cache/sync']);
  assert.equal(cache, null);
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

test('Series render immediately while TMDB refresh redraws locally without another Pattern fetch', async () => {
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
  const optionRenders = [];
  let redraws = 0;
  let resolveSync;
  app.allPatterns = [{ id: 1, series: 'Series', pattern: 'pattern', releasegroup: '' }];
  app.currentView = 'card';
  app.apiRequest = async url => {
    assert.equal(url, '/sonarr/api/v3/series');
    return { ok: true, status: 200, json: async () => series };
  };
  app.syncTmdbCache = () => new Promise(resolve => {
    resolveSync = () => {
      resolve({ 42: '中文名' });
    };
  });
  app.renderSeriesOptions = values => {
    optionRenders.push(values.map(value => {
      const zhName = app.tmdbCache[value.tmdbId];
      return zhName ? `${value.title} (${zhName})` : value.title;
    }));
  };
  app.loadPatterns = () => { patternFetches += 1; };
  app.renderCurrentView = () => { redraws += 1; };

  const originalLog = console.log;
  console.log = () => {};
  try {
    const loading = app.loadSeries();
    const prompt = await Promise.race([
      loading.then(() => 'loaded'),
      new Promise(resolve => setImmediate(() => resolve('waiting')))
    ]);
    assert.equal(prompt, 'loaded');
    assert.deepEqual(optionRenders, [['Series']]);
    resolveSync();
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    console.log = originalLog;
  }

  assert.equal(patternFetches, 0);
  assert.deepEqual(optionRenders, [['Series'], ['Series (中文名)']]);
  assert.equal(redraws, 2);
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

  const importButton = document.getElementById('import-btn');
  assert.ok(importButton);
  assert.equal(importButton.tagName, 'BUTTON');
  assert.equal(importButton.type, 'button');
  importButton.focus();
  assert.equal(document.activeElement, importButton);
  const sortButtons = Array.from(document.querySelectorAll('thead button.sortable'));
  assert.equal(sortButtons.length, 6);
  sortButtons[0].focus();
  assert.equal(document.activeElement, sortButtons[0]);
  assert.equal(document.getElementById('select-all').getAttribute('aria-label'), '选择全部 Patterns');

  const unnamedIconControls = Array.from(document.querySelectorAll('button, label'))
    .filter(control => !control.textContent.trim() && control.querySelector('i, .navbar-toggler-icon'))
    .filter(control => !control.getAttribute('aria-label'));
  assert.deepEqual(unnamedIconControls, []);
  dom.window.close();
});
