// ===== Toast Notification System =====
class Toast {
  static container = null;

  static init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  }

  static show(message, type = 'info', duration = 3000) {
    this.init();

    const icons = {
      success: 'bi-check-circle-fill',
      error: 'bi-x-circle-fill',
      warning: 'bi-exclamation-triangle-fill',
      info: 'bi-info-circle-fill'
    };

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.innerHTML = `
      <i class="bi ${icons[type]} toast-icon"></i>
      <div class="toast-content">${message}</div>
      <button class="toast-close"><i class="bi bi-x"></i></button>
    `;

    this.container.appendChild(toast);

    const close = () => {
      toast.classList.add('toast-leaving');
      setTimeout(() => toast.remove(), 300);
    };

    toast.querySelector('.toast-close').addEventListener('click', close);

    if (duration > 0) {
      setTimeout(close, duration);
    }

    return toast;
  }

  static success(message, duration) { return this.show(message, 'success', duration); }
  static error(message, duration) { return this.show(message, 'error', duration); }
  static warning(message, duration) { return this.show(message, 'warning', duration); }
  static info(message, duration) { return this.show(message, 'info', duration); }
}

// ===== Confirm Dialog =====
class ConfirmDialog {
  static show({ title, message, confirmText = '确认', cancelText = '取消', type = 'danger' }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';

      const icons = {
        danger: 'bi-exclamation-triangle-fill',
        warning: 'bi-question-circle-fill'
      };

      overlay.innerHTML = `
        <div class="confirm-dialog">
          <div class="confirm-dialog-icon ${type}">
            <i class="bi ${icons[type]}"></i>
          </div>
          <div class="confirm-dialog-title">${title}</div>
          <div class="confirm-dialog-message">${message}</div>
          <div class="confirm-dialog-buttons">
            <button class="btn btn-secondary" id="confirm-cancel">${cancelText}</button>
            <button class="btn btn-${type === 'danger' ? 'danger' : 'warning'}" id="confirm-ok">${confirmText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const cleanup = (result) => {
        overlay.remove();
        resolve(result);
      };

      overlay.querySelector('#confirm-ok').addEventListener('click', () => cleanup(true));
      overlay.querySelector('#confirm-cancel').addEventListener('click', () => cleanup(false));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup(false);
      });

      // Handle Escape key
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', handleEscape);
          cleanup(false);
        }
      };
      document.addEventListener('keydown', handleEscape);
    });
  }
}

class MikanarrApp {
  constructor() {
    this.token = localStorage.getItem('token');
    window.app = this; // Expose app instance for onclick handlers
    this.currentPatternId = null;
    this.seriesList = [];
    this.rssItems = [];
    this.debounceTimer = null;
    
    this.init();
  }

  init() {
    this.initTheme();
    this.checkOidcConfig();
    this.checkAuth();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
  }

  async checkOidcConfig() {
    // If already logged in, skip config check
    if (this.token) return;

    try {
      const response = await fetch('/auth/config');
      if (response.ok) {
        const config = await response.json();
        console.log('[OIDC] Config:', config);
        if (config.oidcEnabled) {
          if (config.oidcAutoLogin) {
            console.log('[OIDC] Auto-login enabled, redirecting...');
            window.location.href = '/auth/oidc/login';
            return;
          }
          const container = document.getElementById('oidc-login-container');
          if (container) {
            container.classList.remove('d-none');
            console.log('[OIDC] SSO button enabled');
          } else {
            console.error('[OIDC] Button container not found');
          }
        }
      }
    } catch (e) {
      console.warn('Failed to check OIDC config:', e);
    }
  }

  initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateThemeIcon(savedTheme);
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    this.updateThemeIcon(newTheme);
  }

  updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.innerHTML = theme === 'dark' 
        ? '<i class="bi bi-sun"></i>' 
        : '<i class="bi bi-moon-stars"></i>';
    }
  }

  async checkAuth() {
    if (this.token) {
      document.getElementById('login-container').classList.add('d-none');
      document.getElementById('main-container').classList.remove('d-none');
      
      // Initialize view preference
      this.initView();
      
      // Load config first
      await this.loadConfig();
      
      // Then load data in parallel
      await Promise.all([
        this.loadPatterns(),
        this.loadSeries()
      ]);
    } else {
      document.getElementById('login-container').classList.remove('d-none');
      document.getElementById('main-container').classList.add('d-none');
    }
  }

  async loadConfig() {
    try {
      const response = await this.apiRequest('/api/config');
      if (response.ok) {
        const config = await response.json();
        this.sonarrHost = config.sonarrHost || '';
      }
    } catch (error) {
      console.warn('[loadConfig] Failed to load config:', error.message);
    }
  }

setupEventListeners() {
    document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
    document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());
    document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
    document.getElementById('new-pattern-btn').addEventListener('click', () => this.showPatternEdit());
    document.getElementById('back-btn').addEventListener('click', () => this.showPatternList());
    document.getElementById('cancel-btn').addEventListener('click', () => this.showPatternList());
    document.getElementById('pattern-form').addEventListener('submit', (e) => this.savePattern(e));
    document.getElementById('search-input').addEventListener('input', (e) => this.filterPatterns(e.target.value));
    document.getElementById('remote').addEventListener('input', () => this.debounceLoadRssPreview());
    document.getElementById('refresh-rss-btn').addEventListener('click', () => this.loadRssPreview());
    document.getElementById('escape-btn').addEventListener('click', () => this.escapePattern());
    document.getElementById('episode-btn').addEventListener('click', () => this.copyEpisode());
    document.getElementById('series').addEventListener('change', () => {
      this.loadSeasons();
      this.updateSeriesInfoCard();
    });
    document.getElementById('pattern').addEventListener('input', () => this.updateRssPreview());
    document.getElementById('copy-proxy-btn').addEventListener('click', () => this.copyProxyUrl());
    document.getElementById('export-btn').addEventListener('click', () => this.exportPatterns());
    document.getElementById('import-input').addEventListener('change', (e) => this.importPatterns(e));
    
    // Mikan导入
    document.getElementById('import-mikan-btn').addEventListener('click', () => this.importFromMikan());
    
    // 表单中添加剧集按钮
    document.getElementById('form-add-series-btn').addEventListener('click', () => {
      // 尝试自动填充搜索词：如果有自动匹配结果但未存在，或者是当前RSS标题
      let initialQuery = '';
      const rssFirstTitle = this.rssItems.length > 0 ? this.rssItems[0] : '';
      if (rssFirstTitle) {
        // Simple extraction or use findBestMatchSeries logic logic to extract title
        // But findBestMatchSeries returns a sonarr series object, which we don't have here.
        // So we just try to clean up the title.
        initialQuery = rssFirstTitle
          .replace(/^\[.*?\]\s*/, '')
          .replace(/\s*-\s*\d+.*$/, '')
          .replace(/\s*S\d+E\d+.*$/, '')
          .replace(/\s*第\d+话.*/, '')
          .trim();
      }
      this.showAddSeriesModal(initialQuery);
    });

    // 批量操作
    document.getElementById('select-all').addEventListener('change', (e) => this.handleSelectAll(e.target.checked));
    document.getElementById('batch-delete-btn').addEventListener('click', () => this.batchDelete());
    document.getElementById('batch-fix-btn').addEventListener('click', () => this.batchFix());
    document.getElementById('filter-status').addEventListener('change', (e) => this.filterPatterns(document.getElementById('search-input').value));
    
    document.getElementById('pattern-table-body').addEventListener('change', (e) => {
      if (e.target.classList.contains('row-checkbox')) {
        this.updateBatchUI();
      }
    });
    
    // Pattern测试按钮
    document.getElementById('test-pattern-btn').addEventListener('click', () => this.testPattern());
    
    // Add Series Modal Events
    document.getElementById('sonarr-search-btn').addEventListener('click', () => this.searchSonarrSeries());
    document.getElementById('sonarr-search-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.searchSonarrSeries();
    });
    document.getElementById('add-series-back-btn').addEventListener('click', () => {
      document.getElementById('add-series-step-2').classList.add('d-none');
      document.getElementById('add-series-step-1').classList.remove('d-none');
      document.getElementById('add-series-submit-btn').disabled = true;
      document.getElementById('add-series-back-btn').disabled = true;
    });
    document.getElementById('add-series-submit-btn').addEventListener('click', () => this.submitAddSeries());

    // 添加表头排序事件监听
    document.querySelectorAll('.sortable').forEach(th => {
      th.addEventListener('click', () => this.handleSortClick(th));
    });

    // 视图切换事件
    document.getElementById('view-card-btn').addEventListener('click', () => this.switchView('card'));
    document.getElementById('view-table-btn').addEventListener('click', () => this.switchView('table'));
  }

  // ===== View Toggle =====
  currentView = localStorage.getItem('patternView') || 'card';

  switchView(view) {
    this.currentView = view;
    localStorage.setItem('patternView', view);
    
    const cardBtn = document.getElementById('view-card-btn');
    const tableBtn = document.getElementById('view-table-btn');
    const cardView = document.getElementById('pattern-card-view');
    const tableView = document.getElementById('pattern-table-view');
    
    if (view === 'card') {
      cardBtn.classList.add('active');
      tableBtn.classList.remove('active');
      cardView.classList.remove('d-none');
      tableView.classList.add('d-none');
    } else {
      tableBtn.classList.add('active');
      cardBtn.classList.remove('active');
      tableView.classList.remove('d-none');
      cardView.classList.add('d-none');
    }
    
    // Re-render current view
    this.filterPatterns(document.getElementById('search-input').value);
  }

  initView() {
    // Initialize view based on saved preference
    if (this.currentView === 'table') {
      this.switchView('table');
    } else {
      this.switchView('card');
    }
  }

  // ===== Keyboard Shortcuts =====
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Skip if user is typing in an input
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
      
      // Escape - go back to list or close modals
      if (e.key === 'Escape') {
        const editPanel = document.getElementById('pattern-edit');
        if (!editPanel.classList.contains('d-none')) {
          this.showPatternList();
          Toast.info('已返回列表');
        }
      }
      
      // Ctrl/Cmd + S - Save pattern
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        const editPanel = document.getElementById('pattern-edit');
        if (!editPanel.classList.contains('d-none')) {
          e.preventDefault();
          document.getElementById('pattern-form').dispatchEvent(new Event('submit'));
        }
      }
      
      // Ctrl/Cmd + N - New pattern (when not typing)
      if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !isTyping) {
        const listPanel = document.getElementById('pattern-list');
        if (!listPanel.classList.contains('d-none')) {
          e.preventDefault();
          this.showPatternEdit();
          Toast.info('新建 Pattern');
        }
      }
      
      // / - Focus search (when not typing)
      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        document.getElementById('search-input').focus();
      }
    });
  }

  // ===== Dynamic Page Title =====
  updatePageTitle(suffix = '') {
    const base = 'Mikanarr';
    document.title = suffix ? `${suffix} - ${base}` : base;
  }

  // Add Series Logic
  showAddSeriesModal(initialQuery = '') {
    const modal = new window.bootstrap.Modal(document.getElementById('add-series-modal'));
    document.getElementById('sonarr-search-input').value = initialQuery;
    document.getElementById('sonarr-search-results').innerHTML = '';
    document.getElementById('add-series-step-1').classList.remove('d-none');
    document.getElementById('add-series-step-2').classList.add('d-none');
    document.getElementById('add-series-submit-btn').disabled = true;
    document.getElementById('add-series-back-btn').disabled = true;
    
    modal.show();
    this.loadSonarrOptions(); // Ensure options are loaded
    
    if (initialQuery) {
      this.searchSonarrSeries();
    }
  }

  async searchSonarrSeries() {
    const query = document.getElementById('sonarr-search-input').value.trim();
    if (!query) return;

    const resultsDiv = document.getElementById('sonarr-search-results');
    resultsDiv.innerHTML = '<div class="text-center p-3"><div class="loading-spinner"></div> 搜索中...</div>';

    try {
      const response = await this.apiRequest(`/sonarr/api/v3/series/lookup?term=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('搜索失败');
      
      const allResults = await response.json();
      // Store results for selection
      this.searchResults = allResults;
      this.currentSearchPage = 1;
      this.renderSearchResults();
      
    } catch (error) {
      console.error('[searchSonarrSeries] Error:', error);
      resultsDiv.innerHTML = `<div class="text-center p-3 text-danger">搜索出错: ${error.message}</div>`;
    }
  }

  renderSearchResults() {
    const resultsDiv = document.getElementById('sonarr-search-results');
    const pageSize = 10;
    const start = 0;
    const end = this.currentSearchPage * pageSize;
    const results = this.searchResults.slice(start, end);
    const hasMore = this.searchResults.length > end;

    if (!results || results.length === 0) {
      resultsDiv.innerHTML = '<div class="text-center p-3 text-muted">未找到相关剧集</div>';
      return;
    }

    let html = results.map((series, index) => {
      // Check if already exists
      const exists = this.seriesList.some(s => s.tvdbId === series.tvdbId);
      const existsBadge = exists ? '<span class="badge bg-success ms-2">已存在</span>' : '';
      
      // Placeholder ID for lazy loading
      const imgId = `img-tvdb-${series.tvdbId}`;
      const tmdbIdSpan = `tmdb-id-${series.tvdbId}`;
      
      return `
        <button type="button" class="list-group-item list-group-item-action d-flex align-items-center" 
          onclick="app.selectSeriesToAdd(${index})" ${exists ? 'disabled' : ''}>
          <img id="${imgId}" src="https://via.placeholder.com/60x90?text=Loading" class="rounded me-3" width="40" height="60" style="object-fit: cover;">
          <div>
            <div class="fw-bold">${this.escapeHtml(series.title)} (${series.year}) ${existsBadge}</div>
            <small class="text-muted">
              TVDB: ${series.tvdbId} 
              <span id="${tmdbIdSpan}">${series.tmdbId ? `| TMDB: ${series.tmdbId}` : ''}</span>
              | ${series.network || 'Unknown'}
            </small>
          </div>
        </button>
      `;
    }).join('');

    if (hasMore) {
      html += `
        <div class="text-center p-2">
          <button class="btn btn-sm btn-outline-primary w-100" onclick="app.loadMoreSearchResults()">
            加载更多
          </button>
        </div>
      `;
    }

    resultsDiv.innerHTML = html;

    // Lazy load TMDB images and info for newly rendered items
    // We only need to load for the items that haven't been loaded yet, or just re-run for all visible (simpler)
    // To optimize, we could track loaded IDs, but re-running is okay as long as we check if img src is already set (not placeholder)
    
    results.forEach(async series => {
      if (!series.tvdbId) return;
      const img = document.getElementById(`img-tvdb-${series.tvdbId}`);
      if (!img || !img.src.includes('placeholder')) return; // Skip if already loaded

      try {
        // Use our own TMDB proxy
        const response = await this.apiRequest(`/tmdb/find/${series.tvdbId}?source=tvdb_id`);
        if (response.ok) {
          const data = await response.json();
          const tmdbResult = data.tv_results?.[0];
          
          // Update TMDB ID if found
          if (tmdbResult?.id) {
            const tmdbSpan = document.getElementById(`tmdb-id-${series.tvdbId}`);
            if (tmdbSpan) {
              tmdbSpan.textContent = `| TMDB: ${tmdbResult.id}`;
              series.tmdbId = tmdbResult.id;
            }
          }

          if (tmdbResult?.poster_path) {
            if (img) {
              // Direct TMDB URL
              img.src = `https://image.tmdb.org/t/p/w92${tmdbResult.poster_path}`;
            }
          } else {
             this.loadSonarrImage(series);
          }
        } else {
           this.loadSonarrImage(series);
        }
      } catch (e) {
        this.loadSonarrImage(series);
      }
    });
  }

  loadMoreSearchResults() {
    this.currentSearchPage++;
    this.renderSearchResults();
  }

  loadSonarrImage(series) {
    const img = document.getElementById(`img-tvdb-${series.tvdbId}`);
    if (!img) return;

    let posterUrl = series.images.find(i => i.coverType === 'poster')?.remoteUrl || 
                    series.images.find(i => i.coverType === 'poster')?.url;
                    
    if (posterUrl) {
      if (posterUrl.startsWith('/')) {
         const host = (this.sonarrHost || '').replace(/\/$/, '');
         posterUrl = `${host}${posterUrl}`;
      } else if (posterUrl.startsWith('http')) {
         // Upgrade HTTP to HTTPS
         posterUrl = posterUrl.replace(/^http:/, 'https:');
      }
      img.src = posterUrl;
    } else {
      img.src = 'https://via.placeholder.com/60x90?text=No+Img';
    }
  }

  selectSeriesToAdd(index) {
    const series = this.searchResults[index];
    this.selectedSeries = series;
    document.getElementById('selected-series-title').textContent = `${series.title} (${series.year})`;
    document.getElementById('selected-tvdb-id').value = series.tvdbId;
    
    document.getElementById('add-series-step-1').classList.add('d-none');
    document.getElementById('add-series-step-2').classList.remove('d-none');
    document.getElementById('add-series-submit-btn').disabled = false;
    document.getElementById('add-series-back-btn').disabled = false;
  }

  async handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');

    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        const data = await response.json();
        this.token = data.token;
        localStorage.setItem('token', this.token);
        this.checkAuth();
      } else {
        errorDiv.textContent = '用户名或密码错误';
        errorDiv.classList.remove('d-none');
      }
    } catch (error) {
      errorDiv.textContent = '登录失败: ' + error.message;
      errorDiv.classList.remove('d-none');
    }
  }

  handleLogout() {
    localStorage.removeItem('token');
    this.token = null;
    this.checkAuth();
  }

  async loadPatterns() {
    // Show skeleton loading
    this.showSkeletonLoading();
    
    try {
      const currentSort = this.currentSort || { field: 'created_at', direction: 'desc' };
      const response = await this.apiRequest(`/api/patterns?sortBy=${currentSort.field}&order=${currentSort.direction}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const patterns = await response.json();
      
      if (!Array.isArray(patterns)) {
        console.error('[loadPatterns] Expected array but got:', patterns);
        this.allPatterns = [];
      } else {
        this.allPatterns = patterns;
      }
      
      this.filterPatterns(document.getElementById('search-input').value); // 使用筛选渲染
      this.updateSortIndicators();
    } catch (error) {
      console.error('Failed to load patterns:', error);
      this.allPatterns = [];
      this.renderPatterns([]);
      Toast.error('加载 Patterns 失败');
    }
  }

  showSkeletonLoading() {
    // Table skeleton
    const tbody = document.getElementById('pattern-table-body');
    let skeletonHtml = '';
    for (let i = 0; i < 5; i++) {
      skeletonHtml += `
        <tr>
          <td><div class="skeleton skeleton-cell-sm" style="height: 18px; width: 18px;"></div></td>
          <td><div class="skeleton skeleton-cell-sm"></div></td>
          <td><div class="skeleton skeleton-cell-xl"></div></td>
          <td><div class="skeleton skeleton-cell-sm"></div></td>
          <td><div class="skeleton skeleton-cell-md"></div></td>
          <td><div class="skeleton skeleton-cell-md"></div></td>
          <td><div class="skeleton skeleton-cell-md"></div></td>
          <td><div class="skeleton skeleton-cell-md"></div></td>
          <td><div class="skeleton skeleton-cell-lg"></div></td>
        </tr>
      `;
    }
    tbody.innerHTML = skeletonHtml;

    // Card skeleton
    this.showCardSkeletonLoading();
  }

  // 当前排序状态
  currentSort = { field: 'id', direction: 'desc' };
  allPatterns = []; // 初始化为空数组

  // TMDB中文名缓存 { tmdbId: titleZh }
  tmdbCache = {};
  
  // Sonarr 配置缓存
  sonarrOptions = {
    rootFolders: [],
    qualityProfiles: [],
    languageProfiles: []
  };

  async getOrCreateMikanarrTag() {
    const TAG_LABEL = 'mikanarr';
    try {
      // 1. Get all tags
      const response = await this.apiRequest('/sonarr/api/v3/tag');
      if (!response.ok) return null;
      
      const tags = await response.json();
      const existingTag = tags.find(t => t.label.toLowerCase() === TAG_LABEL);
      
      if (existingTag) {
        return existingTag.id;
      }
      
      // 2. Create tag if not exists
      console.log('[getOrCreateMikanarrTag] Creating new tag:', TAG_LABEL);
      const createResponse = await this.apiRequest('/sonarr/api/v3/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: TAG_LABEL })
      });
      
      if (createResponse.ok) {
        const newTag = await createResponse.json();
        return newTag.id;
      }
    } catch (e) {
      console.warn('[getOrCreateMikanarrTag] Failed:', e);
    }
    return null;
  }

  async submitAddSeries() {
    if (!this.selectedSeries) return;

    const rootPath = document.getElementById('sonarr-root-folder').value;
    const qualityProfileId = parseInt(document.getElementById('sonarr-quality-profile').value);
    // Removed languageProfileId
    const seriesType = document.getElementById('sonarr-series-type').value;
    const monitor = document.getElementById('sonarr-monitor').value;
    const seasonFolder = document.getElementById('sonarr-season-folder').checked;

      if (!rootPath || !qualityProfileId) {
        Toast.warning('请填写所有必填项');
        return;
      }

    const submitBtn = document.getElementById('add-series-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '添加中...';

    // Get tag ID
    const tagId = await this.getOrCreateMikanarrTag();
    const tags = tagId ? [tagId] : [];

    const payload = {
      title: this.selectedSeries.title,
      qualityProfileId: qualityProfileId,
      path: `${rootPath}/${this.selectedSeries.title}`, // Simplified path construction
      tvdbId: this.selectedSeries.tvdbId,
      seasonFolder: seasonFolder,
      monitored: monitor !== 'none',
      seriesType: seriesType,
      images: this.selectedSeries.images,
      tags: tags,
      addOptions: {
        monitor: monitor,
        searchForMissingEpisodes: false
      }
    };

    try {
      const response = await this.apiRequest('/sonarr/api/v3/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || JSON.stringify(errorData));
      }

      // Success
      const modal = window.bootstrap.Modal.getInstance(document.getElementById('add-series-modal'));
      modal.hide();
      
      // Reload series list
      await this.loadSeries();
      
      // Automatically select the newly added series
      const seriesSelect = document.getElementById('series');
      if (seriesSelect) {
        seriesSelect.value = this.selectedSeries.title;
        // Trigger change event to load seasons
        seriesSelect.dispatchEvent(new Event('change'));
      }
      
      // Show success message
      Toast.success(`成功添加剧集: ${this.escapeHtml(this.selectedSeries.title)}`);

    } catch (error) {
      console.error('[submitAddSeries] Error:', error);
      Toast.error('添加失败: ' + error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '添加';
    }
  }

  async loadSonarrOptions() {
    if (this.sonarrOptions.rootFolders.length > 0) return; // 已加载

    try {
      const [rootFolders, qualityProfiles] = await Promise.all([
        this.apiRequest('/sonarr/api/v3/rootfolder').then(r => r.json()),
        this.apiRequest('/sonarr/api/v3/qualityprofile').then(r => r.json())
      ]);

      this.sonarrOptions = { rootFolders, qualityProfiles };
      this.renderSonarrOptions();
    } catch (error) {
      console.error('[loadSonarrOptions] Failed:', error);
      Toast.error('无法加载 Sonarr 配置，请检查连接');
    }
  }

  renderSonarrOptions() {
    const rootSelect = document.getElementById('sonarr-root-folder');
    const qualitySelect = document.getElementById('sonarr-quality-profile');

    rootSelect.innerHTML = '<option value="">选择路径...</option>' + 
      this.sonarrOptions.rootFolders.map(f => `<option value="${f.path}">${f.path} (${this.formatBytes(f.freeSpace)} Free)</option>`).join('');

    qualitySelect.innerHTML = this.sonarrOptions.qualityProfiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  }

  formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  async loadSeries() {
    try {
      console.log('[loadSeries] Fetching series from Sonarr...');
      const response = await this.apiRequest('/sonarr/api/v3/series');
      console.log('[loadSeries] Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const series = await response.json();
      console.log('[loadSeries] Response type:', typeof series);
      console.log('[loadSeries] Is array:', Array.isArray(series));
      
      if (!Array.isArray(series)) {
        // Check if response is HTML (auth page)
        if (typeof series === 'string' && series.includes('<!DOCTYPE html>')) {
          throw new Error('Sonarr returned an HTML login page. Please check SONARR_HOST - it should be the direct Sonarr URL, not an auth proxy.');
        }
        throw new Error(`Invalid response type: expected array, got ${typeof series}`);
      }
      
      console.log('[loadSeries] Loaded', series.length, 'series');
      
      this.seriesList = series;

      // Sync TMDB Chinese names for new series
      await this.syncTmdbCache(series);
      
      this.renderSeriesOptions(series);

      // Re-render patterns table to show Chinese names
      this.loadPatterns();
    } catch (error) {
      console.error('[loadSeries] Failed to load series:', error);
      const errorMsg = error.message || 'Unknown error';
      
      // Show error message to user
      const seriesSelect = document.getElementById('series');
      if (seriesSelect) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-warning mt-2';
        errorDiv.innerHTML = `
          <i class="bi bi-exclamation-triangle"></i> 
          加载 Sonarr 系列失败: ${errorMsg}
          <br>
          <small>请检查 SONARR_API_KEY 和 SONARR_HOST 配置</small>
        `;
        
        // Remove existing error if any
        const existingError = seriesSelect.parentElement.querySelector('.alert');
        if (existingError) {
          existingError.remove();
        }
        
        seriesSelect.parentElement.appendChild(errorDiv);
      }
    }
  }

  async syncTmdbCache(series) {
    try {
      // Prepare series data for sync
      const seriesData = series
        .filter(s => s.tmdbId)
        .map(s => ({ tmdbId: s.tmdbId, titleEn: s.title }));

      if (seriesData.length === 0) {
        console.log('[syncTmdbCache] No series with tmdbId to sync');
        return;
      }

      console.log('[syncTmdbCache] Syncing', seriesData.length, 'series...');
      
      const response = await this.apiRequest('/tmdb/cache/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series: seriesData })
      });

      if (response.ok) {
        const data = await response.json();
        this.tmdbCache = data.cache || {};
        console.log('[syncTmdbCache] Synced', data.synced, 'new series, cache size:', Object.keys(this.tmdbCache).length);
      } else {
        console.warn('[syncTmdbCache] Sync failed, trying to load existing cache...');
        // Fallback: try to load existing cache
        const cacheResponse = await this.apiRequest('/tmdb/cache');
        if (cacheResponse.ok) {
          this.tmdbCache = await cacheResponse.json();
        }
      }
    } catch (error) {
      console.error('[syncTmdbCache] Error:', error.message);
    }
  }

  renderSeriesOptions(series) {
    const select = document.getElementById('series');
    select.innerHTML = '<option value="">选择系列...</option>';
    
    if (!series || series.length === 0) {
      console.warn('[renderSeriesOptions] No series to render');
      return;
    }
    
    console.log('[renderSeriesOptions] Rendering', series.length, 'series');
    
    series.forEach(s => {
      const option = document.createElement('option');
      option.value = s.title;
      
      // Display format: "English Name (中文名)" if Chinese name exists
      const zhName = s.tmdbId ? this.tmdbCache[s.tmdbId] : null;
      option.textContent = zhName ? `${s.title} (${zhName})` : s.title;
      
      select.appendChild(option);
    });
    
    console.log('[renderSeriesOptions] Series options added to select element');
  }

  // ===== Sonarr Deep Integration - Series Info Card =====
  async updateSeriesInfoCard() {
    const seriesTitle = document.getElementById('series').value;
    const cardDiv = document.getElementById('series-info-card');
    
    if (!seriesTitle) {
      cardDiv.classList.add('d-none');
      return;
    }

    const series = this.seriesList.find(s => s.title.toLowerCase() === seriesTitle.toLowerCase());
    if (!series) {
      cardDiv.classList.add('d-none');
      return;
    }

    // Show card
    cardDiv.classList.remove('d-none');

    // Update poster
    const posterImg = document.getElementById('series-poster');
    let posterUrl = null;

    // Try TMDB first
    if (series.tmdbId) {
      try {
        const response = await this.apiRequest(`/tmdb/tv/${series.tmdbId}`);
        if (response.ok) {
          const tmdbData = await response.json();
          if (tmdbData.poster_path) {
            posterUrl = `https://image.tmdb.org/t/p/w185${tmdbData.poster_path}`;
          }
        }
      } catch (e) {
        console.warn('[updateSeriesInfoCard] TMDB fetch failed:', e);
      }
    }

    // Fallback to Sonarr poster
    if (!posterUrl) {
      const poster = series.images?.find(i => i.coverType === 'poster');
      if (poster) {
        posterUrl = poster.remoteUrl || poster.url;
        if (posterUrl?.startsWith('/')) {
          posterUrl = `${this.sonarrHost}${posterUrl}`;
        }
      }
    }

    posterImg.src = posterUrl || 'https://via.placeholder.com/80x120?text=No+Poster';

    // Update title (Chinese name if available)
    const zhName = series.tmdbId ? this.tmdbCache[series.tmdbId] : null;
    document.getElementById('series-title-zh').textContent = zhName || series.title;

    // Calculate episode stats
    let totalEpisodes = 0;
    let downloadedEpisodes = 0;
    let missingEpisodes = 0;

    if (series.statistics) {
      totalEpisodes = series.statistics.totalEpisodeCount || 0;
      downloadedEpisodes = series.statistics.episodeFileCount || 0;
      missingEpisodes = (series.statistics.episodeCount || 0) - downloadedEpisodes;
    } else if (series.seasons) {
      series.seasons.forEach(season => {
        if (season.statistics) {
          totalEpisodes += season.statistics.totalEpisodeCount || 0;
          downloadedEpisodes += season.statistics.episodeFileCount || 0;
        }
      });
      missingEpisodes = totalEpisodes - downloadedEpisodes;
    }

    document.getElementById('series-downloaded').textContent = downloadedEpisodes;
    document.getElementById('series-missing').textContent = Math.max(0, missingEpisodes);
    document.getElementById('series-total').textContent = totalEpisodes;

    // Update progress bar
    const progress = totalEpisodes > 0 ? (downloadedEpisodes / totalEpisodes) * 100 : 0;
    document.getElementById('series-progress').style.width = `${progress}%`;

    // Update Sonarr link
    if (series.titleSlug && this.sonarrHost) {
      document.getElementById('series-sonarr-link').href = `${this.sonarrHost}/series/${series.titleSlug}`;
      document.getElementById('series-sonarr-link').classList.remove('d-none');
    } else {
      document.getElementById('series-sonarr-link').classList.add('d-none');
    }
  }

  async loadSeasons(targetSeason = null) {
    const seriesTitle = document.getElementById('series').value;
    const seasonSelect = document.getElementById('season');
    // 优先使用传入的目标季度，否则使用当前选中的季度
    const currentSeason = targetSeason || seasonSelect.value;
    
    seasonSelect.innerHTML = '<option value="">选择季度...</option>';

    if (!seriesTitle) {
      if (currentSeason) {
        seasonSelect.value = currentSeason; // 恢复选中的季度
      }
      return;
    }

    const series = this.seriesList.find(s => s.title.toLowerCase() === seriesTitle.toLowerCase());
    if (!series) {
      console.warn('[loadSeasons] Series not found in list:', seriesTitle);
      if (currentSeason) {
        seasonSelect.value = currentSeason; // 恢复选中的季度
      }
      return;
    }
    
    if (!series.seasons) {
      console.warn('[loadSeasons] Series has no seasons:', seriesTitle);
      if (currentSeason) {
        seasonSelect.value = currentSeason; // 恢复选中的季度
      }
      return;
    }

    console.log('[loadSeasons] Loading seasons for:', seriesTitle, series.seasons.length, 'seasons');
    
    series.seasons.forEach(season => {
      const option = document.createElement('option');
      option.value = String(season.seasonNumber).padStart(2, '0');
      option.textContent = `S${String(season.seasonNumber).padStart(2, '0')} ${season.monitored ? '' : '(未监控)'}`;
      seasonSelect.appendChild(option);
    });

    // 恢复选中的季度
    if (currentSeason) {
      seasonSelect.value = currentSeason;
    }
  }


  renderPatterns(patterns) {
    const tbody = document.getElementById('pattern-table-body');
    tbody.innerHTML = '';
    
    // Empty state
    if (!patterns || patterns.length === 0) {
      const isFiltered = document.getElementById('search-input').value || 
                         document.getElementById('filter-status').value !== 'all';
      
      tbody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="empty-state">
              <div class="empty-state-icon">
                <i class="bi ${isFiltered ? 'bi-search' : 'bi-collection'}"></i>
              </div>
              <div class="empty-state-title">
                ${isFiltered ? '没有找到匹配的 Pattern' : '还没有 Pattern'}
              </div>
              <div class="empty-state-description">
                ${isFiltered 
                  ? '尝试调整搜索条件或筛选器' 
                  : '点击"新建"按钮创建第一个 Pattern，开始追踪你喜爱的动漫'}
              </div>
              ${!isFiltered ? `
                <button class="btn btn-primary" onclick="app.showPatternEdit()">
                  <i class="bi bi-plus-lg"></i> 新建 Pattern
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
      return;
    }
    
    patterns.forEach(pattern => {
      // Find the series to get tmdbId for Chinese name lookup (case-insensitive)
      const series = this.seriesList?.find(s => s.title.toLowerCase() === pattern.series.toLowerCase());
      const zhName = series?.tmdbId ? this.tmdbCache[series.tmdbId] : null;
      
      // Check match status
      let matchStatus = '';
      let matchIcon = '';
      let fixBtn = '';
      let addBtn = ''; // Button to add series to Sonarr
      
      if (!series) {
        // Series not found in Sonarr at all
        matchStatus = 'not-found';
        matchIcon = '<i class="bi bi-exclamation-circle text-danger" title="Sonarr中未找到此系列"></i> ';
        
        // Add "Add Series" button
        addBtn = `<button class="btn btn-sm btn-outline-success btn-add-series" data-query="${this.escapeHtml(pattern.series)}" title="搜索并添加到 Sonarr">
            <i class="bi bi-plus-circle"></i>
          </button>`;
      } else if (series.title !== pattern.series) {
        // Found but case doesn't match exactly - might need update
        matchStatus = 'case-mismatch';
        matchIcon = `<i class="bi bi-exclamation-triangle text-warning" title="名称不完全匹配，Sonarr中为: ${this.escapeHtml(series.title)}"></i> `;
        fixBtn = `<button class="btn btn-sm btn-outline-warning btn-fix" data-id="${pattern.id}" data-correct-name="${this.escapeHtml(series.title)}" title="修复为: ${this.escapeHtml(series.title)}">
            <i class="bi bi-wrench"></i>
          </button>`;
      }
      
      const displayName = zhName ? `${pattern.series} (${zhName})` : pattern.series;
      
      // Sonarr link button
      const sonarrBtn = series?.titleSlug && this.sonarrHost 
        ? `<a href="${this.sonarrHost}/series/${series.titleSlug}" target="_blank" class="btn btn-sm btn-outline-info" title="在Sonarr中打开">
            <i class="bi bi-box-arrow-up-right"></i>
          </a>`
        : '';
      
      // Copy proxy URL button (only if remote URL exists)
      const copyUrlBtn = pattern.remote
        ? `<button class="btn btn-sm btn-outline-secondary btn-copy-url" data-remote="${this.escapeHtml(pattern.remote)}" title="复制代理URL">
            <i class="bi bi-clipboard"></i>
          </button>`
        : '';

      // Format last matched time
      let lastMatched = '-';
      if (pattern.last_matched_at) {
        const date = new Date(pattern.last_matched_at);
        lastMatched = `<div title="${date.toLocaleString()}">
          ${date.toLocaleDateString()}<br>
          <small class="text-muted">共 ${pattern.match_count || 0} 次</small>
        </div>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" class="form-check-input row-checkbox" data-id="${pattern.id}"></td>
        <td>${pattern.id}</td>
        <td>${matchIcon}<strong>${this.escapeHtml(displayName)}</strong></td>
        <td><span class="badge bg-secondary">S${pattern.season}</span></td>
        <td><span class="badge ${this.getLanguageBadgeClass(pattern.language)}">${this.escapeHtml(pattern.language)}</span></td>
        <td><span class="badge bg-primary">${this.escapeHtml(pattern.quality)}</span></td>
        <td>${lastMatched}</td>
        <td class="hide-mobile">${this.escapeHtml(pattern.releasegroup || '-')}</td>
        <td class="text-nowrap">
          <div class="action-buttons d-flex gap-1">
            ${copyUrlBtn}
            ${sonarrBtn}
            ${addBtn}
            ${fixBtn}
            <button class="btn btn-sm btn-outline-primary btn-edit" data-id="${pattern.id}" title="编辑">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${pattern.id}" title="删除">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => this.editPattern(parseInt(e.currentTarget.dataset.id)));
    });

    tbody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => this.deletePattern(parseInt(e.currentTarget.dataset.id)));
    });

    tbody.querySelectorAll('.btn-fix').forEach(btn => {
      btn.addEventListener('click', (e) => this.fixPatternName(
        parseInt(e.currentTarget.dataset.id),
        e.currentTarget.dataset.correctName
      ));
    });

    tbody.querySelectorAll('.btn-add-series').forEach(btn => {
      btn.addEventListener('click', (e) => this.showAddSeriesModal(e.currentTarget.dataset.query));
    });

    tbody.querySelectorAll('.btn-copy-url').forEach(btn => {
      btn.addEventListener('click', (e) => this.copyProxyUrlFromRemote(e.currentTarget.dataset.remote));
    });
  }

  // ===== Card View Rendering =====
  renderPatternCards(patterns) {
    const container = document.getElementById('pattern-card-view');
    container.innerHTML = '';

    // Empty state
    if (!patterns || patterns.length === 0) {
      const isFiltered = document.getElementById('search-input').value || 
                         document.getElementById('filter-status').value !== 'all';
      
      container.innerHTML = `
        <div class="pattern-card-empty">
          <div class="empty-state-icon">
            <i class="bi ${isFiltered ? 'bi-search' : 'bi-collection'}"></i>
          </div>
          <div class="empty-state-title">
            ${isFiltered ? '没有找到匹配的 Pattern' : '还没有 Pattern'}
          </div>
          <div class="empty-state-description">
            ${isFiltered 
              ? '尝试调整搜索条件或筛选器' 
              : '点击"新建"按钮创建第一个 Pattern，开始追踪你喜爱的动漫'}
          </div>
          ${!isFiltered ? `
            <button class="btn btn-primary" onclick="app.showPatternEdit()">
              <i class="bi bi-plus-lg"></i> 新建 Pattern
            </button>
          ` : ''}
        </div>
      `;
      return;
    }

    patterns.forEach(pattern => {
      const card = this.createPatternCard(pattern);
      container.appendChild(card);
    });
  }

  createPatternCard(pattern) {
    // Find the series to get tmdbId and stats
    const series = this.seriesList?.find(s => s.title.toLowerCase() === pattern.series.toLowerCase());
    const zhName = series?.tmdbId ? this.tmdbCache[series.tmdbId] : null;
    
    // Determine status
    let statusClass = '';
    let statusText = '';
    if (!series) {
      statusClass = 'status-error';
      statusText = '未找到';
    } else if (series.title !== pattern.series) {
      statusClass = 'status-warning';
      statusText = '名称不一致';
    }

    // Calculate episode stats
    let downloadedEpisodes = 0;
    let totalEpisodes = 0;
    let missingEpisodes = 0;
    let progressPercent = 0;

    if (series?.statistics) {
      totalEpisodes = series.statistics.episodeCount || 0;
      downloadedEpisodes = series.statistics.episodeFileCount || 0;
      missingEpisodes = totalEpisodes - downloadedEpisodes;
      progressPercent = totalEpisodes > 0 ? Math.round((downloadedEpisodes / totalEpisodes) * 100) : 0;
    }

    // Determine if we have poster available
    const hasPoster = series?.tmdbId || series?.images?.some(i => i.coverType === 'fanart' || i.coverType === 'poster');

    const card = document.createElement('div');
    card.className = 'pattern-card';
    card.dataset.patternId = pattern.id;
    card.dataset.tmdbId = series?.tmdbId || '';

    // Build poster HTML - use placeholder div if no image available
    let posterContent = '';
    if (hasPoster) {
      posterContent = `<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="${this.escapeHtml(pattern.series)}" loading="lazy">`;
    } else {
      posterContent = `
        <div class="pattern-card-poster-placeholder">
          <i class="bi bi-film"></i>
          <span>${this.escapeHtml(pattern.series.substring(0, 12))}${pattern.series.length > 12 ? '...' : ''}</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="pattern-card-poster">
        ${posterContent}
        <span class="pattern-card-season-badge">S${pattern.season}</span>
        ${statusText ? `<span class="pattern-card-status-badge ${statusClass}">${statusText}</span>` : ''}
      </div>
      <div class="pattern-card-body">
        <div class="pattern-card-title">${this.escapeHtml(pattern.series)}</div>
        ${zhName ? `<div class="pattern-card-title-zh">${this.escapeHtml(zhName)}</div>` : ''}
        <div class="pattern-card-meta">
          <span class="badge ${this.getLanguageBadgeClass(pattern.language)}">${this.escapeHtml(pattern.language)}</span>
          <span class="badge bg-primary">${this.escapeHtml(pattern.quality)}</span>
        </div>
        ${series ? `
          <div class="pattern-card-progress">
            <div class="pattern-card-progress-header">
              <div class="pattern-card-progress-stats">
                <span class="pattern-card-progress-stat downloaded" title="已下载">
                  <i class="bi bi-check-circle-fill"></i> ${downloadedEpisodes}
                </span>
                <span class="pattern-card-progress-stat missing" title="缺失">
                  <i class="bi bi-exclamation-circle"></i> ${Math.max(0, missingEpisodes)}
                </span>
              </div>
              <span style="font-size: 0.65rem; color: var(--text-muted);">${progressPercent}%</span>
            </div>
            <div class="pattern-card-progress-bar">
              <div class="pattern-card-progress-bar-fill" style="width: ${progressPercent}%"></div>
            </div>
          </div>
        ` : ''}
      </div>
      <div class="pattern-card-footer">
        <div class="pattern-card-checkbox">
          <input type="checkbox" class="form-check-input card-checkbox" data-id="${pattern.id}">
        </div>
        <div class="pattern-card-actions">
          ${series?.titleSlug && this.sonarrHost ? `
            <a href="${this.sonarrHost}/series/${series.titleSlug}" target="_blank" class="btn btn-sm btn-outline-info" title="在Sonarr中打开">
              <i class="bi bi-box-arrow-up-right"></i>
            </a>
          ` : ''}
          <button class="btn btn-sm btn-outline-primary btn-card-edit" data-id="${pattern.id}" title="编辑">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger btn-card-delete" data-id="${pattern.id}" title="删除">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    `;

    // Add event listeners
    card.querySelector('.btn-card-edit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editPattern(parseInt(e.currentTarget.dataset.id));
    });

    card.querySelector('.btn-card-delete')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deletePattern(parseInt(e.currentTarget.dataset.id));
    });

    card.querySelector('.card-checkbox')?.addEventListener('change', () => {
      this.updateBatchUI();
    });

    // Lazy load poster image only if we expect one
    if (hasPoster) {
      this.loadCardPoster(card, series);
    }

    return card;
  }

  async loadCardPoster(card, series) {
    const img = card.querySelector('.pattern-card-poster img');
    if (!img) return;

    try {
      // Try TMDB first (优先使用竖版 poster)
      if (series.tmdbId) {
        const response = await this.apiRequest(`/tmdb/tv/${series.tmdbId}`);
        if (response.ok) {
          const tmdbData = await response.json();
          // 优先使用 poster_path (竖版)，其次才是 backdrop_path
          // 使用 w154 尺寸，足够卡片展示且加载极快
          if (tmdbData.poster_path) {
            img.src = `https://image.tmdb.org/t/p/w154${tmdbData.poster_path}`;
            return;
          } else if (tmdbData.backdrop_path) {
            // 如果只有横版图，使用 w300 裁剪
            img.src = `https://image.tmdb.org/t/p/w300${tmdbData.backdrop_path}`;
            return;
          }
        }
      }

      // Fallback to Sonarr (优先 Poster)
      const poster = series.images?.find(i => i.coverType === 'poster');
      const fanart = series.images?.find(i => i.coverType === 'fanart');
      
      // 优先取 Poster (coverType === 'poster')
      let imageUrl = poster?.remoteUrl || poster?.url;
      
      // 如果没有 Poster 才取 Fanart
      if (!imageUrl) {
        imageUrl = fanart?.remoteUrl || fanart?.url;
      }
      
      if (imageUrl) {
        let finalUrl = imageUrl;
        if (finalUrl.startsWith('/')) {
          finalUrl = `${this.sonarrHost}${finalUrl}`;
        }
        // 如果是 Sonarr 内部代理图片，尝试添加 width 参数 (取决于 Sonarr 版本支持)
        if (finalUrl.includes('/MediaCover')) {
           finalUrl += '?width=200'; 
        }
        img.src = finalUrl;
      }
    } catch (e) {
      console.warn('[loadCardPoster] Failed:', e);
    }
  }

  showCardSkeletonLoading() {
    const container = document.getElementById('pattern-card-view');
    let skeletonHtml = '';
    for (let i = 0; i < 6; i++) {
      skeletonHtml += `
        <div class="pattern-card-skeleton">
          <div class="skeleton skeleton-poster"></div>
          <div class="skeleton-body">
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-subtitle"></div>
            <div class="skeleton-badges">
              <div class="skeleton skeleton-badge"></div>
              <div class="skeleton skeleton-badge"></div>
            </div>
            <div class="skeleton skeleton-progress"></div>
          </div>
        </div>
      `;
    }
    container.innerHTML = skeletonHtml;
  }

  async copyProxyUrlFromRemote(remoteUrl) {
    try {
      const url = new URL(remoteUrl);
      const proxyUrl = `${window.location.origin}${url.pathname}${url.search}`;
      await navigator.clipboard.writeText(proxyUrl);
      
      // Show brief feedback
      Toast.success('已复制代理URL');
    } catch (error) {
      Toast.error('复制失败: ' + error.message);
    }
  }

  async fixPatternName(id, correctName) {
    const confirmed = await ConfirmDialog.show({
      title: '修复系列名',
      message: `确定要将系列名修复为 "${correctName}" 吗？`,
      confirmText: '修复',
      cancelText: '取消',
      type: 'warning'
    });
    if (!confirmed) return;
    
    try {
      // First get the current pattern
      const getResponse = await this.apiRequest(`/api/patterns/${id}`);
      if (!getResponse.ok) throw new Error('获取Pattern失败');
      const pattern = await getResponse.json();
      
      // Update with correct name
      pattern.series = correctName;
      
      const response = await this.apiRequest(`/api/patterns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pattern)
      });
      
      if (!response.ok) throw new Error('更新失败');
      
      this.loadPatterns();
      Toast.success('系列名已修复');
    } catch (error) {
      Toast.error('修复失败: ' + error.message);
    }
  }

  // 批量操作相关
  handleSelectAll(checked) {
    document.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.checked = checked;
    });
    this.updateBatchUI();
  }

  updateBatchUI() {
    const selected = document.querySelectorAll('.row-checkbox:checked');
    const batchDeleteBtn = document.getElementById('batch-delete-btn');
    const batchFixBtn = document.getElementById('batch-fix-btn');
    const selectAll = document.getElementById('select-all');
    const allCheckboxes = document.querySelectorAll('.row-checkbox');
    
    document.getElementById('selected-count').textContent = selected.length;
    
    if (selected.length > 0) {
      batchDeleteBtn.classList.remove('d-none');
      
      // Check if any selected items need fixing
      const ids = Array.from(selected).map(cb => parseInt(cb.dataset.id));
      const hasFixable = this.allPatterns.some(p => {
        if (!ids.includes(p.id)) return false;
        const series = this.seriesList?.find(s => s.title.toLowerCase() === p.series.toLowerCase());
        return series && series.title !== p.series;
      });
      
      if (hasFixable) {
        batchFixBtn.classList.remove('d-none');
      } else {
        batchFixBtn.classList.add('d-none');
      }
    } else {
      batchDeleteBtn.classList.add('d-none');
      batchFixBtn.classList.add('d-none');
    }
    
    // Update select-all checkbox state
    selectAll.checked = allCheckboxes.length > 0 && selected.length === allCheckboxes.length;
    selectAll.indeterminate = selected.length > 0 && selected.length < allCheckboxes.length;
  }

  async batchDelete() {
    const selected = document.querySelectorAll('.row-checkbox:checked');
    const ids = Array.from(selected).map(cb => parseInt(cb.dataset.id));
    
    if (ids.length === 0) return;
    
    const confirmed = await ConfirmDialog.show({
      title: '批量删除',
      message: `确定要删除选中的 ${ids.length} 个 Pattern 吗？此操作不可撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger'
    });
    if (!confirmed) return;
    
    try {
      for (const id of ids) {
        await this.apiRequest(`/api/patterns/${id}`, { method: 'DELETE' });
      }
      this.loadPatterns();
      Toast.success(`已删除 ${ids.length} 个 Pattern`);
    } catch (error) {
      Toast.error('批量删除失败: ' + error.message);
    }
  }

  async batchFix() {
    const selected = document.querySelectorAll('.row-checkbox:checked');
    const ids = Array.from(selected).map(cb => parseInt(cb.dataset.id));
    
    if (ids.length === 0) return;
    
    const patternsToFix = this.allPatterns.filter(p => ids.includes(p.id));
    const fixable = patternsToFix.filter(p => {
      const series = this.seriesList?.find(s => s.title.toLowerCase() === p.series.toLowerCase());
      return series && series.title !== p.series;
    });

    if (fixable.length === 0) {
      Toast.info('选中的项目中没有需要修复名称的 Pattern');
      return;
    }

    const confirmed = await ConfirmDialog.show({
      title: '批量修复',
      message: `确定要修复选中的 ${fixable.length} 个 Pattern 的系列名吗？`,
      confirmText: '修复',
      cancelText: '取消',
      type: 'warning'
    });
    if (!confirmed) return;

    try {
      let successCount = 0;
      for (const p of fixable) {
        const series = this.seriesList.find(s => s.title.toLowerCase() === p.series.toLowerCase());
        p.series = series.title; // Update local
        
        const response = await this.apiRequest(`/api/patterns/${p.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p)
        });
        
        if (response.ok) successCount++;
      }
      
      this.loadPatterns();
      Toast.success(`成功修复 ${successCount} 个 Pattern`);
    } catch (error) {
      Toast.error('批量修复失败: ' + error.message);
    }
  }

  testPattern() {
    const patternStr = document.getElementById('pattern').value;
    const resultBox = document.getElementById('pattern-test-result');
    const outputDiv = document.getElementById('pattern-test-output');
    
    if (!patternStr) {
      resultBox.classList.add('d-none');
      return;
    }
    
    if (!this.rssItems.length) {
      outputDiv.innerHTML = '<span class="text-warning">请先输入RSS URL并加载RSS内容</span>';
      resultBox.classList.remove('d-none');
      return;
    }
    
    try {
      const regex = new RegExp(`^${patternStr}$`);
      const matches = [];
      const nonMatches = [];
      
      this.rssItems.forEach(title => {
        const match = title.match(regex);
        if (match?.groups?.episode) {
          matches.push({
            title,
            episode: match.groups.episode
          });
        } else {
          nonMatches.push(title);
        }
      });
      
      let html = '';
      if (matches.length > 0) {
        html += `<div class="text-success mb-2">✓ 匹配 ${matches.length} 条:</div>`;
        html += '<ul class="mb-2">';
        matches.slice(0, 5).forEach(m => {
          html += `<li>${this.escapeHtml(m.title)} → <strong>E${m.episode}</strong></li>`;
        });
        if (matches.length > 5) {
          html += `<li>... 还有 ${matches.length - 5} 条</li>`;
        }
        html += '</ul>';
      }
      
      if (nonMatches.length > 0) {
        html += `<div class="text-danger">✗ 未匹配 ${nonMatches.length} 条</div>`;
      }
      
      if (matches.length === 0) {
        html = '<span class="text-danger">未匹配任何条目，请检查正则表达式</span>';
      }
      
      outputDiv.innerHTML = html;
      resultBox.classList.remove('d-none');
    } catch (error) {
      outputDiv.innerHTML = `<span class="text-danger">正则表达式错误: ${this.escapeHtml(error.message)}</span>`;
      resultBox.classList.remove('d-none');
    }
  }

  importFromMikan() {
    const input = document.getElementById('mikan-import').value.trim();
    if (!input) {
      alert('请输入Mikan URL');
      return;
    }

    let bangumiId = null;
    let subgroupid = null;

    // Try to parse RSS URL
    // Format: https://mikanani.me/RSS/Bangumi?bangumiId=3455&subgroupid=370
    if (input.includes('bangumiId=')) {
      const url = new URL(input);
      bangumiId = url.searchParams.get('bangumiId');
      subgroupid = url.searchParams.get('subgroupid');
    } 
    // Try to parse Home URL
    // Format: https://mikanani.me/Home/Bangumi/3455
    else {
      const match = input.match(/\/Home\/Bangumi\/(\d+)/);
      if (match) {
        bangumiId = match[1];
      }
    }

    if (bangumiId) {
      let remoteUrl = `https://mikanani.me/RSS/Bangumi?bangumiId=${bangumiId}`;
      if (subgroupid) {
        remoteUrl += `&subgroupid=${subgroupid}`;
      }
      
      document.getElementById('remote').value = remoteUrl;
      
      // Reset series selection to trigger auto-match
      document.getElementById('series').value = '';
      this.loadSeasons(); // Clear seasons
      
      this.loadRssPreview();
      
      // Clear input
      document.getElementById('mikan-import').value = '';
      Toast.success('已解析 Mikan URL');
    } else {
      Toast.warning('无法解析URL，请确保是有效的Mikan RSS或番剧页面URL');
    }
  }

  // Levenshtein Distance Algorithm for fuzzy matching
  levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    // increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            Math.min(
              matrix[i][j - 1] + 1, // insertion
              matrix[i - 1][j] + 1 // deletion
            )
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  // Find best match series for a given title
  findBestMatchSeries(title) {
    if (!this.seriesList || !title) return null;
    
    // Normalize title: remove brackets, episode numbers, etc.
    const cleanTitle = title
      .replace(/^\[.*?\]\s*/, '') // Remove [Group]
      .replace(/\s*-\s*\d+.*$/, '') // Remove - 01 ...
      .replace(/\s*S\d+E\d+.*$/, '') // Remove S01E01 ...
      .replace(/\s*第\d+话.*/, '') // Remove 第01话...
      .trim();

    let bestMatch = null;
    let minDistance = Infinity;
    
    this.seriesList.forEach(series => {
      const candidates = [series.title];
      if (series.tmdbId && this.tmdbCache[series.tmdbId]) {
        candidates.push(this.tmdbCache[series.tmdbId]);
      }

      candidates.forEach(candidateName => {
        // 1. Check exact contains (very common)
        if (cleanTitle.toLowerCase().includes(candidateName.toLowerCase()) || 
            candidateName.toLowerCase().includes(cleanTitle.toLowerCase())) {
          
          // Prefer the one with closer length
          const distance = Math.abs(cleanTitle.length - candidateName.length);
          if (distance < minDistance) {
            minDistance = distance;
            bestMatch = series;
          }
        }
        
        // 2. Fuzzy match
        const dist = this.levenshteinDistance(cleanTitle.toLowerCase(), candidateName.toLowerCase());
        const threshold = Math.max(cleanTitle.length, candidateName.length) * 0.4;
        
        if (dist < threshold && dist < minDistance) {
          minDistance = dist;
          bestMatch = series;
        }
      });
    });

    return bestMatch;
  }

  getLanguageBadgeClass(language) {
    const langMap = {
      'Chinese': 'bg-danger',
      'Japanese': 'bg-warning',
      'English': 'bg-success'
    };
    return langMap[language] || 'bg-secondary';
  }

  async editPattern(id) {
    console.log('[editPattern] Called with id:', id);
    try {
      const response = await this.apiRequest(`/api/patterns/${id}`);
      console.log('[editPattern] Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.log('[editPattern] Error data:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const pattern = await response.json();
      console.log('[editPattern] Loaded pattern:', pattern);
      this.currentPatternId = id;
      this.showPatternEdit(pattern);
    } catch (error) {
      console.error('[editPattern] Failed to load pattern:', error);
      console.error('[editPattern] Error stack:', error.stack);
      alert('加载 Pattern 失败: ' + error.message);
    }
  }

  async deletePattern(id) {
    const confirmed = await ConfirmDialog.show({
      title: '删除 Pattern',
      message: '确定要删除这个 Pattern 吗？此操作不可撤销。',
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger'
    });
    if (!confirmed) return;

    try {
      await this.apiRequest(`/api/patterns/${id}`, { method: 'DELETE' });
      this.loadPatterns();
      Toast.success('Pattern 已删除');
    } catch (error) {
      console.error('Failed to delete pattern:', error);
      Toast.error('删除失败: ' + error.message);
    }
  }

  showPatternEdit(pattern = null) {
    document.getElementById('pattern-list').classList.add('d-none');
    document.getElementById('pattern-edit').classList.remove('d-none');
    
    // Update page title
    this.updatePageTitle(pattern ? '编辑 Pattern' : '新建 Pattern');
    
    const form = document.getElementById('pattern-form');
    form.reset();
    
    // Clear previous RSS preview and test results
    this.rssItems = [];
    document.getElementById('rss-preview').innerHTML = '<p class="text-muted text-center">输入 RSS URL 加载预览</p>';
    document.getElementById('pattern-test-result').classList.add('d-none');
    document.getElementById('pattern-test-output').innerHTML = '';
    document.getElementById('series-info-card').classList.add('d-none');

    if (pattern) {
      console.log('[showPatternEdit] Editing pattern:', pattern.series);
      document.getElementById('edit-title').textContent = '编辑 Pattern';
      document.getElementById('pattern-id').value = pattern.id;
      document.getElementById('remote').value = pattern.remote || '';
      document.getElementById('pattern').value = pattern.pattern;
      document.getElementById('series').value = pattern.series;
      document.getElementById('language').value = pattern.language;
      document.getElementById('quality').value = pattern.quality;
      document.getElementById('offset').value = pattern.offset || 0;
      document.getElementById('releasegroup').value = pattern.releasegroup || '';
      
      // Load seasons after setting series value, pass the saved season to restore
      this.loadSeasons(pattern.season);
      this.updateProxyUrl();
    } else {
      console.log('[showPatternEdit] Creating new pattern');
      document.getElementById('edit-title').textContent = '新建 Pattern';
      document.getElementById('pattern-id').value = '';
      document.getElementById('language').value = 'Chinese';
      document.getElementById('quality').value = 'WEBDL 1080p';
      document.getElementById('offset').value = '0';
      
      document.getElementById('proxy-url-box').classList.add('d-none');
    }
  }

  showPatternList() {
    document.getElementById('pattern-edit').classList.add('d-none');
    document.getElementById('pattern-list').classList.remove('d-none');
    this.currentPatternId = null;
    this.updatePageTitle('Patterns');
  }

  async savePattern(e) {
    e.preventDefault();
    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner me-2"></span> 保存中...';

    const pattern = {
      remote: document.getElementById('remote').value,
      pattern: document.getElementById('pattern').value,
      series: document.getElementById('series').value,
      season: document.getElementById('season').value,
      language: document.getElementById('language').value,
      quality: document.getElementById('quality').value,
      offset: parseInt(document.getElementById('offset').value) || 0,
      releasegroup: document.getElementById('releasegroup').value
    };

    try {
      const url = this.currentPatternId 
        ? `/api/patterns/${this.currentPatternId}`
        : '/api/patterns';
      const method = this.currentPatternId ? 'PUT' : 'POST';
      
      await this.apiRequest(url, { method, body: JSON.stringify(pattern) });
      this.showPatternList();
      this.loadPatterns();
      Toast.success('Pattern 已保存');
    } catch (error) {
      Toast.error('保存失败: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-check-lg"></i> 保存';
    }
  }

  async loadRssPreview() {
    const remote = document.getElementById('remote').value;
    if (!remote) {
      this.rssItems = [];
      this.renderRssPreview();
      return;
    }

    const previewDiv = document.getElementById('rss-preview');
    previewDiv.innerHTML = '<div class="text-center py-4"><div class="loading-spinner"></div></div>';

    try {
      const encoded = encodeURIComponent(remote);
      const response = await this.apiRequest(`/proxy?url=${encoded}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const text = await response.text();

      const parser = new DOMParser();
      const xml = parser.parseFromString(text, 'text/xml');

      // Check for XML parsing errors
      const parseError = xml.querySelector('parsererror');
      if (parseError) {
        throw new Error('Failed to parse XML response');
      }

      const items = Array.from(xml.querySelectorAll('item title')).map(el => el.textContent);

      if (!items.length) {
        throw new Error('No items found in RSS feed');
      }

      this.rssItems = items.slice(0, 50);
      this.renderRssPreview();
      
      // Auto-detect and fill subgroup
      this.autoFillSubgroup();
      
      // Auto-match series if not selected
      const currentSeries = document.getElementById('series').value;
      if (!currentSeries && this.rssItems.length > 0) {
        // Use the first item to find match
        const match = this.findBestMatchSeries(this.rssItems[0]);
        if (match) {
          console.log('[AutoMatch] Found series:', match.title);
          const seriesSelect = document.getElementById('series');
          seriesSelect.value = match.title;
          this.loadSeasons();
          
          // Show toast
          Toast.success(`自动匹配到系列: ${match.title}`);
        }
      }

      this.updateProxyUrl();
    } catch (error) {
      console.error('Failed to load RSS preview:', error);
      this.rssItems = [];

      const errorMsg = error.message || '加载失败';

      // Show detailed error
      previewDiv.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-circle"></i> ${errorMsg}
          <br>
          <small class="text-muted">
            请检查：
            <ul class="mb-0 mt-1 small">
              <li>URL 格式是否正确</li>
              <li>Token 是否有效</li>
              <li>Mikan 网站是否可访问</li>
              <li>是否需要登录</li>
            </ul>
          </small>
        </div>
      `;
    }
  }

  debounceLoadRssPreview() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.loadRssPreview(), 1000);
    this.updateProxyUrl();
  }

  renderRssPreview() {
    const previewDiv = document.getElementById('rss-preview');
    const pattern = document.getElementById('pattern').value;

    if (!this.rssItems.length) {
      previewDiv.innerHTML = '<p class="text-muted text-center">输入 RSS URL 加载预览</p>';
      return;
    }

    let matchedItems;
    try {
      const regex = new RegExp(`^${pattern}$`);
      matchedItems = this.rssItems.map(title => ({
        title,
        matched: regex.test(title)
      }));
    } catch {
      matchedItems = this.rssItems.map(title => ({ title, matched: false }));
    }

    previewDiv.innerHTML = matchedItems.map((item, i) => `
      <div class="rss-item ${item.matched ? 'matched' : ''}" data-index="${i}">
        ${this.escapeHtml(item.title)}
      </div>
    `).join('');

    previewDiv.querySelectorAll('.rss-item').forEach(el => {
      el.addEventListener('click', () => {
        const index = parseInt(el.dataset.index);
        this.selectRssItem(this.rssItems[index]);
      });
    });
  }

  selectRssItem(title) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    document.getElementById('pattern').value = escaped;
    this.updateRssPreview();
  }

  updateRssPreview() {
    this.renderRssPreview();
  }

  escapePattern() {
    const input = document.getElementById('pattern');
    input.value = input.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  copyEpisode() {
    navigator.clipboard.writeText('(?<episode>\\d+)');
  }

  updateProxyUrl() {
    const remote = document.getElementById('remote').value;
    const proxyBox = document.getElementById('proxy-url-box');
    
    if (!remote) {
      proxyBox.classList.add('d-none');
      return;
    }

    try {
      const base = window.location.origin;
      const proxyUrl = remote.replace('https://mikanani.me', base);
      
      document.getElementById('proxy-url').value = proxyUrl;
      proxyBox.classList.remove('d-none');
    } catch (error) {
      console.error('Failed to generate proxy URL:', error);
      proxyBox.classList.add('d-none');
    }
  }

  copyProxyUrl() {
    const url = document.getElementById('proxy-url').value;
    navigator.clipboard.writeText(url);
    Toast.success('Proxy URL 已复制到剪贴板');
  }

  async exportPatterns() {
    try {
      const response = await this.apiRequest('/api/patterns/export');
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `patterns_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      Toast.success('Patterns 导出成功！');
    } catch (error) {
      console.error('[exportPatterns] Failed:', error);
      Toast.error(`导出失败: ${error.message}`);
    }
  }

  async importPatterns(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.json')) {
      Toast.warning('请选择 JSON 文件');
      return;
    }
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.patterns || !Array.isArray(data.patterns)) {
        throw new Error('无效的导出文件格式');
      }
      
      // 询问用户导入模式
      const mode = await this.showImportModeDialog();
      if (!mode) return; // 用户取消了
      
      const importData = {
        ...data,
        mode: mode
      };
      
      const response = await this.apiRequest('/api/patterns/import', {
        method: 'POST',
        body: JSON.stringify(importData)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        let message = `导入完成！成功导入 ${result.importedCount} 个 patterns`;
        if (result.mode === 'overwrite') {
          message += '（覆盖模式）';
        }
        
        Toast.success(message);
        
        if (result.errors.length > 0) {
          console.error('Import errors:', result.errors);
          Toast.warning('部分 patterns 导入失败，请查看控制台');
        }
        
        this.loadPatterns();
      } else {
        throw new Error(result.message || '导入失败');
      }
      
      // 清空文件输入
      event.target.value = '';
    } catch (error) {
      console.error('[importPatterns] Failed:', error);
      Toast.error(`导入失败: ${error.message}`);
    }
  }

  showImportModeDialog() {
    return new Promise((resolve) => {
      // 创建遮罩层
      const overlay = document.createElement('div');
      overlay.id = 'import-modal-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      
      // 创建对话框
      const modal = document.createElement('div');
      modal.id = 'import-modal';
      modal.style.cssText = `
        background: white;
        padding: 2rem;
        border-radius: 0.5rem;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        border: 1px solid #dee2e6;
      `;
      
      modal.innerHTML = `
        <div style="margin-bottom: 1.5rem;">
          <h3 style="margin: 0 0 0.5rem 0; color: #495057; font-weight: 600;">选择导入模式</h3>
          <p style="margin: 0; color: #6c757d;">请选择如何导入patterns数据：</p>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem;">
          <button id="append-btn" class="btn btn-primary" style="width: 100%; text-align: left; padding: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <strong>追加模式</strong>
            </div>
            <small style="display: block; margin-top: 0.25rem; color: #6c757d;">
              将新数据添加到现有patterns之后，保留原有ID
            </small>
          </button>
          
          <button id="overwrite-btn" class="btn btn-warning" style="width: 100%; text-align: left; padding: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <strong>覆盖模式</strong>
            </div>
            <small style="display: block; margin-top: 0.25rem; color: #6c757d;">
              删除所有现有数据，重新导入并重置ID从1开始
            </small>
          </button>
        </div>
        
        <div style="text-align: right;">
          <button id="cancel-btn" class="btn btn-secondary">取消</button>
        </div>
      `;
      
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
      // 获取按钮元素
      const appendBtn = document.getElementById('append-btn');
      const overwriteBtn = document.getElementById('overwrite-btn');
      const cancelBtn = document.getElementById('cancel-btn');
      
      // 添加事件监听器
      const handleConfirm = (mode) => {
        document.body.removeChild(overlay);
        resolve(mode);
      };
      
      const handleCancel = () => {
        document.body.removeChild(overlay);
        resolve(null);
      };
      
      appendBtn.addEventListener('click', () => handleConfirm('append'));
      overwriteBtn.addEventListener('click', () => handleConfirm('overwrite'));
      cancelBtn.addEventListener('click', handleCancel);
      
      // 点击背景关闭
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          handleCancel();
        }
      });
      
      // 防止点击对话框内部关闭
      modal.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });
  }

  filterPatterns(query) {
    if (!this.allPatterns) return;

    const statusFilter = document.getElementById('filter-status').value;
    const lowerQuery = query.toLowerCase();

    const filtered = this.allPatterns.filter(pattern => {
      // 1. 文本搜索过滤
      const textMatch = !lowerQuery || 
        pattern.series.toLowerCase().includes(lowerQuery) ||
        pattern.pattern.toLowerCase().includes(lowerQuery) ||
        (pattern.releasegroup && pattern.releasegroup.toLowerCase().includes(lowerQuery));

      if (!textMatch) return false;

      // 2. 状态过滤
      if (statusFilter === 'all') return true;

      const series = this.seriesList?.find(s => s.title.toLowerCase() === pattern.series.toLowerCase());
      
      if (statusFilter === 'not-found') {
        return !series;
      }
      
      if (statusFilter === 'case-mismatch') {
        return series && series.title !== pattern.series;
      }
      
      if (statusFilter === 'normal') {
        return series && series.title === pattern.series;
      }

      return true;
    });

    // Render both views (only visible one matters for perf, but keep both in sync)
    this.renderPatterns(filtered);
    this.renderPatternCards(filtered);
    this.updateBatchUI(); // 更新批量操作UI状态
  }

  handleSortClick(th) {
    const sortField = th.dataset.sort;
    
    // 如果点击的是当前排序字段，则切换方向
    if (this.currentSort.field === sortField) {
      this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      // 否则设置新的排序字段，默认升序
      this.currentSort = { field: sortField, direction: 'asc' };
    }
    
    this.loadPatterns();
  }

  updateSortIndicators() {
    // 清除所有排序指示器
    document.querySelectorAll('.sortable').forEach(th => {
      th.classList.remove('asc', 'desc');
      const icon = th.querySelector('i');
      if (icon) {
        icon.className = 'bi bi-arrow-down-up';
      }
    });
    
    // 设置当前排序字段的指示器
    const currentTh = document.querySelector(`[data-sort="${this.currentSort.field}"]`);
    if (currentTh) {
      currentTh.classList.add(this.currentSort.direction);
      const icon = currentTh.querySelector('i');
      if (icon) {
        icon.className = `bi bi-arrow-down-up ${this.currentSort.direction}`;
      }
    }
  }

  async apiRequest(url, options = {}) {
    const defaultOptions = {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    };

    const mergedOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers
      }
    };

    if (options.body) {
      mergedOptions.body = options.body;
    }

    try {
      const response = await fetch(url, mergedOptions);

      // Handle 401 Unauthorized - token expired or invalid
      if (response.status === 401) {
        console.warn('[apiRequest] Received 401 Unauthorized, token may be expired');
        await this.handleAuthExpired();
        throw new Error('Authentication expired, please login again');
      }

      // Check if response is HTML (likely an error page)
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        console.error('[apiRequest] Received HTML instead of JSON:', url, response.status);
        throw new Error('Server returned HTML instead of JSON (likely a server error)');
      }

      return response;
    } catch (error) {
      console.error(`[apiRequest] Error fetching ${url}:`, error);
      throw error;
    }
  }

  // Handle authentication expiration - clear token and redirect to login
  async handleAuthExpired() {
    console.log('[handleAuthExpired] Clearing token and checking OIDC config...');
    
    // Clear local token
    localStorage.removeItem('token');
    this.token = null;

    // Check if OIDC is enabled and auto-login is configured
    try {
      const response = await fetch('/auth/config');
      if (response.ok) {
        const config = await response.json();
        if (config.oidcEnabled && config.oidcAutoLogin) {
          console.log('[handleAuthExpired] OIDC auto-login enabled, redirecting to OIDC login...');
          Toast.warning('Session expired, redirecting to login...');
          // Small delay to show the toast before redirect
          setTimeout(() => {
            window.location.href = '/auth/oidc/login';
          }, 500);
          return;
        }
      }
    } catch (e) {
      console.warn('[handleAuthExpired] Failed to check OIDC config:', e);
    }

    // Fallback: show login page
    console.log('[handleAuthExpired] Showing login page');
    Toast.warning('Session expired, please login again');
    document.getElementById('main-container').classList.add('d-none');
    document.getElementById('login-container').classList.remove('d-none');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ===== Auto-detect Subgroup from RSS =====
  detectSubgroup(title) {
    if (!title) return null;
    
    const subgroupPatterns = [
      { regex: /^\[ANi\]/, group: 'ANi' },
      { regex: /^\[Lilith-Raws\]/, group: 'Lilith-Raws' },
      { regex: /^\[LoliHouse\]/, group: 'LoliHouse' },
      { regex: /^\[NC-Raws\]/, group: 'NC-Raws' },
      { regex: /^\[SubsPlease\]/, group: 'SubsPlease' },
      { regex: /^\[Erai-raws\]/, group: 'Erai-raws' },
      { regex: /^【喵萌奶茶屋】/, group: '喵萌奶茶屋' },
      { regex: /^\[喵萌奶茶屋\]/, group: '喵萌奶茶屋' },
      { regex: /^\[桜都字幕组\]/, group: '桜都字幕组' },
      { regex: /^\[动漫国字幕组\]/, group: '动漫国字幕组' },
      { regex: /^\[悠哈璃羽字幕社\]/, group: '悠哈璃羽字幕社' },
      { regex: /^\[豌豆字幕组\]/, group: '豌豆字幕组' },
      { regex: /^\[千夏字幕组\]/, group: '千夏字幕组' },
      { regex: /^\[织梦字幕组\]/, group: '织梦字幕组' },
      { regex: /^\[霜庭云花Sub\]/, group: '霜庭云花Sub' },
      { regex: /^\[爱恋字幕社\]/, group: '爱恋字幕社' },
      { regex: /^\[天月搬运组\]/, group: '天月搬运组' },
      { regex: /^\[猎户不鸽压制\]/, group: '猎户不鸽压制' },
    ];

    for (const sp of subgroupPatterns) {
      if (sp.regex.test(title)) {
        return sp.group;
      }
    }
    
    // Try generic bracket pattern [xxx]
    const match = title.match(/^\[([^\]]+)\]/);
    if (match) {
      return match[1];
    }
    
    return null;
  }

  // Auto-fill subgroup when RSS is loaded
  autoFillSubgroup() {
    if (!this.rssItems || this.rssItems.length === 0) return;
    
    const currentGroup = document.getElementById('releasegroup').value;
    if (currentGroup) return; // Don't overwrite if already filled
    
    const detectedGroup = this.detectSubgroup(this.rssItems[0]);
    if (detectedGroup) {
      document.getElementById('releasegroup').value = detectedGroup;
      Toast.info(`检测到字幕组: ${detectedGroup}`);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[App] Mikanarr v2.1.0 - Build: 2025-01-14');
  new MikanarrApp();
});
