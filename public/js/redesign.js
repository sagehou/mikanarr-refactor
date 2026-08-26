(() => {
  'use strict';

  if (!window.MikanarrApp) return;

  const proto = window.MikanarrApp.prototype;
  const PAGE_SIZE = 12;
  const TAB_LABELS = [
    ['settings', '订阅设置'],
    ['matching', '匹配规则']
  ];

  const TAB_SECTIONS = {
    settings: new Set(['source', 'mapping', 'output']),
    matching: new Set(['matching'])
  };

  const UI_TUNING_STYLE_ID = 'ui-density-preview-tuning';
  const UI_TUNING_CSS = `
    :root,
    [data-theme="light"] {
      --ui-bg: #f3f6f8;
      --ui-surface: #ffffff;
      --ui-surface-soft: #f7f9fb;
      --ui-surface-selected: #edf3f7;
      --ui-text: #34424d;
      --ui-text-strong: #172630;
      --ui-muted: #5d6e79;
      --ui-border: #d2dce2;
      --ui-border-strong: #b9c7d0;
      --ui-accent: #607a93;
      --ui-accent-strong: #4f6982;
      --ui-accent-soft: #e6edf3;
      --ui-success: #4f7f6e;
      --ui-success-soft: #e4f0eb;
      --ui-warning: #8d6e43;
      --ui-warning-soft: #f3eadc;
      --ui-danger: #95615e;
      --ui-danger-soft: #f3e6e5;
      --ui-neutral: #687985;
      --ui-neutral-soft: #edf1f4;
      --ui-field-bg: #ffffff;
      --ui-field-border: #b8c5ce;
      --ui-field-border-hover: #98aab5;
      --ui-placeholder: #657681;
    }

    [data-theme="dark"] {
      --ui-muted: #aab6bd;
      --ui-border: #3b4952;
      --ui-border-strong: #53626c;
      --ui-field-bg: #202a31;
      --ui-field-border: #56656f;
      --ui-field-border-hover: #72828d;
      --ui-placeholder: #bac4ca;
    }

    .app-navbar .nav-link.active {
      color: var(--ui-accent-strong) !important;
      background: var(--ui-accent-soft) !important;
      border-radius: 8px;
    }

    .app-navbar #logout-btn {
      color: var(--ui-text) !important;
      border-color: var(--ui-border-strong) !important;
      background: var(--ui-surface) !important;
    }

    .pattern-page-heading .page-lead,
    .pattern-card-title-zh,
    .ui-card-details,
    .ui-card-detail i,
    #pattern-form .form-text,
    .editor-section-heading p,
    .ui-editor-context-meta,
    .ui-pagination-meta {
      color: var(--ui-muted) !important;
    }

    .pattern-card-language,
    .pattern-card-meta .badge.bg-danger,
    .pattern-card-meta .badge.text-bg-danger {
      color: #704d49 !important;
      background: #f1e6e4 !important;
      border-color: #dcc5c1 !important;
    }

    .pattern-card-quality,
    .pattern-card-meta .badge.bg-primary,
    .pattern-card-meta .badge.text-bg-primary {
      color: #4a637c !important;
      background: #e5ecf3 !important;
      border-color: #c8d5e0 !important;
    }

    .pattern-card-meta .badge {
      opacity: 1 !important;
    }

    .status-ok {
      color: #3f715f !important;
      background: #e4f0eb !important;
      border-color: #c5ddd3 !important;
    }

    .status-warning {
      color: #7b5c32 !important;
      background: #f4eadb !important;
      border-color: #e0cfb5 !important;
    }

    .status-error {
      color: #854f4c !important;
      background: #f4e6e5 !important;
      border-color: #dfc3c0 !important;
    }

    .pattern-card-actions .btn {
      color: #566873 !important;
      border-color: #c1cdd5 !important;
      background: #ffffff !important;
    }

    .pattern-card-actions .btn:hover {
      color: var(--ui-text-strong) !important;
      border-color: #9fb0bb !important;
      background: #f4f7f9 !important;
    }

    #pattern-card-view.d-none,
    .pattern-card-grid.d-none,
    #pattern-table-view.d-none {
      display: none !important;
    }

    .pattern-card-grid:not(.d-none) {
      display: grid !important;
    }

    .ui-preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .ui-preview-header h2 {
      min-width: 0;
      margin: 0;
    }

    .ui-preview-refresh {
      min-height: 30px !important;
      padding: 4px 9px !important;
      display: inline-flex !important;
      align-items: center;
      gap: 5px;
      border: 1px solid var(--ui-field-border) !important;
      border-radius: 8px !important;
      color: var(--ui-text) !important;
      background: var(--ui-surface) !important;
      font-size: 0.7rem !important;
      font-weight: 650;
      white-space: nowrap;
    }

    .ui-preview-refresh:hover:not(:disabled) {
      border-color: var(--ui-field-border-hover) !important;
      background: var(--ui-surface-soft) !important;
    }

    .ui-preview-refresh:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .ui-preview-source {
      min-width: 0;
      margin: -1px 0 9px;
      padding: 7px 9px;
      display: flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--ui-border);
      border-radius: 8px;
      color: var(--ui-muted);
      background: var(--ui-surface-soft);
      font-size: 0.67rem;
    }

    .ui-preview-source > i {
      flex: 0 0 auto;
      color: var(--ui-accent-strong);
    }

    .ui-preview-source-value {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (min-width: 1500px) {
      .app-content {
        width: min(1860px, calc(100% - 40px)) !important;
      }

      .pattern-card-grid:not(.d-none) {
        grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
        gap: 10px !important;
      }

      body.ui-drawer-open .app-content {
        width: calc(100vw - min(500px, 40vw) - 30px) !important;
        margin-left: 15px !important;
        margin-right: auto !important;
      }

      body.ui-drawer-open .pattern-card-grid:not(.d-none) {
        grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      }
    }

    @media (min-width: 1181px) and (max-width: 1499px) {
      .app-content {
        width: calc(100% - 32px) !important;
      }

      .pattern-card-grid:not(.d-none) {
        grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      }

      body.ui-drawer-open .pattern-card-grid:not(.d-none) {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      }
    }
  `;

  function injectUiTuningStyles() {
    if (document.getElementById(UI_TUNING_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = UI_TUNING_STYLE_ID;
    style.textContent = UI_TUNING_CSS;
    document.head.appendChild(style);
  }

  function remoteRssValue() {
    return document.getElementById('remote')?.value?.trim() || '';
  }

  function setPreviewRefreshBusy(busy) {
    const button = document.getElementById('ui-preview-refresh-btn');
    if (!button) return;
    button.disabled = busy || !remoteRssValue();
    button.innerHTML = busy
      ? '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>刷新中</span>'
      : '<i class="bi bi-arrow-clockwise" aria-hidden="true"></i><span>刷新 RSS</span>';
  }

  function syncPreviewSource(app = window.mikanarrApp) {
    const remote = remoteRssValue();
    const source = document.querySelector('.ui-preview-source-value');
    if (source) {
      source.textContent = remote || '尚未设置 Remote RSS URL';
      source.title = remote;
    }
    const button = document.getElementById('ui-preview-refresh-btn');
    if (button) button.disabled = Boolean(app?.uiPreviewLoading) || !remote;

    const preview = document.getElementById('rss-preview');
    if (!remote && preview && !preview.querySelector('.rss-item')) {
      preview.innerHTML = '<p class="text-muted text-center mb-0">请先在“订阅设置”填写 Remote RSS URL</p>';
    }
  }

  function safeDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value) {
    const date = safeDate(value);
    if (!date) return '尚无匹配记录';
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replaceAll('/', '-');
  }

  function sourceLabel(pattern) {
    if (pattern.releasegroup) return pattern.releasegroup;
    if (!pattern.remote) return '未标注来源';
    try {
      return new URL(pattern.remote).hostname.replace(/^www\./, '');
    } catch (_) {
      return 'RSS 来源';
    }
  }

  function setButtonLabel(button, icon, label) {
    if (!button) return;
    button.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i><span>${label}</span>`;
  }

  function selectedIds(app) {
    return app.getVisibleCheckboxes()
      .filter(checkbox => checkbox.checked)
      .map(checkbox => Number.parseInt(checkbox.dataset.id, 10))
      .filter(Number.isFinite);
  }

  function syncSelectedCardStyles(app) {
    app.getVisibleCheckboxes().forEach(checkbox => {
      checkbox.closest('.pattern-card')?.classList.toggle('is-selected', checkbox.checked);
    });
  }

  function buildStatCard({ id, label, icon, tone = 'accent', title = '' }) {
    const article = document.createElement('article');
    article.className = 'ui-stat-card';
    article.dataset.tone = tone;
    if (title) article.title = title;

    const iconBox = document.createElement('span');
    iconBox.className = 'ui-stat-icon';
    iconBox.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`;

    const labelNode = document.createElement('span');
    labelNode.className = 'ui-stat-label';
    labelNode.textContent = label;

    const value = document.createElement('strong');
    value.className = 'ui-stat-value';
    value.id = id;
    value.textContent = '0';

    article.append(iconBox, labelNode, value);
    return article;
  }

  function buildSummary() {
    const summary = document.querySelector('.pattern-summary');
    if (!summary || summary.classList.contains('ui-summary-grid')) return;
    summary.className = 'pattern-summary ui-summary-grid';
    summary.replaceChildren(
      buildStatCard({ id: 'pattern-total-count', label: '总订阅', icon: 'bi-collection' }),
      buildStatCard({ id: 'pattern-normal-count', label: '正常', icon: 'bi-check-circle', tone: 'success' }),
      buildStatCard({ id: 'pattern-issue-count', label: '需修复', icon: 'bi-exclamation-triangle', tone: 'warning' }),
      buildStatCard({ id: 'pattern-recent-count', label: '最近更新', icon: 'bi-clock-history', title: '近 7 天有匹配记录的订阅' })
    );
  }

  function buildFilterChips() {
    const select = document.getElementById('filter-status');
    const discovery = document.querySelector('.pattern-toolbar-discovery');
    if (!select || !discovery || document.querySelector('.ui-filter-chips')) return;

    const group = document.createElement('div');
    group.className = 'ui-filter-chips';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', '订阅状态筛选');

    const choices = [
      ['all', '全部'],
      ['normal', '正常'],
      ['case-mismatch', '需修复'],
      ['not-found', '未绑定']
    ];

    choices.forEach(([value, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `ui-filter-chip${select.value === value ? ' active' : ''}`;
      button.dataset.value = value;
      button.textContent = label;
      button.addEventListener('click', () => {
        select.value = value;
        group.querySelectorAll('.ui-filter-chip').forEach(node => {
          node.classList.toggle('active', node === button);
        });
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      group.appendChild(button);
    });

    const viewToggle = discovery.querySelector('.view-toggle');
    discovery.insertBefore(group, viewToggle || null);
  }

  function buildBatchToolbar() {
    const list = document.getElementById('pattern-list');
    const existing = document.getElementById('batch-actions');
    const toolbar = document.querySelector('.pattern-toolbar');
    if (!list || !existing || !toolbar || document.querySelector('.ui-batch-toolbar')) return;

    const shell = document.createElement('div');
    shell.className = 'ui-batch-toolbar';
    shell.setAttribute('aria-live', 'polite');

    const inner = document.createElement('div');
    inner.className = 'ui-batch-toolbar-inner';

    const label = document.createElement('span');
    label.className = 'ui-batch-selected-label';
    label.innerHTML = '已选 <strong id="ui-selected-count">0</strong> 项';

    existing.querySelector('#batch-delete-btn')?.replaceChildren();
    const deleteButton = existing.querySelector('#batch-delete-btn');
    if (deleteButton) {
      deleteButton.innerHTML = '<i class="bi bi-trash" aria-hidden="true"></i><span>批量删除</span><span id="selected-count" class="visually-hidden">0</span>';
    }
    setButtonLabel(existing.querySelector('#batch-fix-btn'), 'bi-wrench-adjustable', '批量修复');

    const updateButton = document.createElement('button');
    updateButton.type = 'button';
    updateButton.className = 'btn';
    updateButton.id = 'batch-update-btn';
    updateButton.innerHTML = '<i class="bi bi-arrow-repeat" aria-hidden="true"></i><span>批量更新</span>';
    updateButton.title = '重新获取选中订阅的最新数据';

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'btn';
    copyButton.id = 'batch-copy-btn';
    copyButton.innerHTML = '<i class="bi bi-link-45deg" aria-hidden="true"></i><span>批量复制链接</span>';

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'btn';
    clearButton.id = 'batch-clear-btn';
    clearButton.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i><span>取消选择</span>';

    existing.append(updateButton, copyButton, clearButton);
    inner.append(label, existing);
    shell.appendChild(inner);
    toolbar.insertAdjacentElement('afterend', shell);
  }

  function buildPaginationShell() {
    if (document.getElementById('ui-pagination')) return;
    const table = document.getElementById('pattern-table-view');
    if (!table) return;
    const pager = document.createElement('nav');
    pager.id = 'ui-pagination';
    pager.className = 'ui-pagination';
    pager.setAttribute('aria-label', '订阅分页');
    table.insertAdjacentElement('afterend', pager);
  }

  function visiblePageNumbers(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
    const pages = new Set([1, total, current - 1, current, current + 1]);
    const sorted = Array.from(pages).filter(page => page >= 1 && page <= total).sort((a, b) => a - b);
    const result = [];
    sorted.forEach((page, index) => {
      if (index && page - sorted[index - 1] > 1) result.push('…');
      result.push(page);
    });
    return result;
  }

  function renderPagination(app, totalItems) {
    const pager = document.getElementById('ui-pagination');
    if (!pager) return;
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const current = Math.min(Math.max(1, app.uiCurrentPage || 1), totalPages);
    app.uiCurrentPage = current;

    if (totalItems <= PAGE_SIZE) {
      pager.replaceChildren();
      pager.classList.add('d-none');
      return;
    }

    pager.classList.remove('d-none');
    const pages = document.createElement('div');
    pages.className = 'ui-pagination-pages';

    const makeButton = (content, page, { active = false, disabled = false, label = '' } = {}) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `ui-page-btn${active ? ' active' : ''}`;
      button.disabled = disabled;
      button.setAttribute('aria-label', label || `第 ${page} 页`);
      if (active) button.setAttribute('aria-current', 'page');
      if (typeof content === 'string' && content.startsWith('<i')) button.innerHTML = content;
      else button.textContent = String(content);
      if (!disabled && !active) {
        button.addEventListener('click', () => {
          app.uiCurrentPage = page;
          app.renderCurrentView(app.uiVisiblePatterns || []);
          document.getElementById('pattern-card-view')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
        });
      }
      return button;
    };

    pages.appendChild(makeButton('<i class="bi bi-chevron-left" aria-hidden="true"></i>', current - 1, {
      disabled: current === 1,
      label: '上一页'
    }));

    visiblePageNumbers(current, totalPages).forEach(page => {
      if (page === '…') {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'ui-page-btn';
        ellipsis.textContent = '…';
        ellipsis.setAttribute('aria-hidden', 'true');
        pages.appendChild(ellipsis);
      } else {
        pages.appendChild(makeButton(page, page, { active: page === current }));
      }
    });

    pages.appendChild(makeButton('<i class="bi bi-chevron-right" aria-hidden="true"></i>', current + 1, {
      disabled: current === totalPages,
      label: '下一页'
    }));

    const meta = document.createElement('div');
    meta.className = 'ui-pagination-meta';
    meta.textContent = `第 ${current} 页 / 共 ${totalPages} 页 · ${PAGE_SIZE} 条 / 页`;
    pager.replaceChildren(pages, meta);
  }

  function buildPatternHelp() {
    const matching = document.querySelector('.editor-section[data-section="matching"]');
    const field = matching?.querySelector('#pattern')?.closest('.mb-3');
    if (!matching || !field || matching.querySelector('.ui-pattern-help')) return;

    const label = field.querySelector('label[for="pattern"]');
    if (label) label.textContent = '集数匹配规则';

    const helpText = document.createElement('div');
    helpText.className = 'form-text ui-pattern-helper';
    helpText.textContent = '用于匹配完整 RSS 标题并提取集数；规则必须包含命名捕获组 (?<episode>...)。';
    field.querySelector('#pattern')?.insertAdjacentElement('afterend', helpText);

    const help = document.createElement('details');
    help.className = 'ui-pattern-help';
    help.innerHTML = `
      <summary>常用示例</summary>
      <div class="ui-pattern-help-list">
        <div class="ui-pattern-example"><code>(?&lt;episode&gt;\\d+)</code><span>匹配任意数字，例如提取第 03 话中的 03</span></div>
        <div class="ui-pattern-example"><code>(?:第|EP|Episode)\\s*-?(?&lt;episode&gt;\\d+)</code><span>匹配 第 03 话 / EP03 / Episode 03</span></div>
        <div class="ui-pattern-example"><code>S\\d+E(?&lt;episode&gt;\\d+)</code><span>匹配 S01E03 形式的集数</span></div>
      </div>`;
    field.appendChild(help);
  }

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

  function buildEditorTabs() {
    const edit = document.getElementById('pattern-edit');
    const grid = edit?.querySelector('.editor-grid');
    if (!edit || !grid || edit.querySelector('.ui-editor-tabs')) return;

    const tabs = document.createElement('div');
    tabs.className = 'ui-editor-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', '订阅编辑分区');

    TAB_LABELS.forEach(([section, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ui-editor-tab';
      button.dataset.section = section;
      button.setAttribute('role', 'tab');
      button.textContent = label;
      button.addEventListener('click', () => applyEditorTab(section));
      tabs.appendChild(button);
    });
    grid.insertAdjacentElement('beforebegin', tabs);

    const matching = edit.querySelector('.editor-section[data-section="matching"]');
    const preview = edit.querySelector('.editor-preview-panel');
    if (matching && preview) {
      matching.appendChild(preview);
      const cardHeader = preview.querySelector('.card-header');
      const heading = cardHeader?.querySelector('h2');
      if (heading) heading.innerHTML = '<i class="bi bi-stars" aria-hidden="true"></i> 实时预览';
      if (cardHeader && !cardHeader.querySelector('#ui-preview-refresh-btn')) {
        cardHeader.classList.add('ui-preview-header');
        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.id = 'ui-preview-refresh-btn';
        refresh.className = 'btn btn-sm ui-preview-refresh';
        refresh.innerHTML = '<i class="bi bi-arrow-clockwise" aria-hidden="true"></i><span>刷新 RSS</span>';
        refresh.addEventListener('click', async () => {
          const app = window.mikanarrApp;
          if (!app) return;
          if (!remoteRssValue()) {
            window.MikanarrUi?.Toast?.info?.('请先填写 Remote RSS URL');
            syncPreviewSource(app);
            return;
          }
          await app.loadRssPreview();
        });
        cardHeader.appendChild(refresh);
      }

      const body = preview.querySelector('.card-body');
      if (body && !body.querySelector('.ui-preview-source')) {
        const source = document.createElement('div');
        source.className = 'ui-preview-source';
        source.innerHTML = '<i class="bi bi-rss" aria-hidden="true"></i><span class="ui-preview-source-value"></span>';
        body.prepend(source);
      }
      syncPreviewSource(window.mikanarrApp);
    }

    buildPatternHelp();
  }

  function applyEditorTab(sectionName) {
    const edit = document.getElementById('pattern-edit');
    if (!edit) return;
    const visibleSections = TAB_SECTIONS[sectionName] || new Set([sectionName]);
    edit.querySelectorAll('.editor-section').forEach(section => {
      section.classList.toggle('ui-tab-hidden', !visibleSections.has(section.dataset.section));
    });
    edit.querySelectorAll('.ui-editor-tab').forEach(tab => {
      const active = tab.dataset.section === sectionName;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    edit.querySelector('.editor-grid')?.scrollTo?.({ top: 0, behavior: 'smooth' });

    if (sectionName === 'matching') {
      const app = window.mikanarrApp;
      const remote = remoteRssValue();
      syncPreviewSource(app);
      if (app && remote && !app.uiPreviewLoading && app.uiPreviewRemote !== remote) {
        Promise.resolve(app.loadRssPreview()).catch(error => {
          console.warn('[matching-preview] Failed to refresh RSS preview:', error);
        });
      }
    }
  }

  function enhanceCard(card, pattern) {
    if (!card || card.dataset.uiEnhanced === 'true') return card;
    card.dataset.uiEnhanced = 'true';

    const status = card.querySelector('.pattern-card-status-badge');
    if (status?.textContent === '名称不一致') status.textContent = '待修复';
    if (status?.textContent === '未找到系列') status.textContent = '未匹配';

    const body = card.querySelector('.pattern-card-body');
    const title = card.querySelector('.pattern-card-title');
    if (body && title && status && !body.querySelector('.ui-card-title-row')) {
      const titleRow = document.createElement('div');
      titleRow.className = 'ui-card-title-row';
      title.before(titleRow);
      titleRow.append(title, status);
    }

    const details = document.createElement('div');
    details.className = 'ui-card-details';

    const source = document.createElement('div');
    source.className = 'ui-card-detail';
    source.innerHTML = '<i class="bi bi-broadcast" aria-hidden="true"></i><span></span>';
    source.querySelector('span').textContent = sourceLabel(pattern);

    const updated = document.createElement('div');
    updated.className = 'ui-card-detail';
    updated.innerHTML = '<i class="bi bi-clock" aria-hidden="true"></i><span></span>';
    updated.querySelector('span').textContent = `最近匹配：${formatDate(pattern.last_matched_at)}`;

    details.append(source, updated);
    card.querySelector('.pattern-card-meta')?.insertAdjacentElement('afterend', details);

    setButtonLabel(card.querySelector('.btn-card-copy'), 'bi-link-45deg', '复制链接');
    setButtonLabel(card.querySelector('.btn-card-edit'), 'bi-pencil', '编辑');
    setButtonLabel(card.querySelector('.btn-card-delete'), 'bi-trash', '删除');

    return card;
  }

  function enhanceStaticUi() {
    injectUiTuningStyles();

    const navLabel = document.querySelector('.app-navbar .nav-link.active');
    if (navLabel) navLabel.textContent = '订阅管理';

    const heading = document.querySelector('.pattern-page-heading h1');
    if (heading) heading.textContent = '订阅管理';
    const lead = document.querySelector('.pattern-page-heading .page-lead');
    if (lead) lead.textContent = '集中管理 RSS 匹配规则、Sonarr 映射与追更状态。';

    const search = document.getElementById('search-input');
    if (search) {
      search.placeholder = '搜索剧集 / RSS';
      search.setAttribute('aria-label', '搜索剧集或 RSS');
    }

    const newButton = document.getElementById('new-pattern-btn');
    if (newButton) newButton.innerHTML = '<i class="bi bi-plus-lg" aria-hidden="true"></i><span>新建订阅</span>';

    const headingEyebrow = document.querySelector('#pattern-edit .editor-heading .eyebrow');
    if (headingEyebrow) headingEyebrow.textContent = '订阅配置';
    const headingLead = document.querySelector('#pattern-edit .editor-heading .page-lead');
    if (headingLead) headingLead.textContent = '分区编辑来源、匹配、Sonarr 与高级输出设置。';

    const back = document.getElementById('back-btn');
    if (back) {
      back.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i><span class="visually-hidden">关闭</span>';
      back.title = '关闭编辑面板';
      back.setAttribute('aria-label', '关闭编辑面板');
    }

    buildSummary();
    buildFilterChips();
    buildBatchToolbar();
    buildPaginationShell();
    buildEditorContext();
    buildEditorTabs();

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme && document.documentElement.dataset.theme !== 'dark') metaTheme.content = '#607a93';

    const app = window.mikanarrApp;
    if (app) {
      app.updatePatternSummary();
      app.updateBatchUI();
      syncPreviewSource(app);
    }
  }

  const originalInit = proto.init;
  proto.init = function redesignedInit(...args) {
    window.mikanarrApp = this;
    this.uiCurrentPage = 1;
    return originalInit.apply(this, args);
  };

  const originalApplyTheme = proto.applyTheme;
  proto.applyTheme = function redesignedApplyTheme(theme) {
    const result = originalApplyTheme.call(this, theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1e262c' : '#607a93');
    return result;
  };

  const originalLoadRssPreview = proto.loadRssPreview;
  proto.loadRssPreview = async function redesignedLoadRssPreview(...args) {
    const remote = remoteRssValue();
    this.uiPreviewLoading = true;
    setPreviewRefreshBusy(true);
    syncPreviewSource(this);
    try {
      return await originalLoadRssPreview.apply(this, args);
    } finally {
      this.uiPreviewLoading = false;
      this.uiPreviewRemote = remote;
      setPreviewRefreshBusy(false);
      syncPreviewSource(this);
    }
  };

  const originalShowPatternEdit = proto.showPatternEdit;
  proto.showPatternEdit = function redesignedShowPatternEdit(pattern, ...args) {
    const result = originalShowPatternEdit.call(this, pattern, ...args);
    document.getElementById('pattern-list')?.classList.remove('d-none');
    document.getElementById('pattern-edit')?.classList.remove('d-none');
    document.body.classList.add('ui-drawer-open');
    updateEditorContext(this, pattern);

    const title = document.getElementById('edit-title');
    if (title) title.textContent = pattern ? '编辑订阅' : '新建订阅';
    const edit = document.getElementById('pattern-edit');
    edit?.setAttribute('aria-hidden', 'false');
    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (edit) {
      edit.getAnimations?.().forEach(animation => animation.cancel());
      edit.classList.add('is-open');
      if (!reducedMotion && typeof edit.animate === 'function') {
        const animation = edit.animate(
          [
            { transform: 'translateX(100%)', opacity: 0.96 },
            { transform: 'translateX(0)', opacity: 1 }
          ],
          { duration: 260, easing: 'cubic-bezier(.2, .72, .22, 1)', fill: 'both' }
        );
        this.uiDrawerAnimation = animation;
        animation.finished.then(() => {
          if (this.uiDrawerAnimation === animation) this.uiDrawerAnimation = null;
          animation.cancel();
        }).catch(() => {});
      }
    }
    this.uiPreviewRemote = null;
    applyEditorTab(pattern ? 'matching' : 'settings');
    return result;
  };

  const originalShowPatternList = proto.showPatternList;
  proto.showPatternList = function redesignedShowPatternList(...args) {
    const edit = document.getElementById('pattern-edit');
    const list = document.getElementById('pattern-list');
    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const returnFocus = this.viewReturnFocus;

    document.body.classList.remove('ui-drawer-open');
    if (this.uiDrawerAnimation) {
      this.uiDrawerAnimation.cancel();
      this.uiDrawerAnimation = null;
    }
    edit?.setAttribute('aria-hidden', 'true');
    this.currentPatternId = null;
    this.updatePageTitle('Patterns');
    this.viewReturnFocus = null;

    const finish = () => {
      edit?.classList.add('d-none');
      list?.classList.remove('d-none');
      updateEditorContext(this, null);
      if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus({ preventScroll: true });
      else document.getElementById('search-input')?.focus({ preventScroll: true });
    };

    if (!edit || reducedMotion || typeof edit.animate !== 'function') {
      edit?.classList.remove('is-open');
      finish();
      return;
    }

    const closingAnimation = edit.animate(
      [
        { transform: 'translateX(0)', opacity: 1 },
        { transform: 'translateX(100%)', opacity: 0.96 }
      ],
      { duration: 220, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'both' }
    );
    this.uiDrawerAnimation = closingAnimation;
    closingAnimation.finished.then(() => {
      if (this.uiDrawerAnimation === closingAnimation) this.uiDrawerAnimation = null;
      closingAnimation.cancel();
      edit.classList.remove('is-open');
      finish();
    }).catch(() => {});
  };

  const originalCreatePatternCard = proto.createPatternCard;
  proto.createPatternCard = function redesignedCreatePatternCard(pattern) {
    return enhanceCard(originalCreatePatternCard.call(this, pattern), pattern);
  };

  const originalFilterPatterns = proto.filterPatterns;
  proto.filterPatterns = function redesignedFilterPatterns(query = '') {
    const filterKey = `${query}\u0000${document.getElementById('filter-status')?.value || 'all'}`;
    if (this.uiFilterKey !== filterKey) {
      this.uiFilterKey = filterKey;
      this.uiCurrentPage = 1;
    }
    return originalFilterPatterns.call(this, query);
  };

  const originalRenderCurrentView = proto.renderCurrentView;
  proto.renderCurrentView = function redesignedRenderCurrentView(patterns = this.filteredPatterns || this.allPatterns || []) {
    const source = Array.isArray(patterns) ? patterns : [];
    this.uiVisiblePatterns = source;

    if (this.patternLoadError || (this.patternLoadingGeneration !== null && this.patternLoadingGeneration === this.patternLoadGeneration)) {
      renderPagination(this, 0);
      return originalRenderCurrentView.call(this, source);
    }

    const totalPages = Math.max(1, Math.ceil(source.length / PAGE_SIZE));
    this.uiCurrentPage = Math.min(Math.max(1, this.uiCurrentPage || 1), totalPages);
    const start = (this.uiCurrentPage - 1) * PAGE_SIZE;
    const page = source.slice(start, start + PAGE_SIZE);
    const result = originalRenderCurrentView.call(this, page);
    renderPagination(this, source.length);
    return result;
  };

  const originalUpdatePatternSummary = proto.updatePatternSummary;
  proto.updatePatternSummary = function redesignedUpdatePatternSummary(...args) {
    const result = originalUpdatePatternSummary.apply(this, args);
    const patterns = this.allPatterns || [];
    const normal = patterns.filter(pattern => this.getPatternStatus(pattern) === 'normal').length;
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recent = patterns.filter(pattern => {
      const date = safeDate(pattern.last_matched_at);
      return date && date.getTime() >= sevenDaysAgo;
    }).length;
    const normalNode = document.getElementById('pattern-normal-count');
    const recentNode = document.getElementById('pattern-recent-count');
    if (normalNode) normalNode.textContent = String(normal);
    if (recentNode) recentNode.textContent = String(recent);
    return result;
  };

  const originalUpdateBatchUI = proto.updateBatchUI;
  proto.updateBatchUI = function redesignedUpdateBatchUI(...args) {
    const result = originalUpdateBatchUI.apply(this, args);
    const count = this.getVisibleCheckboxes().filter(checkbox => checkbox.checked).length;
    const display = document.getElementById('ui-selected-count');
    if (display) display.textContent = String(count);
    syncSelectedCardStyles(this);
    return result;
  };

  const originalRenderRssPreview = proto.renderRssPreview;
  proto.renderRssPreview = function redesignedRenderRssPreview(...args) {
    const result = originalRenderRssPreview.apply(this, args);
    const preview = document.getElementById('rss-preview');
    const source = document.getElementById('pattern')?.value || '';
    let regex = null;
    try {
      regex = new RegExp('^' + source + String.fromCharCode(36));
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
    syncPreviewSource(this);
    return result;
  };

  proto.batchUpdateSelection = async function batchUpdateSelection() {
    const ids = selectedIds(this);
    if (!ids.length) return;

    const button = document.getElementById('batch-update-btn');
    if (button) button.disabled = true;
    try {
      const refreshed = await Promise.all(ids.map(async id => {
        const response = await this.apiRequest(`/api/patterns/${id}`);
        if (!response.ok) throw new Error(`Pattern ${id} 更新失败`);
        return response.json();
      }));
      const byId = new Map(refreshed.map(pattern => [pattern.id, pattern]));
      this.allPatterns = (this.allPatterns || []).map(pattern => byId.get(pattern.id) || pattern);
      this.filterPatterns(document.getElementById('search-input')?.value || '');
      window.MikanarrUi?.Toast?.success?.(`已更新 ${refreshed.length} 个订阅`);
    } catch (error) {
      window.MikanarrUi?.Toast?.error?.(`批量更新失败: ${error.message}`);
    } finally {
      if (button) button.disabled = false;
    }
  };

  proto.batchCopyLinks = async function batchCopyLinks() {
    const ids = new Set(selectedIds(this));
    const patterns = (this.allPatterns || []).filter(pattern => ids.has(pattern.id) && pattern.remote);
    if (!patterns.length) {
      window.MikanarrUi?.Toast?.info?.('选中的订阅没有可复制的 RSS 链接');
      return;
    }

    const links = patterns.map(pattern => {
      try {
        const url = new URL(pattern.remote);
        return `${window.location.origin}${url.pathname}${url.search}`;
      } catch (_) {
        return null;
      }
    }).filter(Boolean);

    if (!links.length) {
      window.MikanarrUi?.Toast?.warning?.('没有有效的代理链接');
      return;
    }

    try {
      await navigator.clipboard.writeText(links.join('\n'));
      window.MikanarrUi?.Toast?.success?.(`已复制 ${links.length} 条代理链接`);
    } catch (error) {
      window.MikanarrUi?.Toast?.error?.(`复制失败: ${error.message}`);
    }
  };

  proto.clearBatchSelection = function clearBatchSelection() {
    this.getVisibleCheckboxes().forEach(checkbox => { checkbox.checked = false; });
    const selectAll = document.getElementById('select-all');
    if (selectAll) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    }
    this.updateBatchUI();
  };

  const bootRedesign = () => {
    enhanceStaticUi();

    document.getElementById('batch-update-btn')?.addEventListener('click', () => window.mikanarrApp?.batchUpdateSelection());
    document.getElementById('batch-copy-btn')?.addEventListener('click', () => window.mikanarrApp?.batchCopyLinks());
    document.getElementById('batch-clear-btn')?.addEventListener('click', () => window.mikanarrApp?.clearBatchSelection());
    document.getElementById('remote')?.addEventListener('input', () => syncPreviewSource(window.mikanarrApp));

    document.getElementById('pattern-card-view')?.addEventListener('change', event => {
      if (event.target.classList.contains('card-checkbox')) window.mikanarrApp?.updateBatchUI();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootRedesign, { once: true });
  } else {
    bootRedesign();
  }
})();
