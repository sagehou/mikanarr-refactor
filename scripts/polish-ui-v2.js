const { readFileSync, writeFileSync } = require('node:fs');

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`anchor not found: ${label}`);
  return text.replace(from, to);
}

const cssPath = 'public/css/redesign.css';
const jsPath = 'public/js/redesign.js';
const testPath = 'test/frontend-redesign.test.js';

let css = readFileSync(cssPath, 'utf8');
const marker = 'UI polish v2: alignment, contrast, motion and simpler editor navigation.';
if (!css.includes(marker)) {
  css += String.raw`

/* ${marker} */
:root,
[data-theme="light"] {
  --ui-field-bg: #fbfcfd;
  --ui-field-border: #c5d0d8;
  --ui-field-border-hover: #aebbc5;
  --ui-placeholder: #8996a0;
}

[data-theme="dark"] {
  --ui-field-bg: #202a31;
  --ui-field-border: #4a5963;
  --ui-field-border-hover: #60717c;
  --ui-placeholder: #8f9ca5;
}

.view-toggle .btn,
.pattern-toolbar-actions > .btn,
#new-pattern-btn {
  height: 40px;
  min-height: 40px;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  gap: 6px;
  line-height: 1;
  border-radius: 9px !important;
}

.pattern-toolbar-actions > .btn i,
#new-pattern-btn i,
.pattern-card-actions .btn i {
  line-height: 1;
  font-size: 0.9rem;
}

.pattern-card-footer {
  min-height: 48px;
  padding: 8px 10px !important;
}

.pattern-card-actions {
  margin-left: auto;
  align-items: center !important;
  flex-wrap: nowrap !important;
  gap: 6px !important;
}

.pattern-card-actions .btn {
  width: 32px !important;
  min-width: 32px !important;
  height: 32px !important;
  padding: 0 !important;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  border-radius: 8px !important;
}

.pattern-card-actions .btn span {
  display: none !important;
}

.ui-card-title-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ui-card-title-row .pattern-card-title {
  flex: 1 1 auto;
  min-width: 0;
  max-width: none !important;
  margin: 0;
}

.ui-card-title-row .pattern-card-status-badge,
.pattern-card-status-badge {
  position: static !important;
  inset: auto !important;
  flex: 0 0 auto;
  margin: 0 !important;
  line-height: 1.2;
  align-self: center;
}

.search-control .form-control,
#pattern-form .form-control,
#pattern-form .form-select {
  color: var(--ui-text) !important;
  background: var(--ui-field-bg) !important;
  border-color: var(--ui-field-border) !important;
}

.search-control .form-control::placeholder,
#pattern-form .form-control::placeholder {
  color: var(--ui-placeholder) !important;
  opacity: 1;
}

#pattern-form .input-group > .btn {
  color: var(--ui-text) !important;
  background: var(--ui-surface-soft) !important;
  border-color: var(--ui-field-border) !important;
}

.search-control .form-control:hover,
#pattern-form .form-control:hover,
#pattern-form .form-select:hover,
#pattern-form .input-group > .btn:hover {
  border-color: var(--ui-field-border-hover) !important;
}

.search-control .form-control:focus,
#pattern-form .form-control:focus,
#pattern-form .form-select:focus {
  background: var(--ui-surface) !important;
  border-color: var(--ui-accent) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-accent) 22%, transparent) !important;
}

#pattern-form textarea.form-control {
  min-height: 106px;
  line-height: 1.55;
}

#pattern-edit.pattern-edit {
  width: min(500px, 40vw);
  transform: translateX(102%);
  opacity: 0.985;
  visibility: hidden;
  pointer-events: none;
  transition:
    transform 220ms cubic-bezier(.2, .75, .25, 1),
    opacity 180ms ease,
    visibility 0s linear 220ms;
  will-change: transform;
}

#pattern-edit.pattern-edit.is-open {
  transform: translateX(0);
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition:
    transform 220ms cubic-bezier(.2, .75, .25, 1),
    opacity 180ms ease,
    visibility 0s linear 0s;
}

.app-content {
  transition: width 220ms cubic-bezier(.2, .75, .25, 1), margin 220ms cubic-bezier(.2, .75, .25, 1);
}

.ui-editor-tabs {
  gap: 6px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--ui-border);
}

.ui-editor-tab {
  flex: 1 1 0;
  padding: 9px 12px;
  border: 1px solid transparent;
  border-radius: 9px;
}

.ui-editor-tab::after {
  display: none;
}

.ui-editor-tab.active {
  color: var(--ui-text-strong);
  border-color: var(--ui-border);
  background: var(--ui-accent-soft);
}

.editor-section + .editor-section:not(.ui-tab-hidden) {
  border-top: 1px solid var(--ui-border) !important;
}

@media (min-width: 1181px) {
  #pattern-edit.pattern-edit {
    width: min(500px, 40vw);
  }

  body.ui-drawer-open .app-content {
    width: calc(100vw - min(500px, 40vw) - 44px) !important;
    margin-left: 22px !important;
  }

  body.ui-drawer-open .pattern-card-grid {
    grid-template-columns: repeat(2, minmax(310px, 1fr));
  }
}

@media (max-width: 1180px) {
  #pattern-edit.pattern-edit {
    width: min(540px, 64vw);
  }
}

@media (max-width: 840px) {
  #pattern-edit.pattern-edit {
    width: 100vw;
  }
}

@media (prefers-reduced-motion: reduce) {
  #pattern-edit.pattern-edit,
  .app-content {
    transition: none !important;
  }
}
`;
}
writeFileSync(cssPath, css);

