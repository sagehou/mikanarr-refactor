# Mikanarr UI Visual Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix stale overlapping TMDB refreshes and deliver a compact, animated, refined Maillard UI in light and dark themes without changing Mikanarr's backend contracts or frontend technology stack.

**Architecture:** Keep the existing Bootstrap 5 + vanilla JavaScript page and improve three current boundaries: semantic layout in `public/index.html`, presentation in `public/css/style.css`, and view/state orchestration in `public/js/app.js`. Use a monotonically increasing Series-load generation to make background TMDB work latest-load-wins; use semantic classes and CSS custom properties for visual state rather than adding a component framework or animation dependency.

**Tech Stack:** Node.js 22, CommonJS, Express static assets, Bootstrap 5.3.8, Bootstrap Icons 1.13.1, vanilla HTML/CSS/JavaScript, jsdom 29.1.1, Node's built-in `node:test`.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-29-ui-visual-refinement-design.md`.
- Preserve Express, SQLite, Bootstrap 5.3.8, Bootstrap Icons 1.13.1, vanilla JavaScript, CommonJS exports, CSP, Cookie authentication, and every current API contract.
- Do not add a framework, TypeScript, bundler, state library, animation library, font, image asset, CDN, or npm dependency.
- Keep compact card view as the default and retain card/table and light/dark preferences in `localStorage`.
- Dynamic caller/upstream strings continue to use `textContent`, property setters, or validated URL setters; add no inline event handlers or unsafe dynamic `innerHTML`.
- Use only the approved semantic Maillard colors and motion timings; keep both themes readable.
- Every JavaScript/DOM behavior change follows RED → GREEN → REFACTOR using Node `node:test`; pure CSS visual rules use an implementation-time RED/GREEN static acceptance check and do not add source-text change-detector tests (user ruling, 2026-07-30).
- Every task ends with focused tests, `npm run check`, `git diff --check`, self-review, and one commit.
- Respect `prefers-reduced-motion`; animation must never delay data, focus, controls, or content.
- Docker runtime verification remains deferred to a later Docker-capable environment.

## File Responsibility Map

- `public/index.html`: semantic grouping and stable hooks only; no dynamic data or inline handlers.
- `public/css/style.css`: colors, density, layout, responsive behavior, dark theme, state presentation, and motion.
- `public/js/app.js`: Series generation state, summary values, status classes, and loading/error orchestration.
- `public/js/ui.js`: unchanged safe Toast/Confirm builders; their appearance remains CSS-owned.
- `test/frontend-app.test.js`: Series concurrency, semantic HTML structure, and list/editor state behavior; pure CSS is verified statically during implementation rather than by persisted source-text assertions.

## Cross-Task Interfaces

- Task 1 changes `syncTmdbCache(series)` to return `Promise<Record<string, string> | null>`; `loadSeries()` applies returned cache state after a generation check.
- Task 2 establishes CSS tokens and `.login-shell`, `.app-shell`, `.app-navbar`, `.app-content` hooks used later.
- Task 3 produces `getPatternStatus(pattern)`, `updatePatternSummary()`, and stable summary IDs.
- Task 4 produces `.editor-section`, `.editor-preview-panel`, `patternLoadError`, and `renderPatternLoadError()`.
- Task 5 adds no JavaScript interface; it completes responsive/motion/theme contracts and final gates.

---

### Task 1: Make Series/TMDB Refresh Latest-Load-Wins

**Files:**
- Modify: `public/js/app.js:8-18,768-884`
- Modify: `test/frontend-app.test.js:1-35,860-930`

**Interfaces:**
- Consumes: `loadSeries()`, `renderSeriesOptions(series)`, `filterPatterns(query)`, `apiRequest(url, options)`.
- Produces: `seriesLoadGeneration: number`, `syncTmdbCache(series): Promise<Record<string, string> | null>`, and `renderSeriesLoadError(error): void`.

- [ ] **Step 1: Add the deterministic overlapping-load regression**

Add near `makeApp()`:

```js
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
```

Initialize `app.seriesLoadGeneration = 0` inside `makeApp()`, then add:

```js
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

  oldRefresh.resolve({ 1: '旧名称' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Array.from(select.options).map(option => option.value), ['', 'New Series']);
  assert.equal(select.value, 'New Series');

  newRefresh.resolve({ 2: '新名称' });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(select.options[1].textContent, /新名称/);
  assert.equal(select.value, 'New Series');
  assert.equal(patternFetches, 0);
  cleanupDom(dom);
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test --test-name-pattern='older TMDB refresh' test/frontend-app.test.js
```

Expected: FAIL because the first refresh redraws `Old Series` and clears the selected `New Series`.

- [ ] **Step 3: Apply cache/UI state only for the newest generation**

Add to the constructor:

```js
this.seriesLoadGeneration = 0;
```

Immediately inside `loadSeries()`, before its `try`, capture the generation so the `catch` block can also reject stale work:

```js
const generation = ++this.seriesLoadGeneration;
```

```js
if (generation !== this.seriesLoadGeneration) return;
this.seriesList = series;
this.renderSeriesOptions(this.seriesList);
this.filterPatterns(document.getElementById('search-input').value);

void this.syncTmdbCache(series).then(cache => {
  if (generation !== this.seriesLoadGeneration) return;
  if (cache !== null) this.tmdbCache = cache;
  this.renderSeriesOptions(this.seriesList);
  this.filterPatterns(document.getElementById('search-input').value);
}).catch(() => console.error('[loadSeries] TMDB refresh failed'));
```

Replace the existing `loadSeries()` catch body with:

```js
} catch (error) {
  console.error('[loadSeries] Failed to load series:', error);
  if (generation !== this.seriesLoadGeneration) return;
  this.renderSeriesLoadError(error);
}
```

Extract the current safe error DOM into `renderSeriesLoadError(error)`:

```js
renderSeriesLoadError(error) {
  const seriesSelect = document.getElementById('series');
  if (!seriesSelect) return;
  const errorDiv = document.createElement('div');
  errorDiv.className = 'alert alert-warning mt-2';
  errorDiv.innerHTML = '<i class="bi bi-exclamation-triangle" aria-hidden="true"></i> <span class="sonarr-load-error"></span><br><small>请检查 SONARR_API_KEY 和 SONARR_HOST 配置</small>';
  errorDiv.querySelector('.sonarr-load-error').textContent = `加载 Sonarr 系列失败: ${error.message || 'Unknown error'}`;
  seriesSelect.parentElement.querySelector('.alert')?.remove();
  seriesSelect.parentElement.appendChild(errorDiv);
}
```

