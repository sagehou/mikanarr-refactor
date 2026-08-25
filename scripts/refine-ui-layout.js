const { readFileSync, writeFileSync } = require('node:fs');

const cssPath = 'public/css/redesign.css';
let css = readFileSync(cssPath, 'utf8');
const tuningMarker = 'Visual QA refinement: keep the desktop library visible beside the editor.';
const tuning = String.raw`

/* ${tuningMarker} */
.ui-editor-context {
  flex: 0 0 auto;
  min-height: 72px;
  padding: 12px 22px;
  display: flex;
  align-items: center;
  gap: 11px;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-surface-soft);
}

.ui-editor-context.d-none { display: none !important; }
.ui-editor-context-art {
  width: 42px;
  height: 52px;
  flex: 0 0 42px;
  display: grid;
  place-items: center;
  border: 1px solid var(--ui-border);
  border-radius: 9px;
  color: var(--ui-accent-strong);
  background: linear-gradient(145deg, var(--ui-accent-soft), var(--ui-surface));
}
.ui-editor-context-copy { min-width: 0; display: grid; gap: 3px; }
.ui-editor-context-title {
  color: var(--ui-text-strong);
  font-size: 0.84rem;
  font-weight: 720;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ui-editor-context-meta {
  color: var(--ui-muted);
  font-size: 0.68rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ui-editor-context-status {
  margin-left: auto;
  padding: 4px 7px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 0.64rem;
  font-weight: 700;
  white-space: nowrap;
}

.rss-item.ui-rss-result {
  width: 100%;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  text-align: left;
}
.ui-rss-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ui-rss-result-badge {
  padding: 3px 7px;
  border-radius: 999px;
  color: var(--ui-neutral);
  background: var(--ui-neutral-soft);
  font-size: 0.63rem;
  font-weight: 700;
  white-space: nowrap;
}
.rss-item.matched .ui-rss-result-badge {
  color: var(--ui-success);
  background: var(--ui-success-soft);
}

@media (min-width: 1181px) {
  #pattern-edit.pattern-edit { width: min(520px, 42vw); }
  body.ui-drawer-open .app-content {
    width: calc(100vw - min(520px, 42vw) - 48px) !important;
    max-width: none !important;
    margin-left: 24px !important;
    margin-right: auto !important;
  }
}
`;
if (!css.includes(tuningMarker)) css += tuning;
writeFileSync(cssPath, css);

const jsPath = 'public/js/redesign.js';
let js = readFileSync(jsPath, 'utf8');
const contextFunctions = String.raw`
  function buildEditorContext() {
    const edit = document.getElementById('pattern-edit');
    const heading = edit?.querySelector('.editor-heading');
    if (!edit || !heading || edit.querySelector('.ui-editor-context')) return;

    const context = document.createElement('div');
    context.className = 'ui-editor-context d-none';
    context.innerHTML = [
      '<span class="ui-editor-context-art" aria-hidden="true"><i class="bi bi-broadcast"></i></span>',
      '<span class="ui-editor-context-copy">',
      '<strong class="ui-editor-context-title"></strong>',
      '<span class="ui-editor-context-meta"></span>',
      '</span>',
      '<span class="ui-editor-context-status"></span>'
    ].join('');
    heading.insertAdjacentElement('afterend', context);
  }

  function updateEditorContext(app, pattern) {
    const context = document.querySelector('.ui-editor-context');
    if (!context) return;
    context.classList.toggle('d-none', !pattern);
    if (!pattern) return;

    const statusMeta = {
      normal: ['正常', 'status-ok'],
      'case-mismatch': ['待修复', 'status-warning'],
      'not-found': ['未匹配', 'status-error'],
      unavailable: ['等待 Sonarr', 'status-muted']
    }[app.getPatternStatus(pattern)] || ['未知', 'status-muted'];

    context.querySelector('.ui-editor-context-title').textContent = pattern.series || '未命名订阅';
    context.querySelector('.ui-editor-context-meta').textContent = sourceLabel(pattern) + ' · S' + (pattern.season || '--');
    const status = context.querySelector('.ui-editor-context-status');
    status.className = 'ui-editor-context-status ' + statusMeta[1];
    status.textContent = statusMeta[0];
  }

`;
const tabsAnchor = '  function buildEditorTabs() {';
if (!js.includes('function buildEditorContext()')) {
  if (!js.includes(tabsAnchor)) throw new Error('editor tabs anchor not found');
  js = js.replace(tabsAnchor, contextFunctions + tabsAnchor);
}

