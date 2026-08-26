const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

async function installDashboardDom() {
  const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');
  const redesign = readFileSync(join(__dirname, '../public/js/redesign.js'), 'utf8');
  const uiSource = readFileSync(join(__dirname, '../public/js/ui.js'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://mikanarr.test/',
    runScripts: 'outside-only'
  });

  if (dom.window.document.readyState === 'loading') {
    await new Promise(resolve => dom.window.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }

  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.DOMParser = dom.window.DOMParser;
  global.Event = dom.window.Event;
  global.localStorage = dom.window.localStorage;

  const appModule = require.resolve('../public/js/app');
  const uiModule = require.resolve('../public/js/ui');
  delete require.cache[appModule];
  delete require.cache[uiModule];
  const { MikanarrApp } = require(appModule);

  dom.window.MikanarrApp = MikanarrApp;
  const app = Object.create(MikanarrApp.prototype);
  app.allPatterns = [];
  app.filteredPatterns = [];
  app.seriesList = [];
  app.seriesLoadError = null;
  app.tmdbCache = {};
  app.tmdbDetails = new Map();
  app.currentView = 'card';
  app.patternLoadError = null;
  app.patternLoadGeneration = 0;
  app.patternLoadingGeneration = null;
  app.uiCurrentPage = 1;
  app.sonarrHost = '';
  app.rssItems = [];
  dom.window.mikanarrApp = app;

  dom.window.eval(redesign);
  dom.window.eval(uiSource);
  await new Promise(resolve => setTimeout(resolve, 5));

  const cleanup = () => {
    dom.window.close();
    delete require.cache[appModule];
    delete require.cache[uiModule];
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.DOMParser;
    delete global.Event;
    delete global.localStorage;
  };

  return { dom, app, cleanup };
}

function pattern(id, { status = 'normal', recent = false } = {}) {
  return {
    id,
    status,
    series: `Series ${id}`,
    season: '01',
    pattern: '(?<episode>\\d+)',
    language: 'Chinese',
    quality: 'WEBDL 1080p',
    offset: 0,
    releasegroup: `Group ${id}`,
    remote: `https://mikanani.me/RSS/Bangumi?bangumiId=${id}`,
    last_matched_at: recent ? new Date().toISOString() : '2024-01-01T00:00:00.000Z',
    match_count: id
  };
}

test('dashboard renders 15 items normally and 12 while the editor drawer is open', async () => {
  const { dom, app, cleanup } = await installDashboardDom();
  const patterns = Array.from({ length: 31 }, (_, index) => pattern(index + 1));
  let renderedCount = 0;

  app.getPatternStatus = item => item.status;
  app.renderPatternCards = items => { renderedCount = items.length; };
  app.renderPatterns = items => { renderedCount = items.length; };
  app.updateBatchUI = () => {};
  app.allPatterns = patterns;
  app.filteredPatterns = patterns;

  app.renderCurrentView(patterns);
  assert.equal(renderedCount, 15);
  assert.match(dom.window.document.querySelector('.ui-pagination-meta').textContent, /15 条 \/ 页/);

  dom.window.document.body.classList.add('ui-drawer-open');
  app.renderCurrentView(patterns);
  assert.equal(renderedCount, 12);
  assert.match(dom.window.document.querySelector('.ui-pagination-meta').textContent, /12 条 \/ 页/);

  dom.window.document.body.classList.remove('ui-drawer-open');
  app.renderCurrentView(patterns);
  assert.equal(renderedCount, 15);

  cleanup();
});

test('summary cards act as filters using the same counts they display', async () => {
  const { dom, app, cleanup } = await installDashboardDom();
  const document = dom.window.document;
  const patterns = [
    pattern(1, { status: 'normal', recent: true }),
    pattern(2, { status: 'case-mismatch', recent: true }),
    pattern(3, { status: 'not-found' }),
    pattern(4, { status: 'normal' })
  ];

  app.getPatternStatus = item => item.status;
  app.renderPatternCards = () => {};
  app.renderPatterns = () => {};
  app.updateBatchUI = () => {};
  app.allPatterns = patterns;
  app.filteredPatterns = patterns;
  app.filterPatterns('');

  const clickSummary = id => document.getElementById(id).closest('.ui-stat-card').click();

  clickSummary('pattern-issue-count');
  assert.deepEqual(app.filteredPatterns.map(item => item.id), [2, 3]);
  assert.equal(document.getElementById('pattern-issue-count').closest('.ui-stat-card').classList.contains('is-filter-active'), true);

  clickSummary('pattern-recent-count');
  assert.deepEqual(app.filteredPatterns.map(item => item.id), [1, 2]);

  clickSummary('pattern-normal-count');
  assert.deepEqual(app.filteredPatterns.map(item => item.id), [1, 4]);
  assert.equal(document.querySelector('.ui-filter-chip[data-value="normal"]').classList.contains('active'), true);

  clickSummary('pattern-total-count');
  assert.deepEqual(app.filteredPatterns.map(item => item.id), [1, 2, 3, 4]);

  cleanup();
});

test('card selection checkbox is anchored to the lower-left corner', async () => {
  const { dom, cleanup } = await installDashboardDom();
  const styles = dom.window.document.getElementById('ui-summary-density-refinements').textContent;
  assert.match(styles, /\.pattern-card-checkbox\s*\{[\s\S]*top:\s*auto\s*!important;/);
  assert.match(styles, /\.pattern-card-checkbox\s*\{[\s\S]*bottom:\s*9px\s*!important;/);
  assert.match(styles, /\.pattern-card-checkbox\s*\{[\s\S]*left:\s*12px\s*!important;/);
  cleanup();
});