Make `syncTmdbCache()` return cache data instead of mutating `this.tmdbCache`:

```js
async syncTmdbCache(series) {
  const seriesData = series
    .filter(item => item.tmdbId)
    .map(item => ({ tmdbId: item.tmdbId, titleEn: item.title }));
  if (seriesData.length === 0) return null;

  try {
    const response = await this.apiRequest('/tmdb/cache/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ series: seriesData })
    });
    if (!response.ok) throw new Error('TMDB sync failed');
    const data = await response.json();
    return data.cache || {};
  } catch (error) {
    if (error.status === 401) return null;
  }

  try {
    const response = await this.apiRequest('/tmdb/cache');
    return await response.json();
  } catch (error) {
    console.error('[syncTmdbCache] Cache fallback failed:', error.message);
    return null;
  }
}
```

In `TMDB sync failures fall back to the existing cache`, capture the result and replace the cache-mutation assertion:

```js
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
```

In `TMDB sync authorization failures do not trigger a second protected request`, replace the call and final assertion with:

```js
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
```

In `Series render immediately while TMDB refresh redraws locally without another Pattern fetch`, change the stub to return the cache without mutating the app:

```js
app.syncTmdbCache = () => new Promise(resolve => {
  resolveSync = () => resolve({ 42: '中文名' });
});
```

- [ ] **Step 4: Verify GREEN and mutation strength**

```bash
node --test --test-name-pattern='older TMDB refresh|Series render immediately|TMDB sync' test/frontend-app.test.js
```

Expected: PASS. Temporarily remove the background generation guard, confirm the overlap test fails, then restore with `apply_patch`.

- [ ] **Step 5: Run gates and commit**

```bash
node --test test/frontend-app.test.js
npm run check
git diff --check
git add public/js/app.js test/frontend-app.test.js
git commit -m "fix: ignore stale TMDB Series refreshes"
```

---

### Task 2: Establish the Refined Maillard Shell and Tokens

**Files:**
- Modify: `public/index.html:13-320`
- Modify: `public/css/style.css`
- Modify: `test/frontend-app.test.js`

**Interfaces:**
- Consumes: existing login/main/nav IDs and Bootstrap `d-none`.
- Produces: approved semantic tokens plus `.login-shell`, `.app-shell`, `.app-navbar`, `.app-content`.

- [ ] **Step 1: Write the semantic shell behavior test**

Add `readFileSync` from `node:fs` and `join` from `node:path`, then:

```js
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
```

- [ ] **Step 2: Verify RED**

```bash
node --test --test-name-pattern='refined application shell' test/frontend-app.test.js
```

Expected: FAIL because the semantic shell, ambient layer, login divider, and approved theme-color hook are absent.

- [ ] **Step 3: Add semantic shell hooks without changing IDs**

Make these exact start-tag changes in `public/index.html`:

```html
<div id="login-container" class="login-container login-shell d-none">
  <div class="login-ambient" aria-hidden="true"></div>
  <div class="login-box login-panel">
```

Keep the existing login heading, `#login-form`, `#username`, `#password`, `#login-error`, submit button, `#oidc-login-container`, and SSO link inside `.login-panel` in their current order. The new `.login-ambient` is a sibling immediately before `.login-panel` and contains no controls. Inside `#oidc-login-container`, replace `<hr>` with `<div class="login-divider"><span>或</span></div>` so the local and SSO methods have a visible text separator.

Change the application and navigation start tags to:

```html
<div id="main-container" class="app-shell d-none">
  <nav class="navbar navbar-expand-lg navbar-dark sticky-top app-navbar">
```

Keep the navigation descendants unchanged: `.container`, `.navbar-brand`, `.navbar-toggler` with all `data-bs-*` and `aria-*` attributes, `#navbarNav`, the Patterns link, `#theme-toggle`, and `#logout-btn`. Replace the current `<div class="container mt-4">` around `#pattern-list` and `#pattern-edit` with `<main class="container app-content">`, and replace its matching closing `</div>` with `</main>`.

- [ ] **Step 4: Consolidate foundations under exact approved tokens**

Replace the current root/theme blocks with:

```css
:root {
  color-scheme: light;
  --surface-canvas: #f6f1e9;
  --surface-raised: #fffdf9;
  --surface-subtle: #eee5d8;
  --surface-hover: #f3ebe0;
  --text-primary: #382d27;
  --text-secondary: #74665d;
  --text-muted: #988a80;
  --border: #ddd0c1;
  --accent: #a86f4c;
  --accent-hover: #895638;
  --accent-contrast: #fffdf9;
  --success: #657a57;
  --warning: #b98238;
  --danger: #a84f43;
  --info: #627f91;
  --focus-ring: #2f6f9f;
  --shadow-rest: 0 8px 24px rgb(56 45 39 / 8%);
  --shadow-raised: 0 16px 40px rgb(56 45 39 / 16%);
  --radius-control: 8px;
  --radius-card: 12px;
  --radius-panel: 16px;
  --motion-fast: 160ms;
  --motion-view: 240ms;
  --motion-enter: 360ms;
}

[data-theme="dark"] {
  color-scheme: dark;
  --surface-canvas: #1f1915;
  --surface-raised: #2a211c;
  --surface-subtle: #352a23;
  --surface-hover: #403229;
  --text-primary: #eee5da;
  --text-secondary: #b8a99d;
  --text-muted: #97887d;
  --border: #4b3b31;
  --accent: #d09069;
  --accent-hover: #e0a27b;
  --accent-contrast: #1f1915;
  --focus-ring: #8cb8d4;
  --shadow-rest: 0 8px 24px rgb(0 0 0 / 22%);
  --shadow-raised: 0 18px 44px rgb(0 0 0 / 38%);
}
```

Consolidate `.login-box`, `.login-box h2`, `.btn`, `.navbar-brand`, and `.badge` so each has one non-media base block. Preserve the functional Toast, ConfirmDialog, skeleton, Pattern card, table, RSS, Series, and modal selectors, replacing hard-coded theme colors with tokens.

Add:

