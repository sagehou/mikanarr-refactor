const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

const { MikanarrApp } = require('../public/js/app');

function installRedesignDom() {
  const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');
  const redesign = readFileSync(join(__dirname, '../public/js/redesign.js'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://mikanarr.test/',
    runScripts: 'outside-only'
  });

  dom.window.MikanarrApp = MikanarrApp;
  dom.window.MikanarrUi = {
    Toast: {
      success() {},
      error() {},
      info() {},
      warning() {}
    }
  };
  dom.window.eval(redesign);

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

  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return { dom, app };
}

function pattern(id) {
  return {
    id,
    series: `Series ${id}`,
    season: '01',
    pattern: '(?<episode>\\d+)',
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

test('redesign turns the Pattern workspace into localized subscription management chrome', () => {
  const { dom } = installRedesignDom();
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
    ['基础', '匹配规则', 'Sonarr', '高级']
  );
  assert.equal(document.querySelector('label[for="pattern"]').textContent, '集数匹配规则');
  assert.ok(document.querySelector('.ui-pattern-help'));
  assert.match(document.querySelector('.editor-preview-card .card-header').textContent, /实时预览/);

  dom.window.close();
});

test('card workspace pages subscriptions instead of rendering the full library at once', () => {
  const { dom, app } = installRedesignDom();
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

  dom.window.close();
});

test('card selection reveals the integrated bulk toolbar and selected styling', () => {
  const { dom, app } = installRedesignDom();
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

  dom.window.close();
});