let js = readFileSync(jsPath, 'utf8');
js = replaceOnce(
  js,
  `  const TAB_LABELS = [\n    ['source', '基础'],\n    ['matching', '匹配规则'],\n    ['mapping', 'Sonarr'],\n    ['output', '高级']\n  ];`,
  `  const TAB_LABELS = [\n    ['settings', '订阅设置'],\n    ['matching', '匹配规则']\n  ];\n\n  const TAB_SECTIONS = {\n    settings: new Set(['source', 'mapping', 'output']),\n    matching: new Set(['matching'])\n  };`,
  'tab labels'
);

js = replaceOnce(
  js,
  `  function applyEditorTab(sectionName) {\n    const edit = document.getElementById('pattern-edit');\n    if (!edit) return;\n    edit.querySelectorAll('.editor-section').forEach(section => {\n      section.classList.toggle('ui-tab-hidden', section.dataset.section !== sectionName);\n    });\n    edit.querySelectorAll('.ui-editor-tab').forEach(tab => {\n      const active = tab.dataset.section === sectionName;\n      tab.classList.toggle('active', active);\n      tab.setAttribute('aria-selected', String(active));\n      tab.tabIndex = active ? 0 : -1;\n    });\n  }`,
  `  function applyEditorTab(sectionName) {\n    const edit = document.getElementById('pattern-edit');\n    if (!edit) return;\n    const visibleSections = TAB_SECTIONS[sectionName] || new Set([sectionName]);\n    edit.querySelectorAll('.editor-section').forEach(section => {\n      section.classList.toggle('ui-tab-hidden', !visibleSections.has(section.dataset.section));\n    });\n    edit.querySelectorAll('.ui-editor-tab').forEach(tab => {\n      const active = tab.dataset.section === sectionName;\n      tab.classList.toggle('active', active);\n      tab.setAttribute('aria-selected', String(active));\n      tab.tabIndex = active ? 0 : -1;\n    });\n    edit.querySelector('.editor-grid')?.scrollTo?.({ top: 0, behavior: 'smooth' });\n  }`,
  'applyEditorTab'
);

const statusAnchor = `    const status = card.querySelector('.pattern-card-status-badge');\n    if (status?.textContent === '名称不一致') status.textContent = '待修复';\n    if (status?.textContent === '未找到系列') status.textContent = '未匹配';\n`;
const statusReplacement = `${statusAnchor}\n    const body = card.querySelector('.pattern-card-body');\n    const title = card.querySelector('.pattern-card-title');\n    if (body && title && status && !body.querySelector('.ui-card-title-row')) {\n      const titleRow = document.createElement('div');\n      titleRow.className = 'ui-card-title-row';\n      title.before(titleRow);\n      titleRow.append(title, status);\n    }\n`;
js = replaceOnce(js, statusAnchor, statusReplacement, 'card title row');

js = replaceOnce(
  js,
  `    applyEditorTab(pattern ? 'matching' : 'source');\n    return result;`,
  `    const edit = document.getElementById('pattern-edit');\n    edit?.classList.remove('is-open');\n    void edit?.offsetWidth;\n    edit?.classList.add('is-open');\n    edit?.setAttribute('aria-hidden', 'false');\n    applyEditorTab(pattern ? 'matching' : 'settings');\n    return result;`,
  'drawer open'
);

js = replaceOnce(
  js,
  `  const originalShowPatternList = proto.showPatternList;\n  proto.showPatternList = function redesignedShowPatternList(...args) {\n    const result = originalShowPatternList.apply(this, args);\n    document.body.classList.remove('ui-drawer-open');\n    return result;\n  };`,
  `  const originalShowPatternList = proto.showPatternList;\n  proto.showPatternList = function redesignedShowPatternList(...args) {\n    const edit = document.getElementById('pattern-edit');\n    const list = document.getElementById('pattern-list');\n    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;\n    const returnFocus = this.viewReturnFocus;\n\n    document.body.classList.remove('ui-drawer-open');\n    edit?.classList.remove('is-open');\n    edit?.setAttribute('aria-hidden', 'true');\n    this.currentPatternId = null;\n    this.updatePageTitle('Patterns');\n    this.viewReturnFocus = null;\n\n    const finish = () => {\n      edit?.classList.add('d-none');\n      list?.classList.remove('d-none');\n      updateEditorContext(this, null);\n      if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus({ preventScroll: true });\n      else document.getElementById('search-input')?.focus({ preventScroll: true });\n    };\n\n    if (!edit || reducedMotion) {\n      finish();\n      return;\n    }\n\n    window.setTimeout(finish, 230);\n  };`,
  'drawer close'
);

writeFileSync(jsPath, js);

let test = readFileSync(testPath, 'utf8');
test = replaceOnce(
  test,
  `    ['基础', '匹配规则', 'Sonarr', '高级']`,
  `    ['订阅设置', '匹配规则']`,
  'tab test'
);
writeFileSync(testPath, test);