```css
body { min-width: 320px; background: var(--surface-canvas); color: var(--text-primary); font: 14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.btn:not(.btn-sm), .form-control, .form-select, .input-group-text { min-height: 36px; }
.login-shell { position: relative; min-height: 100vh; display: grid; place-items: center; overflow: hidden; padding: 24px; background: linear-gradient(145deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--text-primary))); }
.login-ambient { position: absolute; width: min(70vw, 760px); aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle, rgb(255 231 205 / 34%), transparent 68%); transform: translate(30%, -35%); pointer-events: none; }
.login-box { position: relative; width: min(100%, 400px); padding: 32px; border: 1px solid rgb(255 255 255 / 22%); border-radius: var(--radius-panel); background: color-mix(in srgb, var(--surface-raised) 94%, transparent); box-shadow: var(--shadow-raised); backdrop-filter: blur(18px); }
.login-divider { display: flex; align-items: center; gap: 10px; margin: 14px 0; color: var(--text-muted); font-size: .78rem; }
.login-divider::before, .login-divider::after { content: ""; flex: 1; border-top: 1px solid var(--border); }
#login-error { margin: 8px 0 12px; padding: 8px 10px; }
.app-navbar { background: color-mix(in srgb, var(--accent) 92%, var(--text-primary)) !important; border-bottom: 1px solid rgb(255 255 255 / 12%); box-shadow: 0 4px 18px rgb(56 45 39 / 12%); }
.app-content { padding-top: 24px; padding-bottom: 40px; }
```

Update `<meta name="theme-color">` from `#b07d62` to the approved light accent `#a86f4c`. Remove the speculative English comment above the first `.login-box` block and remove `.login-box:hover` translation.

- [ ] **Step 5: Verify GREEN and commit**

