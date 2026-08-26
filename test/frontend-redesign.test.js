const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

// Regression coverage for the approved low-saturation subscription dashboard.
async function installRedesignDom() {
  const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');
  const redesign = readFileSync(join(__dirname, '../public/js/redesign.js'), 'utf8');
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
  delete require.cache[appModule];
  const { MikanarrApp } = require(appModule);

  dom.window.MikanarrApp = MikanarrApp;
  dom.window.MikanarrUi = {
    Toast: {
      success() {},
      error() {},
      info() {},
      warning() {}
    }
  };

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
  dom.window.mikanarrApp = app;

  dom.window.eval(redesign);

  const cleanup = () => {
    dom.window.close();
    delete require.cache[appModule];
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.DOMParser;
    delete global.Event;
    delete global.localStorage;
  };

  return { dom, app, cleanup };
}

function pattern(id) {
  return {
    id,
    series: `Series ${id}`,
    season: '01',
    pattern: '.*(?:第|Episode|-)\\s*(?<episode>\\d+).*',
    language: 'Chinese',
    quality: 'WEBDL 1080p',
    offset: 0,
    releasegroup: id % 2 ? 'Example Group' : '',
    remote: `https://mikanani.me/RSS/Bangumi?bangumiId=${id}`,
    last_matched_at: '2026-08-25T10:00:00.000Z',
    match_count: id
  };
}

test('approved dashboard redesign is wired after the existing application assets', () => {
  const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /\/css\/style\.css[\s\S]*\/css\/redesign\.css/);
  assert.match(html, /\/js\/app\.js[\s\S]*\/js\/redesign\.js/);
});

test('redesign turns the Pattern workspace into localized subscription management chrome', async () => {
  const { dom, cleanup } = await installRedesignDom();
  const document = dom.window.document;

  assert.equal(document.querySelector('.pattern-page-heading h1').textContent, '订阅管理');
  assert.equal(document.querySelector('.app-navbar .nav-link.active').textContent, '订阅管理');
  assert.equal(document.getElementById('search-input').placeholder, '搜索剧集 / RSS');
  assert.match(document.getElementById('new-pattern-btn').textContent, /新建订阅/);

  assert.deepEqual(
    Array.from(document.querySelectorAll('.ui-stat-card .ui-stat-label'), node => node.textContent),
    ['总订阅', '正常', '需修复', '最近更新']
  );
  assert.deepEqual(
    Array.from(document.querySelectorAll('.ui-filter-chip'), node => node.textContent),
    ['全部', '正常', '需修复', '未绑定']
  );

  assert.ok(document.querySelector('.ui-batch-toolbar'));
  assert.ok(document.getElementById('batch-update-btn'));
  assert.ok(document.getElementById('batch-copy-btn'));
  assert.ok(document.getElementById('batch-clear-btn'));

  assert.deepEqual(
    Array.from(document.querySelectorAll('.ui-editor-tab'), node => node.textContent),
    ['订阅设置', '匹配规则']
  );
  assert.equal(document.querySelector('label[for="pattern"]').textContent, '集数匹配规则');
  assert.ok(document.querySelector('.ui-pattern-help'));
  assert.match(document.querySelector('.editor-preview-card .card-header').textContent, /实时预览/);

  cleanup();
});

test('card workspace pages subscriptions instead of rendering the full library at once', async () => {
  const { dom, app, cleanup } = await installRedesignDom();
  const document = dom.window.document;
  const patterns = Array.from({ length: 25 }, (_, index) => pattern(index + 1));

  app.allPatterns = patterns;
  app.filteredPatterns = patterns;
  app.renderCurrentView(patterns);

  assert.equal(document.querySelectorAll('#pattern-card-view .pattern-card').length, 12);
  assert.equal(document.getElementById('ui-pagination').classList.contains('d-none'), false);
  assert.match(document.querySelector('.ui-pagination-meta').textContent, /第 1 页 \/ 共 3 页/);
  assert.match(document.querySelector('.ui-pagination-meta').textContent, /12 条 \/ 页/);

  const secondPage = Array.from(document.querySelectorAll('.ui-page-btn')).find(button => button.textContent === '2');
  secondPage.click();
  assert.equal(document.querySelectorAll('#pattern-card-view .pattern-card').length, 12);
  assert.match(document.querySelector('.ui-pagination-meta').textContent, /第 2 页 \/ 共 3 页/);

  const firstCard = document.querySelector('#pattern-card-view .pattern-card');
  assert.ok(firstCard.querySelector('.ui-card-details'));
  assert.match(firstCard.querySelector('.pattern-card-status-badge').textContent, /未匹配/);

  cleanup();
});

test('card selection reveals the integrated bulk toolbar and selected styling', async () => {
  const { dom, app, cleanup } = await installRedesignDom();
  const document = dom.window.document;
  const patterns = [pattern(1), pattern(2), pattern(3)];
  app.allPatterns = patterns;
  app.filteredPatterns = patterns;
  app.renderCurrentView(patterns);

  const checkboxes = document.querySelectorAll('.card-checkbox');
  checkboxes[0].checked = true;
  checkboxes[1].checked = true;
  app.updateBatchUI();

  assert.equal(document.getElementById('batch-actions').classList.contains('d-none'), false);
  assert.equal(document.getElementById('ui-selected-count').textContent, '2');
  assert.equal(document.querySelectorAll('.pattern-card.is-selected').length, 2);

  app.clearBatchSelection();
  assert.equal(document.getElementById('batch-actions').classList.contains('d-none'), true);
  assert.equal(document.querySelectorAll('.pattern-card.is-selected').length, 0);

  cleanup();
});

test('editing keeps the library visible and adds context plus extracted episode results', async () => {
  const { dom, app, cleanup } = await installRedesignDom();
  const document = dom.window.document;
  const selected = pattern(1);
  app.seriesList = [{ title: selected.series, seasons: [] }];
  app.currentPatternId = selected.id;

  app.showPatternEdit(selected);
  assert.equal(document.getElementById('pattern-list').classList.contains('d-none'), false);
  assert.equal(document.getElementById('pattern-edit').classList.contains('d-none'), false);
  assert.equal(document.body.classList.contains('ui-drawer-open'), true);
  assert.equal(document.querySelector('.ui-editor-context').classList.contains('d-none'), false);
  assert.equal(document.querySelector('.ui-editor-context-title').textContent, selected.series);
  assert.equal(document.querySelector('.ui-editor-tab.active').textContent, '匹配规则');

  app.rssItems = [
    '[DMHY] Example - 03 [1080P]',
    'Example 第 04 话',
    'Example - Episode 05 [WEBRip]'
  ];
  app.renderRssPreview();
  assert.deepEqual(
    Array.from(document.querySelectorAll('.ui-rss-result-badge'), node => node.textContent),
    ['E03', 'E04', 'E05']
  );

  cleanup();
});
