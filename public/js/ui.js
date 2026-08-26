(function exposeUi(root, factory) {
  const ui = factory();
  if (typeof module === 'object' && module.exports) module.exports = ui;
  if (root) root.MikanarrUi = ui;
}(typeof window !== 'undefined' ? window : null, () => {
  const toastIcons = {
    success: 'bi-check-circle-fill',
    error: 'bi-x-circle-fill',
    warning: 'bi-exclamation-triangle-fill',
    info: 'bi-info-circle-fill'
  };

  class Toast {
    static container = null;

    static init() {
      if (!this.container || !this.container.isConnected) {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
      }
    }

    static show(message, type = 'info', duration = 3000) {
      this.init();
      const safeType = Object.hasOwn(toastIcons, type) ? type : 'info';
      const toast = document.createElement('div');
      toast.className = `toast-item toast-${safeType}`;
      toast.setAttribute('role', ['error', 'warning'].includes(safeType) ? 'alert' : 'status');
      toast.setAttribute('aria-atomic', 'true');

      const icon = document.createElement('i');
      icon.className = `bi ${toastIcons[safeType]} toast-icon`;
      icon.setAttribute('aria-hidden', 'true');

      const content = document.createElement('div');
      content.className = 'toast-content';
      content.textContent = String(message);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toast-close';
      button.setAttribute('aria-label', '关闭通知');
      const closeIcon = document.createElement('i');
      closeIcon.className = 'bi bi-x';
      closeIcon.setAttribute('aria-hidden', 'true');
      button.appendChild(closeIcon);
      toast.append(icon, content, button);
      this.container.appendChild(toast);

      const close = () => {
        toast.classList.add('toast-leaving');
        setTimeout(() => toast.remove(), 300);
      };
      button.addEventListener('click', close);
      if (duration > 0) setTimeout(close, duration);
      return toast;
    }

    static success(message, duration) { return this.show(message, 'success', duration); }
    static error(message, duration) { return this.show(message, 'error', duration); }
    static warning(message, duration) { return this.show(message, 'warning', duration); }
    static info(message, duration) { return this.show(message, 'info', duration); }
  }

  class ConfirmDialog {
    static show({ title, message, confirmText = '确认', cancelText = '取消', type = 'danger' }) {
      return new Promise(resolve => {
        const safeType = type === 'warning' ? 'warning' : 'danger';
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
          <div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
            <div class="confirm-dialog-icon ${safeType}"><i class="bi ${safeType === 'warning' ? 'bi-question-circle-fill' : 'bi-exclamation-triangle-fill'}" aria-hidden="true"></i></div>
            <div class="confirm-dialog-title" id="confirm-dialog-title"></div>
            <div class="confirm-dialog-message" id="confirm-dialog-message"></div>
            <div class="confirm-dialog-buttons">
              <button type="button" class="btn btn-secondary" id="confirm-cancel"></button>
              <button type="button" class="btn btn-${safeType}" id="confirm-ok"></button>
            </div>
          </div>`;

        overlay.querySelector('.confirm-dialog-title').textContent = String(title);
        overlay.querySelector('.confirm-dialog-message').textContent = String(message);
        overlay.querySelector('#confirm-cancel').textContent = String(cancelText);
        overlay.querySelector('#confirm-ok').textContent = String(confirmText);
        document.body.appendChild(overlay);

        let settled = false;
        const previousFocus = document.activeElement;
        const cancelButton = overlay.querySelector('#confirm-cancel');
        const confirmButton = overlay.querySelector('#confirm-ok');
        const handleEscape = event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cleanup(false);
          } else if (event.key === 'Tab') {
            if (event.shiftKey && document.activeElement === cancelButton) {
              event.preventDefault();
              confirmButton.focus();
            } else if (!event.shiftKey && document.activeElement === confirmButton) {
              event.preventDefault();
              cancelButton.focus();
            }
          }
        };
        const cleanup = result => {
          if (settled) return;
          settled = true;
          document.removeEventListener('keydown', handleEscape);
          overlay.remove();
          if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
          resolve(result);
        };

        confirmButton.addEventListener('click', () => cleanup(true));
        cancelButton.addEventListener('click', () => cleanup(false));
        overlay.addEventListener('click', event => {
          if (event.target === overlay) cleanup(false);
        });
        document.addEventListener('keydown', handleEscape);
        cancelButton.focus();
      });
    }
  }

  return { Toast, ConfirmDialog };
}));

/*
 * Dashboard interaction refinements.
 * This browser-only layer runs after app.js/redesign.js have patched MikanarrApp.
 * CommonJS consumers only receive the UI utilities above.
 */
if (typeof window !== 'undefined' && !(typeof module === 'object' && module.exports)) {
  (() => {
    'use strict';

    const CLOSED_PAGE_SIZE = 15;
    const OPEN_PAGE_SIZE = 12;
    const STANDARD_FILTERS = new Set(['all', 'normal', 'case-mismatch', 'not-found']);
    const SUMMARY_FILTERS = {
      'pattern-total-count': 'all',
      'pattern-normal-count': 'normal',
      'pattern-issue-count': 'issues',
      'pattern-recent-count': 'recent'
    };

    const safeDate = value => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    const currentPageSize = () => document.body.classList.contains('ui-drawer-open')
      ? OPEN_PAGE_SIZE
      : CLOSED_PAGE_SIZE;

    const ensurePager = () => {
      let pager = document.getElementById('ui-pagination');
      if (pager) return pager;
      const table = document.getElementById('pattern-table-view');
      if (!table) return null;
      pager = document.createElement('nav');
      pager.id = 'ui-pagination';
      pager.className = 'ui-pagination';
      pager.setAttribute('aria-label', '订阅分页');
      table.insertAdjacentElement('afterend', pager);
      return pager;
    };

    const visiblePageNumbers = (current, total) => {
      if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
      const pages = new Set([1, total, current - 1, current, current + 1]);
      const sorted = Array.from(pages)
        .filter(page => page >= 1 && page <= total)
        .sort((a, b) => a - b);
      const result = [];
      sorted.forEach((page, index) => {
        if (index && page - sorted[index - 1] > 1) result.push('…');
        result.push(page);
      });
      return result;
    };

    const renderPager = (app, totalItems, pageSize) => {
      const pager = ensurePager();
      if (!pager) return;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const current = Math.min(Math.max(1, app.uiCurrentPage || 1), totalPages);
      app.uiCurrentPage = current;

      if (totalItems <= pageSize) {
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
            app.renderCurrentView(app.uiVisiblePatterns || app.filteredPatterns || app.allPatterns || []);
            const target = app.currentView === 'table'
              ? document.getElementById('pattern-table-view')
              : document.getElementById('pattern-card-view');
            target?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
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
      meta.textContent = `第 ${current} 页 / 共 ${totalPages} 页 · ${pageSize} 条 / 页`;
      pager.replaceChildren(pages, meta);
    };

    const syncFilterUi = (filter = 'all') => {
      const select = document.getElementById('filter-status');
      if (select && STANDARD_FILTERS.has(filter)) select.value = filter;
      else if (select) select.value = 'all';

      document.querySelectorAll('.ui-filter-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.value === filter);
      });

      document.querySelectorAll('.ui-stat-card[data-dashboard-filter]').forEach(card => {
        const active = card.dataset.dashboardFilter === filter;
        card.classList.toggle('is-filter-active', active);
        card.setAttribute('aria-pressed', String(active));
      });
    };

    const matchDashboardFilter = (app, pattern, filter) => {
      const status = app.getPatternStatus(pattern);
      if (filter === 'all') return true;
      if (filter === 'issues') return ['case-mismatch', 'not-found'].includes(status);
      if (filter === 'recent') {
        const date = safeDate(pattern.last_matched_at);
        return Boolean(date && date.getTime() >= Date.now() - (7 * 24 * 60 * 60 * 1000));
      }
      return status === filter;
    };

    const injectRefinementStyles = () => {
      if (document.getElementById('ui-summary-density-refinements')) return;
      const style = document.createElement('style');
      style.id = 'ui-summary-density-refinements';
      style.textContent = `
        .ui-stat-card[data-dashboard-filter] {
          cursor: pointer;
          user-select: none;
          transition: border-color 140ms ease, box-shadow 140ms ease, background 140ms ease, transform 140ms ease;
        }
        .ui-stat-card[data-dashboard-filter]:hover {
          border-color: var(--ui-border-strong);
          box-shadow: 0 8px 20px rgba(36, 49, 59, 0.08);
          transform: translateY(-1px);
        }
        .ui-stat-card[data-dashboard-filter]:focus-visible {
          outline: 3px solid color-mix(in srgb, var(--ui-accent) 24%, transparent);
          outline-offset: 2px;
        }
        .ui-stat-card[data-dashboard-filter].is-filter-active {
          border-color: color-mix(in srgb, var(--ui-accent) 58%, var(--ui-border));
          background: color-mix(in srgb, var(--ui-accent-soft) 58%, var(--ui-surface));
          box-shadow: 0 5px 16px rgba(53, 75, 92, 0.08);
        }
        .pattern-card-checkbox {
          top: auto !important;
          bottom: 9px !important;
          left: 12px !important;
        }
      `;
      document.head.appendChild(style);
    };

    const enhanceSummaryCards = () => {
      Object.entries(SUMMARY_FILTERS).forEach(([valueId, filter]) => {
        const card = document.getElementById(valueId)?.closest('.ui-stat-card');
        if (!card || card.dataset.dashboardFilter) return;
        card.dataset.dashboardFilter = filter;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-pressed', 'false');
        const activate = () => {
          const app = window.mikanarrApp;
          if (!app) return;
          app.uiDashboardFilter = filter;
          if (STANDARD_FILTERS.has(filter)) {
            const select = document.getElementById('filter-status');
            if (select) select.value = filter;
          }
          app.filterPatterns(document.getElementById('search-input')?.value || '');
        };
        card.addEventListener('click', activate);
        card.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          activate();
        });
      });
      syncFilterUi(window.mikanarrApp?.uiDashboardFilter || document.getElementById('filter-status')?.value || 'all');
    };

    const install = () => {
      const App = window.MikanarrApp;
      if (!App) return;
      const proto = App.prototype;
      if (proto.__dashboardDensityRefinementsInstalled) return;
      proto.__dashboardDensityRefinementsInstalled = true;

      proto.filterPatterns = function refinedDashboardFilterPatterns(query = '') {
        if (!this.allPatterns) return;
        const select = document.getElementById('filter-status');
        const filter = this.uiDashboardFilter || select?.value || 'all';
        const lowerQuery = String(query || '').toLowerCase();
        const filterKey = `${lowerQuery}\u0000${filter}`;
        if (this.uiFilterKey !== filterKey) {
          this.uiFilterKey = filterKey;
          this.uiCurrentPage = 1;
        }

        const filtered = this.allPatterns.filter(pattern => {
          const textMatch = !lowerQuery ||
            String(pattern.series || '').toLowerCase().includes(lowerQuery) ||
            String(pattern.pattern || '').toLowerCase().includes(lowerQuery) ||
            String(pattern.releasegroup || '').toLowerCase().includes(lowerQuery);
          return textMatch && matchDashboardFilter(this, pattern, filter);
        });

        this.filteredPatterns = filtered;
        this.updatePatternSummary();
        this.renderCurrentView(filtered);
        syncFilterUi(filter);
      };

      proto.renderCurrentView = function refinedAdaptiveRender(patterns = this.filteredPatterns || this.allPatterns || []) {
        const source = Array.isArray(patterns) ? patterns : [];
        this.uiVisiblePatterns = source;

        if (this.patternLoadingGeneration !== null &&
            this.patternLoadingGeneration === this.patternLoadGeneration) return;
        if (this.patternLoadError) {
          this.renderPatternLoadError();
          renderPager(this, 0, currentPageSize());
          return;
        }

        const pageSize = currentPageSize();
        const previousPageSize = this.uiPageSize || pageSize;
        if (previousPageSize !== pageSize) {
          const firstVisibleIndex = Math.max(0, ((this.uiCurrentPage || 1) - 1) * previousPageSize);
          this.uiCurrentPage = Math.floor(firstVisibleIndex / pageSize) + 1;
        }
        this.uiPageSize = pageSize;

        const totalPages = Math.max(1, Math.ceil(source.length / pageSize));
        this.uiCurrentPage = Math.min(Math.max(1, this.uiCurrentPage || 1), totalPages);
        const start = (this.uiCurrentPage - 1) * pageSize;
        const page = source.slice(start, start + pageSize);

        if (this.currentView === 'card') this.renderPatternCards(page);
        else this.renderPatterns(page);
        renderPager(this, source.length, pageSize);
        this.updateBatchUI?.();
      };

      const previousShowPatternEdit = proto.showPatternEdit;
      proto.showPatternEdit = function refinedShowPatternEdit(...args) {
        const result = previousShowPatternEdit.apply(this, args);
        this.renderCurrentView(this.uiVisiblePatterns || this.filteredPatterns || this.allPatterns || []);
        return result;
      };

      const previousShowPatternList = proto.showPatternList;
      proto.showPatternList = function refinedShowPatternList(...args) {
        const result = previousShowPatternList.apply(this, args);
        this.renderCurrentView(this.uiVisiblePatterns || this.filteredPatterns || this.allPatterns || []);
        return result;
      };

      const select = document.getElementById('filter-status');
      select?.addEventListener('change', () => {
        const app = window.mikanarrApp;
        if (!app) return;
        app.uiDashboardFilter = select.value;
        syncFilterUi(select.value);
      }, { capture: true });

      setTimeout(() => {
        injectRefinementStyles();
        enhanceSummaryCards();
      }, 0);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
      install();
    }
  })();
}