```bash
node --test --test-name-pattern='refined application shell|HTML pins CDN|browser responses' test/frontend-app.test.js
node - <<'NODE'
const css = require('node:fs').readFileSync('public/css/style.css', 'utf8');
for (const value of ['--surface-canvas: #f6f1e9', '--surface-raised: #fffdf9', '--text-primary: #382d27', '--accent: #a86f4c', '--motion-fast: 160ms', '--motion-view: 240ms', '--surface-canvas: #1f1915']) {
  if (!css.includes(value)) throw new Error(`missing CSS token: ${value}`);
}
for (const selector of ['login-box', 'navbar-brand', 'btn']) {
  const count = (css.match(new RegExp(`^\\.${selector}\\s*\\{`, 'gm')) || []).length;
  if (count !== 1) throw new Error(`expected one base .${selector} block, found ${count}`);
}
NODE
npm run check
git diff --check
git add public/index.html public/css/style.css test/frontend-app.test.js
git commit -m "style: refine Maillard application shell"
```

---

### Task 3: Build the Compact Pattern Workspace

**Files:**
- Modify: `public/index.html:74-151`
- Modify: `public/css/style.css`
- Modify: `public/js/app.js:536-590,1025-1530,1579-1625,2439-2482`
- Modify: `test/frontend-app.test.js`

**Interfaces:**
- Consumes: Task 2 tokens and `.app-content`; current `allPatterns`, `seriesList`, `filteredPatterns`, and selection helpers.
- Produces: `getPatternStatus(pattern): 'normal' | 'case-mismatch' | 'not-found'`, `updatePatternSummary()`, and IDs `pattern-total-count`, `pattern-issue-count`, `pattern-summary-selected`.

- [ ] **Step 1: Write workspace, summary, card-state, and empty-state tests**

Add:

```js
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
```

Add a behavior test with the three summary values and batch controls:

```js
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
```

Add:

```js
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
```

- [ ] **Step 2: Verify RED**

```bash
node --test --test-name-pattern='Pattern workspace|Pattern summary|empty state' test/frontend-app.test.js
```

Expected: FAIL because summary markup/methods, toolbar groups, batch wrapper, and semantic state classes do not exist.

- [ ] **Step 3: Replace the dense header with semantic groups**

Replace only the first `.d-flex.justify-content-between` block inside `#pattern-list` with this complete markup:

```html
<header class="pattern-page-heading">
  <div><p class="eyebrow">订阅规则</p><h1>Patterns</h1></div>
  <div class="pattern-summary" aria-label="Pattern 摘要">
    <span class="pattern-summary-chip"><strong id="pattern-total-count" class="pattern-summary-value">0</strong>总数</span>
    <span class="pattern-summary-chip pattern-summary-chip--warning"><strong id="pattern-issue-count" class="pattern-summary-value">0</strong>需关注</span>
    <span class="pattern-summary-chip"><strong id="pattern-summary-selected" class="pattern-summary-value">0</strong>已选择</span>
  </div>
</header>
<div class="pattern-toolbar">
  <div class="pattern-toolbar-discovery">
    <label class="search-control" for="search-input"><i class="bi bi-search" aria-hidden="true"></i><input type="search" class="form-control" id="search-input" placeholder="搜索系列、正则或字幕组"></label>
    <label class="filter-control" for="filter-status">
      <span>状态</span>
      <select class="form-select" id="filter-status">
        <option value="all">所有状态</option>
        <option value="normal">正常</option>
        <option value="case-mismatch">名称不一致</option>
        <option value="not-found">未找到系列</option>
      </select>
    </label>
    <div class="btn-group view-toggle" role="group" aria-label="视图切换">
      <button type="button" class="btn btn-outline-secondary active" id="view-card-btn" title="卡片视图" aria-label="卡片视图"><i class="bi bi-grid-3x3-gap" aria-hidden="true"></i></button>
      <button type="button" class="btn btn-outline-secondary" id="view-table-btn" title="表格视图" aria-label="表格视图"><i class="bi bi-list" aria-hidden="true"></i></button>
    </div>
  </div>
  <div class="pattern-toolbar-actions">
    <div id="batch-actions" class="batch-actions d-none">
      <button class="btn btn-outline-warning" id="batch-fix-btn"><i class="bi bi-wrench" aria-hidden="true"></i>批量修复</button>
      <button class="btn btn-outline-danger" id="batch-delete-btn"><i class="bi bi-trash" aria-hidden="true"></i>批量删除 (<span id="selected-count">0</span>)</button>
    </div>
    <span class="toolbar-divider" aria-hidden="true"></span>
    <button class="btn btn-outline-secondary" id="export-btn" title="导出配置" aria-label="导出配置"><i class="bi bi-download" aria-hidden="true"></i></button>
    <button class="btn btn-outline-primary" id="import-btn" type="button" title="导入配置" aria-label="导入配置"><i class="bi bi-upload" aria-hidden="true"></i></button>
    <input type="file" id="import-input" accept=".json" hidden>
    <button class="btn btn-primary" id="new-pattern-btn"><i class="bi bi-plus-lg" aria-hidden="true"></i>新建</button>
  </div>
</div>
```

Do not change any listed ID or button type. This removes the former `.input-group` filter wrapper, `.vr`, and inline search/filter width styles; the four filter option values and all import/export behavior stay unchanged.

- [ ] **Step 4: Centralize status and summary calculations**

Add:

```js
getPatternStatus(pattern) {
  const series = this.seriesList?.find(item => item.title.toLowerCase() === pattern.series.toLowerCase());
  if (!series) return 'not-found';
  return series.title === pattern.series ? 'normal' : 'case-mismatch';
}

updatePatternSummary() {
  const patterns = this.allPatterns || [];
  const total = document.getElementById('pattern-total-count');
  const issues = document.getElementById('pattern-issue-count');
  if (total) total.textContent = String(patterns.length);
  if (issues) issues.textContent = String(patterns.filter(item => this.getPatternStatus(item) !== 'normal').length);
}
```

At the top of each Pattern iteration in `renderPatterns()` and `createPatternCard()`, derive the same visible state:

```js
const status = this.getPatternStatus(pattern);
const statusMeta = {
  normal: { label: '正常', badgeClass: 'status-ok' },
  'case-mismatch': { label: '名称不一致', badgeClass: 'status-warning' },
  'not-found': { label: '未找到系列', badgeClass: 'status-error' }
}[status];
```

Set table and card status hooks with:

```js
tr.className = `pattern-row pattern-row--${status}`;
card.className = `pattern-card pattern-card--${status}`;
```

Place `<span class="pattern-status-badge"></span>` before the table's `.pattern-display-name`, and place `<span class="pattern-card-status-badge"></span>` in the card poster. After each constant template is created, assign the state class and label safely:

```js
const tableStatus = tr.querySelector('.pattern-status-badge');
tableStatus.classList.add(statusMeta.badgeClass);
tableStatus.textContent = statusMeta.label;
const cardStatus = card.querySelector('.pattern-card-status-badge');
cardStatus.classList.add(statusMeta.badgeClass);
cardStatus.textContent = statusMeta.label;
```

Preserve the current add/fix buttons and their data assigned with property setters. In `createPatternCard()`, remove the local `statusClass`/`statusText` branch.

Use `getPatternStatus()` for the status branch in `filterPatterns()`: `return statusFilter === 'all' || this.getPatternStatus(pattern) === statusFilter;`. Call `updatePatternSummary()` in `filterPatterns()` after assigning `filteredPatterns`.

Wrap batch buttons in `#batch-actions`, then extend `updateBatchUI()`:

```js
const count = String(selected.length);
const selectedCount = document.getElementById('selected-count');
const summarySelected = document.getElementById('pattern-summary-selected');
const batchActions = document.getElementById('batch-actions');
if (selectedCount) selectedCount.textContent = count;
if (summarySelected) summarySelected.textContent = count;
batchActions?.classList.toggle('d-none', selected.length === 0);
```

Retain current fixable-selection and select-all checked/indeterminate logic.

- [ ] **Step 5: Add compact card/loading hooks**

Change the signature to `createPatternCard(pattern, index = 0)`, then add the stagger property immediately after assigning the status-based `card.className` from Step 4:

```js
card.style.setProperty('--card-index', String(Math.min(index, 8)));
```

Render with:

```js
patterns.forEach((pattern, index) => container.appendChild(this.createPatternCard(pattern, index)));
```

Keep current safe text setters. For empty results, compute `const stateClass = isFiltered ? 'empty-state--filtered' : 'empty-state--library'` and add it to `.empty-state` and `.pattern-card-empty`; change the table empty row to `colspan="10"`. Replace the checkbox skeleton inline dimensions with `class="skeleton skeleton-checkbox"`.

- [ ] **Step 6: Add compact workspace CSS**

Replace the existing Pattern grid/card/status/action/skeleton/empty-state blocks with the following rules instead of appending a second set of overrides:

```css
.pattern-page-heading, .pattern-toolbar, .pattern-toolbar-discovery, .pattern-toolbar-actions, .pattern-summary, .batch-actions { display: flex; align-items: center; }
.pattern-page-heading { justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.pattern-page-heading h1 { margin: 0; font-size: clamp(1.5rem, 3vw, 2rem); }
.eyebrow { margin: 0 0 2px; color: var(--accent); font-size: .72rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.pattern-summary { gap: 8px; flex-wrap: wrap; }
.pattern-summary-chip { display: inline-flex; gap: 6px; align-items: baseline; padding: 6px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface-raised); color: var(--text-secondary); }
.pattern-summary-chip--warning { border-color: color-mix(in srgb, var(--warning) 45%, var(--border)); }
.pattern-summary-value { color: var(--text-primary); font-size: 1rem; }
.pattern-toolbar { justify-content: space-between; gap: 12px; margin-bottom: 16px; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--surface-raised); box-shadow: var(--shadow-rest); }
.pattern-toolbar-discovery, .pattern-toolbar-actions { gap: 8px; flex-wrap: wrap; }
.toolbar-divider { align-self: stretch; width: 1px; margin: 2px 4px; background: var(--border); }
.search-control { position: relative; min-width: min(320px, 50vw); }
.search-control > i { position: absolute; z-index: 2; left: 12px; top: 50%; translate: 0 -50%; color: var(--text-muted); }
.search-control .form-control { padding-left: 34px; }
.filter-control { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); }
.filter-control .form-select { width: auto; min-width: 132px; }
.batch-actions { gap: 8px; animation: batch-actions-in var(--motion-view) ease both; }
.pattern-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 12px; }
.pattern-card { position: relative; display: grid; grid-template-columns: 76px minmax(0, 1fr); grid-template-areas: "poster body" "footer footer"; min-height: 138px; border: 1px solid var(--border); border-left: 4px solid var(--success); border-radius: var(--radius-card); background: var(--surface-raised); box-shadow: var(--shadow-rest); overflow: clip; animation: card-enter var(--motion-enter) both; animation-delay: calc(min(var(--card-index, 0), 8) * 34ms); }
.pattern-card--case-mismatch { border-left-color: var(--warning); }
.pattern-card--not-found { border-left-color: var(--danger); }
.pattern-row--case-mismatch { box-shadow: inset 3px 0 var(--warning); }
.pattern-row--not-found { box-shadow: inset 3px 0 var(--danger); }
.pattern-status-badge, .pattern-card-status-badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 7px; font-size: .68rem; font-weight: 700; }
.status-ok { background: color-mix(in srgb, var(--success) 18%, transparent); color: var(--success); }
.status-warning { background: color-mix(in srgb, var(--warning) 18%, transparent); color: var(--warning); }
.status-error { background: color-mix(in srgb, var(--danger) 18%, transparent); color: var(--danger); }
.pattern-card-poster { grid-area: poster; min-height: 104px; }
.pattern-card-poster img { width: 100%; height: 100%; object-fit: cover; }
.pattern-card-body { grid-area: body; min-width: 0; padding: 12px; }
.pattern-card-footer { grid-area: footer; min-height: 38px; padding: 6px 10px; border-top: 1px solid var(--border); background: var(--surface-subtle); }
.pattern-card-title { overflow: hidden; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.pattern-card-actions { display: flex; gap: 4px; opacity: 1; transform: none; }
.pattern-card:has(.card-checkbox:checked) { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 24%, transparent); }
.empty-state--library, .empty-state--filtered { min-height: 220px; display: grid; place-items: center; align-content: center; text-align: center; }
.empty-state--filtered .empty-state-icon { color: var(--info); }
.skeleton-checkbox { width: 18px; height: 18px; }
```

Keep existing progress/action selectors, changing only dimensions/colors needed for this grid.

- [ ] **Step 7: Verify GREEN, mutate, gate, and commit**

```bash
node --test --test-name-pattern='Pattern workspace|Pattern summary|Pattern table renders|filtering renders|empty state|card checkboxes' test/frontend-app.test.js
```

Expected: PASS. Temporarily force `getPatternStatus()` to return `normal`, confirm the summary/card test fails, then restore.

```bash
node --test test/frontend-app.test.js
npm run check
git diff --check
git add public/index.html public/css/style.css public/js/app.js test/frontend-app.test.js
git commit -m "style: compact the Pattern workspace"
```

---

### Task 4: Restructure the Pattern Editor and Load Failures

**Files:**
- Modify: `public/index.html:154-317`
- Modify: `public/css/style.css`
- Modify: `public/js/app.js:8-18,536-565,2479-2482`
- Modify: `test/frontend-app.test.js`

**Interfaces:**
- Consumes: Task 2 tokens/motion and Task 3 view targets.
- Produces: `.editor-section`, `.editor-preview-panel`, `patternLoadError: string | null`, `renderPatternLoadError()`.

- [ ] **Step 1: Write editor and retryable-error tests**

```js
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

test('Pattern load failure is distinct and retries the request', () => {
  const dom = installDom('<div id="pattern-card-view"></div><div id="pattern-table-view"><table><tbody id="pattern-table-body"></tbody></table></div>');
  const app = makeApp();
  app.currentView = 'card';
  app.patternLoadError = '无法加载 Patterns';
  let retries = 0;
  app.loadPatterns = () => { retries += 1; };
  app.renderCurrentView([]);
  const state = document.querySelector('.load-error-state');
  assert.match(state.textContent, /无法加载 Patterns/);
  state.querySelector('.retry-pattern-load').click();
  assert.equal(retries, 1);
  cleanupDom(dom);
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test --test-name-pattern='Pattern editor groups|Pattern load failure' test/frontend-app.test.js
```

Expected: FAIL because the section/preview hooks and load-error state are absent.

- [ ] **Step 3: Group existing fields into four labelled sections**

Change the outer editor start tag to `<div id="pattern-edit" class="pattern-edit view-panel d-none">`. Replace its current heading with:

```html
<header class="editor-heading">
  <div><p class="eyebrow">Pattern 配置</p><h1 id="edit-title">新建 Pattern</h1></div>
  <button class="btn btn-outline-secondary" id="back-btn"><i class="bi bi-arrow-left" aria-hidden="true"></i>返回</button>
</header>
```

Replace the Bootstrap `.row`, `.col-lg-8`, outer form `.card`, and `.card-body` wrappers with `.editor-grid` and `.editor-main`. Keep `#pattern-form` and `#pattern-id`, then move the current field wrappers into the following four sections without changing the controls, their types, defaults, validation attributes, or helper/result nodes:

```html
<section class="editor-section" data-section="source" aria-labelledby="editor-source-title">
  <header class="editor-section-heading"><span class="editor-section-index">01</span><div><h2 id="editor-source-title">订阅来源</h2><p>导入 Mikan 链接并确认远程 RSS 来源。</p></div></header>
</section>
<section class="editor-section" data-section="matching" aria-labelledby="editor-matching-title">
  <header class="editor-section-heading"><span class="editor-section-index">02</span><div><h2 id="editor-matching-title">匹配规则</h2><p>编写正则并在保存前验证匹配结果。</p></div></header>
</section>
<section class="editor-section" data-section="mapping" aria-labelledby="editor-mapping-title">
  <header class="editor-section-heading"><span class="editor-section-index">03</span><div><h2 id="editor-mapping-title">Sonarr 映射</h2><p>选择目标系列与季度，并核对系列信息。</p></div></header>
</section>
<section class="editor-section" data-section="output" aria-labelledby="editor-output-title">
  <header class="editor-section-heading"><span class="editor-section-index">04</span><div><h2 id="editor-output-title">输出设置</h2><p>设置语言、质量、偏移、字幕组与生成的代理地址。</p></div></header>
</section>
```

Populate the sections in this exact order:

- `source`: the complete `#mikan-import` wrapper, followed by the complete `#remote` wrapper excluding `#proxy-url-box`.
- `matching`: the complete `#pattern` wrapper including `#escape-btn`, `#episode-btn`, `#test-pattern-btn`, `#pattern-test-result`, and `#pattern-test-output`.
- `mapping`: the complete row containing `#series`, `#form-add-series-btn`, `#series-info-card` and its descendants, followed by `#season`.
- `output`: the complete row containing `#language`, `#quality`, and `#offset`; then the `#releasegroup` wrapper; then `#proxy-url-box` with `#proxy-url` and `#copy-proxy-btn` moved intact from the Remote wrapper.

After the four sections, wrap the existing `#save-btn`, `#cancel-btn`, and `#edit-delete-btn` in `<div class="editor-actions">`, retaining their classes except that the wrapper replaces the former `.d-flex.gap-2`. Close `#pattern-form` and `.editor-main`, then replace `.col-lg-4` and its inline-styled sticky card with:

```html
<aside class="editor-preview-panel" aria-label="RSS 预览">
  <div class="card editor-preview-card">
    <div class="card-header"><h2 class="h6 mb-0"><i class="bi bi-rss" aria-hidden="true"></i> RSS 预览</h2></div>
    <div class="card-body"><div id="rss-preview" class="rss-preview"><p class="text-muted text-center">输入 RSS URL 加载预览</p></div></div>
  </div>
</aside>
```

No inline `top` style remains on the preview.

- [ ] **Step 4: Add explicit retryable Pattern-load state**

Initialize `this.patternLoadError = null` in the constructor. At the top of `loadPatterns()`, before `showSkeletonLoading()`, clear it:

```js
this.patternLoadError = null;
```

Replace the current catch state assignments/render call with:

```js
this.patternLoadError = '无法加载 Patterns，请检查连接后重试';
this.allPatterns = [];
this.filteredPatterns = [];
this.renderCurrentView([]);
```

At the top of `renderCurrentView()`:

```js
if (this.patternLoadError) {
  this.renderPatternLoadError();
  return;
}
```

Add:

```js
renderPatternLoadError() {
  const state = document.createElement('div');
  state.className = 'load-error-state';
  state.innerHTML = '<i class="bi bi-cloud-slash" aria-hidden="true"></i><h2>加载失败</h2><p></p><button type="button" class="btn btn-primary retry-pattern-load"><i class="bi bi-arrow-clockwise" aria-hidden="true"></i>重试</button>';
  state.querySelector('p').textContent = this.patternLoadError;
  state.querySelector('.retry-pattern-load').addEventListener('click', () => this.loadPatterns());
  const cards = document.getElementById('pattern-card-view');
  const tbody = document.getElementById('pattern-table-body');
  cards.replaceChildren();
  tbody.replaceChildren();
  if (this.currentView === 'card') cards.appendChild(state);
  else {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 10;
    cell.appendChild(state);
    row.appendChild(cell);
    tbody.appendChild(row);
  }
}
```

- [ ] **Step 5: Add editor/state CSS**

```css
.editor-heading { display: flex; justify-content: space-between; align-items: end; gap: 16px; margin-bottom: 16px; }
.editor-heading h1 { margin: 0; font-size: clamp(1.4rem, 3vw, 1.9rem); }
.editor-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: 16px; align-items: start; }
.editor-main { min-width: 0; }
.editor-section { margin-bottom: 12px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--surface-raised); box-shadow: var(--shadow-rest); }
.editor-section-heading { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 14px; }
.editor-section-heading h2 { margin: 0; font-size: 1rem; }
.editor-section-heading p { margin: 2px 0 0; color: var(--text-muted); font-size: .82rem; }
.editor-section-index { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--surface-subtle); color: var(--accent); font-size: .72rem; font-weight: 800; }
.editor-preview-panel { position: sticky; top: 82px; min-width: 0; }
.editor-preview-card { max-height: calc(100vh - 104px); }
.editor-preview-card .rss-preview { max-height: calc(100vh - 188px); }
.editor-actions { position: sticky; bottom: 8px; z-index: 4; display: flex; gap: 8px; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-card); background: color-mix(in srgb, var(--surface-raised) 94%, transparent); box-shadow: var(--shadow-raised); backdrop-filter: blur(12px); }
.editor-actions .btn { min-height: 40px; }
.load-error-state { min-height: 240px; display: grid; justify-items: center; align-content: center; gap: 8px; padding: 24px; text-align: center; color: var(--text-secondary); }
.load-error-state > i { color: var(--danger); font-size: 2rem; }
.load-error-state h2, .load-error-state p { margin: 0; }
```

- [ ] **Step 6: Verify, mutate, gate, and commit**

```bash
node --test --test-name-pattern='Pattern editor groups|Pattern load failure|RSS error|Pattern table renders' test/frontend-app.test.js
```

Expected: PASS. Remove the Retry listener temporarily and confirm the test fails; restore.

```bash
node --test test/frontend-app.test.js
npm run check
git diff --check
git add public/index.html public/css/style.css public/js/app.js test/frontend-app.test.js
git commit -m "style: restructure Pattern editor states"
```

---

### Task 5: Complete Responsive, Motion, and Dual-Theme Behavior

**Files:**
- Modify: `public/css/style.css`

**Interfaces:**
- Consumes: Task 2 tokens/shell hooks, Task 3 workspace/card hooks, Task 4 editor/state hooks, and existing `.toast-item`, `.confirm-overlay`, `.confirm-dialog`, `.modal-content`, and `.table-responsive` components.
- Produces: CSS-only responsive behavior at 991.98 px, 767.98 px, and 575.98 px; hover-capability rules; `prefers-reduced-motion` behavior; and `app-enter`, `card-enter`, `batch-actions-in`, `toast-enter`, `dialog-overlay-in`, `dialog-enter`, and `skeleton-shimmer` keyframes.

- [ ] **Step 1: Define the one-time CSS acceptance check**

Use this implementation-time check; it is deliberately not added to `node:test` because it validates stylesheet source contracts rather than user-visible JavaScript/DOM behavior:

```bash
node - <<'NODE'
const css = require('node:fs').readFileSync('public/css/style.css', 'utf8');
const requirements = [
  ...['app-enter', 'card-enter', 'batch-actions-in', 'toast-enter', 'dialog-overlay-in', 'dialog-enter', 'skeleton-shimmer'].map(name => `@keyframes ${name}`),
  '@media (max-width: 991.98px)',
  '@media (max-width: 575.98px)',
  '@media (hover: hover) and (pointer: fine)',
  '@media (prefers-reduced-motion: reduce)',
  'overscroll-behavior-inline: contain',
  'position: sticky'
];
const missing = requirements.filter(value => !css.includes(value));
if (missing.length) throw new Error(`missing CSS contracts: ${missing.join(', ')}`);
if (css.includes('minmax(140px, 1fr)')) throw new Error('legacy 140px mobile card grid remains');
NODE
```

- [ ] **Step 2: Verify RED**

Run against the pre-change stylesheet:

```bash
node - <<'NODE'
const css = require('node:fs').readFileSync('public/css/style.css', 'utf8');
const requirements = [
  ...['app-enter', 'card-enter', 'batch-actions-in', 'toast-enter', 'dialog-overlay-in', 'dialog-enter', 'skeleton-shimmer'].map(name => `@keyframes ${name}`),
  '@media (max-width: 991.98px)',
  '@media (max-width: 575.98px)',
  '@media (hover: hover) and (pointer: fine)',
  '@media (prefers-reduced-motion: reduce)',
  'overscroll-behavior-inline: contain',
  'position: sticky'
];
const missing = requirements.filter(value => !css.includes(value));
if (missing.length) throw new Error(`missing CSS contracts: ${missing.join(', ')}`);
if (css.includes('minmax(140px, 1fr)')) throw new Error('legacy 140px mobile card grid remains');
NODE
```

Expected: exit 1 listing the missing final keyframes, capability query, reduced-motion override, editor breakpoint, and sticky-table contracts.

- [ ] **Step 3: Add visible motion with a non-animated fallback**

Keep actions and content usable before animation. Add these base rules and keyframes in the reusable motion/component section:

```css
.app-shell:not(.d-none),
#pattern-card-view:not(.d-none),
#pattern-table-view:not(.d-none) { animation: app-enter var(--motion-enter) ease-out both; }
.login-panel { animation: dialog-enter var(--motion-enter) ease-out both; }
.toast-item { animation: toast-enter var(--motion-view) ease-out both; }
.confirm-overlay { animation: dialog-overlay-in var(--motion-view) ease-out both; }
.confirm-dialog { animation: dialog-enter var(--motion-enter) cubic-bezier(.2, .8, .2, 1) both; }
.modal.fade .modal-dialog { transition: transform var(--motion-view) ease-out; }
.skeleton { background-size: 220% 100%; animation: skeleton-shimmer 1.35s linear infinite; }

@keyframes app-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

@keyframes card-enter {
  from { opacity: 0; transform: translateY(10px) scale(.985); }
  to { opacity: 1; transform: none; }
}

@keyframes batch-actions-in {
  from { opacity: 0; transform: translateX(8px); }
  to { opacity: 1; transform: none; }
}

@keyframes toast-enter {
  from { opacity: 0; transform: translateX(18px); }
  to { opacity: 1; transform: none; }
}

@keyframes dialog-overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes dialog-enter {
  from { opacity: 0; transform: translateY(12px) scale(.97); }
  to { opacity: 1; transform: none; }
}

@keyframes skeleton-shimmer {
  to { background-position-x: -220%; }
}
```

Keep `.pattern-card-actions` at `opacity: 1; transform: none` in the base rule so touch and keyboard users always see actions. Move card lift and secondary-action dimming into the capability query only:

```css
@media (hover: hover) and (pointer: fine) {
  .pattern-card { transition: transform var(--motion-fast), box-shadow var(--motion-fast), border-color var(--motion-fast); }
  .pattern-card-actions { opacity: .38; transform: translateY(3px); transition: opacity var(--motion-fast), transform var(--motion-fast); }
  .pattern-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-raised); }
  .pattern-card:hover .pattern-card-actions,
  .pattern-card:focus-within .pattern-card-actions { opacity: 1; transform: none; }
  .table tbody tr .action-buttons { opacity: .38; transition: opacity var(--motion-fast); }
  .table tbody tr:hover .action-buttons,
  .table tbody tr:focus-within .action-buttons { opacity: 1; }
}
```

Remove the old unconditional card/table hover-action rules plus the superseded `fade-in`, `scale-in`, `toast-slide-in`, and `skeleton-loading` keyframes. Keep the existing `toast-slide-out` keyframe and `.toast-item.toast-leaving` rule for dismissal. Add the final accessibility override at the end of the stylesheet:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  .pattern-card,
  .pattern-card:hover,
  .confirm-dialog,
  .toast-item { transform: none !important; }
}
```

- [ ] **Step 4: Replace legacy mobile rules with the approved breakpoints**

Delete the old `@media (max-width: 768px)` editor-column override and the `@media (max-width: 576px)` two-column 140 px card grid. Add:

```css
.table-responsive {
  position: relative;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  scrollbar-gutter: stable;
}

