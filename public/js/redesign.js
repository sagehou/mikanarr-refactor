(() => {
  'use strict';

  if (!window.MikanarrApp) return;

  const proto = window.MikanarrApp.prototype;
  const PAGE_SIZE = 12;
  const TAB_LABELS = [
    ['source', '基础'],
    ['matching', '匹配规则'],
    ['mapping', 'Sonarr'],
    ['output', '高级']
  ];

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
    helpText.textContent = '用于从 RSS 标题中提取集数；规则必须包含命名捕获组 (?<episode>...)。';
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
      const heading = preview.querySelector('.card-header h2');
      if (heading) heading.innerHTML = '<i class="bi bi-stars" aria-hidden="true"></i> 实时预览';
    }

    buildPatternHelp();
  }

  function applyEditorTab(sectionName) {
    const edit = document.getElementById('pattern-edit');
    if (!edit) return;
    edit.querySelectorAll('.editor-section').forEach(section => {
      section.classList.toggle('ui-tab-hidden', section.dataset.section !== sectionName);
    });
    edit.querySelectorAll('.ui-editor-tab').forEach(tab => {
      const active = tab.dataset.section === sectionName;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
  }

  function enhanceCard(card, pattern) {
    if (!card || card.dataset.uiEnhanced === 'true') return card;
    card.dataset.uiEnhanced = 'true';

    const status = card.querySelector('.pattern-card-status-badge');
    if (status?.textContent === '名称不一致') status.textContent = '待修复';
    if (status?.textContent === '未找到系列') status.textContent = '未匹配';

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
    buildEditorTabs();

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme && document.documentElement.dataset.theme !== 'dark') metaTheme.content = '#657c93';

    const app = window.mikanarrApp;
    if (app) {
      app.updatePatternSummary();
      app.updateBatchUI();
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
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1e262c' : '#657c93');
    return result;
  };

  const originalShowPatternEdit = proto.showPatternEdit;
  proto.showPatternEdit = function redesignedShowPatternEdit(pattern, ...args) {
    const result = originalShowPatternEdit.call(this, pattern, ...args);
    document.getElementById('pattern-list')?.classList.remove('d-none');
    document.getElementById('pattern-edit')?.classList.remove('d-none');
    document.body.classList.add('ui-drawer-open');

    const title = document.getElementById('edit-title');
    if (title) title.textContent = pattern ? '编辑订阅' : '新建订阅';
    applyEditorTab(pattern ? 'matching' : 'source');
    return result;
  };

  const originalShowPatternList = proto.showPatternList;
  proto.showPatternList = function redesignedShowPatternList(...args) {
    const result = originalShowPatternList.apply(this, args);
    document.body.classList.remove('ui-drawer-open');
    return result;
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