if (!js.includes('    buildEditorContext();\n    buildEditorTabs();')) {
  const anchor = '    buildPaginationShell();\n    buildEditorTabs();';
  if (!js.includes(anchor)) throw new Error('static UI anchor not found');
  js = js.replace(anchor, '    buildPaginationShell();\n    buildEditorContext();\n    buildEditorTabs();');
}

if (!js.includes('updateEditorContext(this, pattern);')) {
  const anchor = "    document.body.classList.add('ui-drawer-open');\n\n    const title = document.getElementById('edit-title');";
  if (!js.includes(anchor)) throw new Error('show editor anchor not found');
  js = js.replace(anchor, "    document.body.classList.add('ui-drawer-open');\n    updateEditorContext(this, pattern);\n\n    const title = document.getElementById('edit-title');");
}

js = js.replace(
  "helpText.textContent = '用于从 RSS 标题中提取集数；规则必须包含命名捕获组 (?<episode>...)。';",
  "helpText.textContent = '用于匹配完整 RSS 标题并提取集数；规则必须包含命名捕获组 (?<episode>...)。';"
);
js = js.replace(
  '<div class="ui-pattern-example"><code>(?&lt;episode&gt;\\d+)</code><span>匹配任意数字，例如提取第 03 话中的 03</span></div>',
  '<div class="ui-pattern-example"><code>.* - (?&lt;episode&gt;\\d+)(?:\\D.*)?</code><span>匹配常见的 “标题 - 03” 形式</span></div>'
);
js = js.replace(
  '<div class="ui-pattern-example"><code>(?:第|EP|Episode)\\s*-?(?&lt;episode&gt;\\d+)</code><span>匹配 第 03 话 / EP03 / Episode 03</span></div>',
  '<div class="ui-pattern-example"><code>.*(?:第|EP|Episode)\\s*-?(?&lt;episode&gt;\\d+).*</code><span>匹配 第 03 话 / EP03 / Episode 03</span></div>'
);
js = js.replace(
  '<div class="ui-pattern-example"><code>S\\d+E(?&lt;episode&gt;\\d+)</code><span>匹配 S01E03 形式的集数</span></div>',
  '<div class="ui-pattern-example"><code>.*S\\d+E(?&lt;episode&gt;\\d+).*</code><span>匹配 S01E03 形式的集数</span></div>'
);

const rssWrapper = String.raw`
  const originalRenderRssPreview = proto.renderRssPreview;
  proto.renderRssPreview = function redesignedRenderRssPreview(...args) {
    const result = originalRenderRssPreview.apply(this, args);
    const preview = document.getElementById('rss-preview');
    const source = document.getElementById('pattern')?.value || '';
    let regex = null;
    try {
      regex = new RegExp('^' + source + '$');
    } catch (_) {}

    preview?.querySelectorAll('.rss-item').forEach((row, index) => {
      const title = this.rssItems?.[index] || row.textContent;
      const match = regex?.exec(title);
      const titleNode = document.createElement('span');
      titleNode.className = 'ui-rss-title';
      titleNode.textContent = title;
      const resultNode = document.createElement('span');
      resultNode.className = 'ui-rss-result-badge';
      resultNode.textContent = match?.groups?.episode ? 'E' + match.groups.episode : (match ? '匹配' : '未匹配');
      row.classList.add('ui-rss-result');
      row.replaceChildren(titleNode, resultNode);
    });
    return result;
  };

`;
const batchAnchor = '  proto.batchUpdateSelection = async function batchUpdateSelection() {';
if (!js.includes('redesignedRenderRssPreview')) {
  if (!js.includes(batchAnchor)) throw new Error('batch update anchor not found');
  js = js.replace(batchAnchor, rssWrapper + batchAnchor);
}

writeFileSync(jsPath, js);