.table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--surface-subtle);
  box-shadow: inset 0 -1px var(--border);
}

@media (max-width: 991.98px) {
  .pattern-toolbar { align-items: flex-start; flex-direction: column; }
  .pattern-toolbar-discovery,
  .pattern-toolbar-actions { width: 100%; }
  .pattern-toolbar-actions { justify-content: flex-end; }
  .editor-grid { grid-template-columns: minmax(0, 1fr); }
  .editor-preview-panel { position: static; }
  .editor-preview-card,
  .editor-preview-card .rss-preview { max-height: none; }
}

@media (max-width: 767.98px) {
  .app-content { padding-top: 16px; }
  .pattern-page-heading { align-items: flex-start; flex-direction: column; }
  .pattern-card-grid { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
  .editor-heading { align-items: flex-start; }
  .editor-section { padding: 14px; }
  .toast-container { right: 10px; left: 10px; }
  .toast-item { width: 100%; min-width: 0; }
}

@media (max-width: 575.98px) {
  .login-shell { padding: 16px; }
  .login-box { padding: 24px 20px; }
  .app-content { padding-right: 12px; padding-left: 12px; }
  .pattern-summary { width: 100%; }
  .pattern-summary-chip { flex: 1; justify-content: center; min-width: 96px; }
  .pattern-toolbar-discovery,
  .pattern-toolbar-actions { align-items: stretch; }
  .pattern-toolbar-discovery { flex-direction: column; }
  .search-control,
  .filter-control,
  .filter-control .form-select { width: 100%; min-width: 0; }
  .filter-control { align-items: flex-start; flex-direction: column; }
  .pattern-toolbar-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .batch-actions { display: contents; }
  .toolbar-divider { display: none; }
  #new-pattern-btn { grid-column: 1 / -1; }
  .pattern-card-grid { grid-template-columns: minmax(0, 1fr); }
  .pattern-card { grid-template-columns: 68px minmax(0, 1fr); }
  .pattern-card-actions { gap: 4px; }
  .pattern-card-actions .btn { min-width: 40px; min-height: 40px; }
  .editor-heading { flex-direction: column; }
  .editor-heading #back-btn { order: -1; }
  .editor-actions { flex-wrap: wrap; bottom: 4px; }
  .editor-actions #save-btn,
  .editor-actions #cancel-btn { flex: 1; }
  .editor-actions #edit-delete-btn { margin-left: 0 !important; }
}
```

- [ ] **Step 5: Normalize Bootstrap components in both themes**

Use semantic tokens for common surfaces and state classes so Bootstrap controls, the table, modal, Toast, ConfirmDialog, skeleton, and RSS preview do not fall back to cool defaults:

```css
.card,
.modal-content,
.confirm-dialog,
.toast-item,
.form-control,
.form-select,
.input-group-text {
  border-color: var(--border);
  background-color: var(--surface-raised);
  color: var(--text-primary);
}

.card-header,
.modal-header,
.modal-footer,
.table > :not(caption) > * > * { border-color: var(--border); }
.card-header,
.table,
.table > :not(caption) > * > * { background-color: transparent; color: var(--text-primary); }
.form-control::placeholder { color: var(--text-muted); opacity: 1; }
.form-control:focus,
.form-select:focus { border-color: var(--accent); box-shadow: 0 0 0 .2rem color-mix(in srgb, var(--focus-ring) 28%, transparent); }
.btn-primary { --bs-btn-color: var(--accent-contrast); --bs-btn-bg: var(--accent); --bs-btn-border-color: var(--accent); --bs-btn-hover-color: var(--accent-contrast); --bs-btn-hover-bg: var(--accent-hover); --bs-btn-hover-border-color: var(--accent-hover); }
.text-muted { color: var(--text-muted) !important; }
.bg-primary { background-color: var(--accent) !important; color: var(--accent-contrast) !important; }
.bg-secondary { background-color: var(--text-secondary) !important; color: var(--surface-raised) !important; }
.bg-success { background-color: var(--success) !important; }
.bg-warning { background-color: var(--warning) !important; }
.bg-danger { background-color: var(--danger) !important; }
.bg-info { background-color: var(--info) !important; }
.skeleton { background-image: linear-gradient(90deg, var(--surface-subtle) 25%, var(--surface-hover) 45%, var(--surface-subtle) 65%); }

[data-theme="dark"] .modal-content,
[data-theme="dark"] .confirm-dialog,
[data-theme="dark"] .toast-item,
[data-theme="dark"] .card,
[data-theme="dark"] .form-control,
[data-theme="dark"] .form-select,
[data-theme="dark"] .input-group-text { color-scheme: dark; }
[data-theme="dark"] .btn-close { filter: invert(1) grayscale(100%) brightness(180%); }
[data-theme="dark"] .table-hover > tbody > tr:hover > * { background-color: var(--surface-hover); color: var(--text-primary); }
```

Consolidate superseded hard-coded `.bg-*`, dark table/card, text-muted, form-control, and contextual badge overrides into these blocks. Keep the approved semantic values from Task 2 as their only color source.

- [ ] **Step 6: Verify focused contracts, full gates, and commit**

```bash
node - <<'NODE'
const css = require('node:fs').readFileSync('public/css/style.css', 'utf8');
const requirements = [
  ...['app-enter', 'card-enter', 'batch-actions-in', 'toast-enter', 'dialog-overlay-in', 'dialog-enter', 'skeleton-shimmer'].map(name => `@keyframes ${name}`),
  '@media (max-width: 991.98px)',
  '@media (max-width: 575.98px)',
  '@media (hover: hover) and (pointer: fine)',
  '@media (prefers-reduced-motion: reduce)',
  'overscroll-behavior-inline: contain',
  'position: sticky'
];
const missing = requirements.filter(value => !css.includes(value));
if (missing.length) throw new Error(`missing CSS contracts: ${missing.join(', ')}`);
if (css.includes('minmax(140px, 1fr)')) throw new Error('legacy 140px mobile card grid remains');
NODE
node --test --test-name-pattern='refined application shell|Pattern workspace|Pattern editor groups' test/frontend-app.test.js
npm run check
npm audit --omit=dev --audit-level=high
git diff --check
```

Expected: all test suites and syntax checks PASS; audit reports zero high/critical production vulnerabilities; whitespace check produces no output.

Run static regressions scans:

```bash
rg -n 'on(click|change|input|submit)=' public --glob '*.html'
rg -n 'innerHTML\s*=.*\$\{|insertAdjacentHTML|document\.write' public/js
rg -n 'console\.(log|warn|error).*?(token|password|cookie|authorization|remote)' public/js server --ignore-case
git diff -- package.json package-lock.json
```

Expected: no inline handlers; every dynamic-HTML match is either absent or an existing reviewed constant template whose caller-controlled values are assigned afterward with safe properties; no secret-bearing logs; dependency manifests have no diff.

Review `public/index.html` at a static DOM level and confirm that every pre-existing interactive ID still appears exactly once:

```bash
node - <<'NODE'
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('public/index.html', 'utf8');
const document = new JSDOM(html).window.document;
const ids = Array.from(document.querySelectorAll('[id]'), node => node.id);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) throw new Error(`duplicate IDs: ${[...new Set(duplicates)].join(', ')}`);
for (const id of ['login-form', 'username', 'password', 'theme-toggle', 'logout-btn', 'view-card-btn', 'view-table-btn', 'filter-status', 'batch-fix-btn', 'batch-delete-btn', 'export-btn', 'import-btn', 'import-input', 'search-input', 'new-pattern-btn', 'select-all', 'back-btn', 'pattern-form', 'pattern-id', 'mikan-import', 'import-mikan-btn', 'remote', 'refresh-rss-btn', 'proxy-url', 'copy-proxy-btn', 'pattern', 'escape-btn', 'episode-btn', 'test-pattern-btn', 'series', 'form-add-series-btn', 'series-sonarr-link', 'season', 'language', 'quality', 'offset', 'releasegroup', 'save-btn', 'cancel-btn', 'edit-delete-btn', 'sonarr-search-input', 'sonarr-search-btn', 'add-series-form', 'selected-tvdb-id', 'sonarr-root-folder', 'sonarr-quality-profile', 'sonarr-series-type', 'sonarr-monitor', 'sonarr-season-folder', 'add-series-back-btn', 'add-series-submit-btn']) {
  if (!document.getElementById(id)) throw new Error(`missing #${id}`);
}
NODE
```

Expected: exit 0 with no output.

```bash
git add public/css/style.css
git commit -m "style: finish responsive Maillard interactions"
```

---

## Final Delivery Notes

- Do not run or claim Docker image/runtime verification in this implementation session; report it as explicitly deferred until the user supplies the target environment.
- Before handoff, run `git status --short`, `git log --oneline --decorate -5`, and the complete Task 5 gates from the final implementation commit.
- Report the exact commands and results, any remaining static-scan matches with their safety rationale, and the deferred Docker check.
- Do not squash the five task commits unless the user requests it; each commit is an independent review/revert boundary.
