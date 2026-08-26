const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('UI polish keeps poster and search icon geometry intentional', () => {
  const css = readFileSync(join(__dirname, '../public/css/redesign.css'), 'utf8');
  assert.match(css, /ui-dark-theme-polish-2026-08-26/);
  assert.match(css, /\.pattern-card-poster[\s\S]*width:\s*82px !important;[\s\S]*height:\s*116px !important;/);
  assert.match(css, /\.search-control[\s\S]*min-height:\s*42px;[\s\S]*\.search-control > i[\s\S]*translate:\s*0 !important;[\s\S]*translateY\(1px\)/);
});

test('dark theme overrides light-only card and button treatments', () => {
  const css = readFileSync(join(__dirname, '../public/css/redesign.css'), 'utf8');
  assert.match(css, /html\[data-theme="dark"\] \.pattern-card-actions \.btn/);
  assert.match(css, /html\[data-theme="dark"\] #theme-toggle:hover/);
  assert.match(css, /html\[data-theme="dark"\] \.pattern-card-language/);
  assert.match(css, /html\[data-theme="dark"\] \.pattern-card-quality/);
  assert.match(css, /--bs-table-bg:\s*transparent/);
  assert.match(css, /html\[data-theme="dark"\][\s\S]*--ui-bg:\s*#161c21/);
});

test('favicon and manifest use the dashboard blue-gray accent', () => {
  const icon = readFileSync(join(__dirname, '../public/images/icon.svg'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(__dirname, '../public/manifest.json'), 'utf8'));
  const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');
  assert.match(icon, /fill="#607a93"/);
  assert.equal(manifest.theme_color, '#607a93');
  assert.equal(manifest.background_color, '#f3f6f8');
  assert.match(manifest.icons[0].src, /icon\.svg\?v=3/);
  assert.match(html, /icon\.svg\?v=3/);
  assert.match(html, /theme-color" content="#607a93"/);
});
