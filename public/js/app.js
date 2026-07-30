const { Toast, ConfirmDialog } = typeof module === 'object' && module.exports
  ? require('./ui')
  : window.MikanarrUi;
const MikanarrApi = typeof module === 'object' && module.exports
  ? require('./api')
  : window.MikanarrApi;

class MikanarrApp {
  constructor({ client, autoInit = true } = {}) {
    this.client = client || MikanarrApi.createClient({
      onUnauthorized: () => this.handleAuthExpired()
    });
    this.currentPatternId = null;
    this.seriesList = [];
    this.seriesLoadGeneration = 0;
    this.rssItems = [];
    this.tmdbDetails = new Map();
    this.authExpired = false;
    this.debounceTimer = null;
    
    if (autoInit) this.init();
  }

  init() {
    this.initTheme();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.start();
  }

  async start() {
    const authenticated = await this.checkAuth();
    if (!authenticated && !this.authExpired) await this.checkOidcConfig();
  }

  async checkOidcConfig({ allowAutoLogin = true } = {}) {
    try {
      const response = await this.apiRequest('/auth/config', { skipUnauthorized: true });
      if (response.ok) {
        const config = await response.json();
        this.oidcAutoLogin = Boolean(config.oidcAutoLogin);
        if (config.oidcEnabled) {
          const container = document.getElementById('oidc-login-container');
          if (container) container.classList.remove('d-none');
          if (config.oidcAutoLogin && allowAutoLogin) {
            console.log('[OIDC] Auto-login enabled, redirecting...');
            window.location.href = '/auth/oidc/login';
            return;
          }
          if (container) {
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
    try {
      await this.client.session();
      this.authExpired = false;
      this.showAuthenticated();
      await this.loadAuthenticatedData();
      return true;
    } catch (_) {
      if (!this.authExpired) this.showLoggedOut();
      return false;
    }
  }

  showAuthenticated() {
    document.getElementById('login-container').classList.add('d-none');
    document.getElementById('main-container').classList.remove('d-none');
  }

  showLoggedOut() {
    document.getElementById('login-container').classList.remove('d-none');
    document.getElementById('main-container').classList.add('d-none');
  }

  async loadAuthenticatedData() {
    this.initView();
    await this.loadConfig();
    await Promise.all([this.loadPatterns(), this.loadSeries()]);
  }

  async loadConfig() {
    try {
      const response = await this.apiRequest('/api/config');
      if (response.ok) {
        const config = await response.json();
        this.sonarrHost = config.sonarrHost || '';
      }
    } catch (error) {
      if (error.status === 401) throw error;
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
    // 编辑页面删除按钮
    document.getElementById('edit-delete-btn').addEventListener('click', async () => {
      if (this.currentPatternId) {
        await this.deletePattern(this.currentPatternId);
        // deletePattern will reload list, but we need to switch view manually if it doesn't
        this.showPatternList();
      }
    });
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
    document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-input').click());
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
    
    // 实时正则预览
    document.getElementById('pattern').addEventListener('input', () => {
      // 使用防抖以提高性能
      clearTimeout(this.previewDebounceTimer);
      this.previewDebounceTimer = setTimeout(() => this.renderRssPreview(), 300);
    });
    
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
    const modal = window.bootstrap.Modal.getOrCreateInstance(document.getElementById('add-series-modal'));
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
      const message = document.createElement('div');
      message.className = 'text-center p-3 text-danger';
      message.textContent = `搜索出错: ${error.message}`;
      resultsDiv.replaceChildren(message);
    }
  }

  renderSearchResults() {
    const resultsDiv = document.getElementById('sonarr-search-results');
    const pageSize = 10;
    const end = this.currentSearchPage * pageSize;
    const results = this.searchResults.slice(0, end);
    const hasMore = this.searchResults.length > end;
    resultsDiv.replaceChildren();

    if (!results || results.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'text-center p-3 text-muted';
      empty.textContent = '未找到相关剧集';
      resultsDiv.appendChild(empty);
      return;
    }

    results.forEach((series, index) => {
      const exists = this.seriesList.some(s => s.tvdbId === series.tvdbId);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'list-group-item list-group-item-action d-flex align-items-center';
      button.disabled = exists;
      button.addEventListener('click', () => this.selectSeriesToAdd(index));

      const img = document.createElement('img');
      img.src = '/images/icon.svg';
      img.alt = '';
      img.className = 'rounded me-3';
      img.width = 40;
      img.height = 60;
      img.style.objectFit = 'cover';

      const details = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'fw-bold';
      title.append(document.createTextNode(`${series.title} (${series.year ?? ''})`));
      if (exists) {
        const badge = document.createElement('span');
        badge.className = 'badge bg-success ms-2';
        badge.textContent = '已存在';
        title.append(' ', badge);
      }

      const metadata = document.createElement('small');
      metadata.className = 'text-muted';
      metadata.append(document.createTextNode(`TVDB: ${series.tvdbId ?? ''} `));
      const tmdbId = document.createElement('span');
      tmdbId.textContent = series.tmdbId ? `| TMDB: ${series.tmdbId}` : '';
      metadata.append(tmdbId, document.createTextNode(` | ${series.network || 'Unknown'}`));
      details.append(title, metadata);
      button.append(img, details);
      resultsDiv.appendChild(button);

      if (!series.tvdbId) return;
      this.apiRequest(`/tmdb/find/${series.tvdbId}?source=tvdb_id`)
        .then(response => response.ok ? response.json() : null)
        .then(data => {
          const tmdbResult = data?.tv_results?.[0];
          if (tmdbResult?.id) {
            tmdbId.textContent = `| TMDB: ${tmdbResult.id}`;
            series.tmdbId = tmdbResult.id;
          }
          if (tmdbResult?.poster_path) {
            img.src = this.imageProxyUrl(`https://image.tmdb.org/t/p/w92${tmdbResult.poster_path}`);
          } else {
            this.loadSonarrImage(series, img);
          }
        })
        .catch(() => this.loadSonarrImage(series, img));
    });

    if (hasMore) {
      const moreWrapper = document.createElement('div');
      moreWrapper.className = 'text-center p-2';
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn btn-sm btn-outline-primary w-100';
      more.textContent = '加载更多';
      more.addEventListener('click', () => this.loadMoreSearchResults());
      moreWrapper.appendChild(more);
      resultsDiv.appendChild(moreWrapper);
    }
  }

  loadMoreSearchResults() {
    this.currentSearchPage++;
    this.renderSearchResults();
  }

  imageProxyUrl(url) {
    if (!url) return '/images/icon.svg';
    if (url.startsWith('/api/image-proxy?url=')) return url;
    let parsed;
    try {
      parsed = new URL(url, window.location.origin);
    } catch (_) {
      return '/images/icon.svg';
    }
    if (parsed.origin === window.location.origin) return `${parsed.pathname}${parsed.search}`;
    return `/api/image-proxy?url=${encodeURIComponent(parsed.href)}`;
  }

  sonarrImageUrl(url) {
    if (!url) return '/images/icon.svg';
    try {
      const sonarrBase = this.sonarrHost ? new URL(this.sonarrHost) : null;
      const parsed = new URL(url, sonarrBase || window.location.origin);
      const relative = !/^[a-z][a-z\d+.-]*:/i.test(url) && !url.startsWith('//');
      if (relative || (sonarrBase && parsed.origin === sonarrBase.origin)) {
        const path = parsed.pathname.startsWith('/sonarr/') ? parsed.pathname : `/sonarr${parsed.pathname}`;
        return `${path}${parsed.search}`;
      }
      return this.imageProxyUrl(parsed.href);
    } catch (_) {
      return '/images/icon.svg';
    }
  }

  externalHttpUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
      return parsed.href;
    } catch (_) {
      return null;
    }
  }

  loadSonarrImage(series, targetImg) {
    const img = targetImg;
    if (!img) return;

    let posterUrl = series.images?.find(i => i.coverType === 'poster')?.remoteUrl ||
                    series.images?.find(i => i.coverType === 'poster')?.url;
                    
    if (posterUrl) {
      img.src = this.sonarrImageUrl(posterUrl);
    } else {
      img.src = '/images/icon.svg';
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
      await this.client.login({ username, password });
      this.authExpired = false;
      errorDiv.classList.add('d-none');
      this.showAuthenticated();
      await this.loadAuthenticatedData();
    } catch (error) {
      errorDiv.textContent = '登录失败: ' + error.message;
      errorDiv.classList.remove('d-none');
    }
  }

  async handleLogout() {
    try {
      await this.client.logout();
      this.showLoggedOut();
      await this.checkOidcConfig({ allowAutoLogin: false });
    } catch (error) {
      Toast.error(`退出失败: ${error.message}`);
    }
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
      this.filteredPatterns = [];
      this.updatePatternSummary();
      this.renderCurrentView([]);
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
          <td><div class="skeleton skeleton-checkbox"></div></td>
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
    this.updateBatchUI();
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
      if (e.status === 401) throw e;
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

    try {
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
      const modal = window.bootstrap.Modal.getOrCreateInstance(document.getElementById('add-series-modal'));
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
      Toast.success(`成功添加剧集: ${this.selectedSeries.title}`);

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

    rootSelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '选择路径...';
    rootSelect.appendChild(placeholder);
    this.sonarrOptions.rootFolders.forEach(folder => {
      const option = document.createElement('option');
      option.value = folder.path;
      option.textContent = `${folder.path} (${this.formatBytes(folder.freeSpace)} Free)`;
      rootSelect.appendChild(option);
    });

    qualitySelect.replaceChildren();
    this.sonarrOptions.qualityProfiles.forEach(profile => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name;
      qualitySelect.appendChild(option);
    });
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
    const generation = ++this.seriesLoadGeneration;
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
    } catch (error) {
      console.error('[loadSeries] Failed to load series:', error);
      if (generation !== this.seriesLoadGeneration) return;
      this.renderSeriesLoadError(error);
    }
  }

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

  renderSeriesOptions(series) {
    const select = document.getElementById('series');
    const selectedSeries = select.value;
    select.innerHTML = '<option value="">选择系列...</option>';
    
    if (!series || series.length === 0) {
      console.warn('[renderSeriesOptions] No series to render');
      return;
    }
    
    series.forEach(s => {
      const option = document.createElement('option');
      option.value = s.title;
      
      // Display format: "English Name (中文名)" if Chinese name exists
      const zhName = s.tmdbId ? this.tmdbCache[s.tmdbId] : null;
      option.textContent = zhName ? `${s.title} (${zhName})` : s.title;
      
      select.appendChild(option);
    });
    select.value = selectedSeries;
    
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
        const tmdbData = await this.getTmdbDetails(series.tmdbId);
        if (tmdbData?.poster_path) {
          posterUrl = `https://image.tmdb.org/t/p/w185${tmdbData.poster_path}`;
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
      }
    }

    posterImg.src = posterUrl ? this.sonarrImageUrl(posterUrl) : '/images/icon.svg';

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
      const link = document.getElementById('series-sonarr-link');
      const safeLink = this.externalHttpUrl(`${this.sonarrHost}/series/${series.titleSlug}`);
      if (safeLink) {
        link.href = safeLink;
        link.classList.remove('d-none');
      } else {
        link.classList.add('d-none');
      }
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

  renderPatterns(patterns) {
    const tbody = document.getElementById('pattern-table-body');
    tbody.innerHTML = '';
    
    // Empty state
    if (!patterns || patterns.length === 0) {
      const isFiltered = document.getElementById('search-input').value || 
                         document.getElementById('filter-status').value !== 'all';
      const stateClass = isFiltered ? 'empty-state--filtered' : 'empty-state--library';
      
      tbody.innerHTML = `
        <tr>
          <td colspan="10">
            <div class="empty-state ${stateClass}">
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
                <button type="button" class="btn btn-primary btn-empty-new">
                  <i class="bi bi-plus-lg"></i> 新建 Pattern
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
      tbody.querySelector('.btn-empty-new')?.addEventListener('click', () => this.showPatternEdit());
      return;
    }
    
    patterns.forEach(pattern => {
      const status = this.getPatternStatus(pattern);
      const statusMeta = {
        normal: { label: '正常', badgeClass: 'status-ok' },
        'case-mismatch': { label: '名称不一致', badgeClass: 'status-warning' },
        'not-found': { label: '未找到系列', badgeClass: 'status-error' }
      }[status];
      // Find the series to get tmdbId for Chinese name lookup (case-insensitive)
      const series = this.seriesList?.find(s => s.title.toLowerCase() === pattern.series.toLowerCase());
      const zhName = series?.tmdbId ? this.tmdbCache[series.tmdbId] : null;
      
      // Check match status
      let matchIcon = '';
      let fixBtn = '';
      let addBtn = ''; // Button to add series to Sonarr
      
      if (!series) {
        // Series not found in Sonarr at all
        matchIcon = '<i class="bi bi-exclamation-circle text-danger" title="Sonarr中未找到此系列"></i> ';
        
        // Add "Add Series" button
        addBtn = `<button type="button" class="btn btn-sm btn-outline-success btn-add-series" title="搜索并添加到 Sonarr" aria-label="搜索并添加到 Sonarr">
            <i class="bi bi-plus-circle"></i>
          </button>`;
      } else if (series.title !== pattern.series) {
        // Found but case doesn't match exactly - might need update
        matchIcon = '<i class="bi bi-exclamation-triangle text-warning pattern-match-warning"></i> ';
        fixBtn = `<button type="button" class="btn btn-sm btn-outline-warning btn-fix" title="修复系列名" aria-label="修复系列名">
            <i class="bi bi-wrench"></i>
          </button>`;
      }
      
      const displayName = zhName ? `${pattern.series} (${zhName})` : pattern.series;
      
      // Sonarr link button
      const sonarrBtn = series?.titleSlug && this.sonarrHost 
        ? `<a target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-info btn-sonarr-link" title="在Sonarr中打开" aria-label="在Sonarr中打开">
            <i class="bi bi-box-arrow-up-right"></i>
          </a>`
        : '';
      
      // Copy proxy URL button (only if remote URL exists)
      const copyUrlBtn = pattern.remote
        ? `<button type="button" class="btn btn-sm btn-outline-secondary btn-copy-url" title="复制代理URL" aria-label="复制代理URL">
            <i class="bi bi-clipboard"></i>
          </button>`
        : '';

      const tr = document.createElement('tr');
      tr.className = `pattern-row pattern-row--${status}`;
      tr.innerHTML = `
        <td><input type="checkbox" class="form-check-input row-checkbox"></td>
        <td class="pattern-id"></td>
        <td>${matchIcon}<span class="pattern-status-badge"></span> <strong class="pattern-display-name"></strong></td>
        <td><span class="badge bg-secondary">S<span class="pattern-season"></span></span></td>
        <td><span class="badge ${this.getLanguageBadgeClass(pattern.language)} pattern-language"></span></td>
        <td><span class="badge bg-primary pattern-quality"></span></td>
        <td>
          ${(() => {
            if (series) {
              const stats = this.getSeasonStats(series, pattern.season);
              return `
                <div class="d-flex flex-column" style="min-width: 100px;">
                  <div class="d-flex justify-content-between small text-muted mb-1">
                    <span>${stats.percent}%</span>
                    <span>${stats.downloaded}/${stats.total}</span>
                  </div>
                  <div class="progress" style="height: 4px;">
                    <div class="progress-bar bg-success" role="progressbar" style="width: ${stats.percent}%"></div>
                  </div>
                </div>
              `;
            }
            return '<span class="text-muted">-</span>';
          })()}
        </td>
        <td class="pattern-last-matched"></td>
        <td class="hide-mobile pattern-release-group"></td>
        <td class="text-nowrap">
          <div class="action-buttons d-flex gap-1">
            ${copyUrlBtn}
            ${sonarrBtn}
            ${addBtn}
            ${fixBtn}
            <button type="button" class="btn btn-sm btn-outline-primary btn-edit" title="编辑" aria-label="编辑 Pattern">
              <i class="bi bi-pencil"></i>
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger btn-delete" title="删除" aria-label="删除 Pattern">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      `;
      const checkbox = tr.querySelector('.row-checkbox');
      checkbox.dataset.id = pattern.id;
      const tableStatus = tr.querySelector('.pattern-status-badge');
      tableStatus.classList.add(statusMeta.badgeClass);
      tableStatus.textContent = statusMeta.label;
      tr.querySelector('.pattern-id').textContent = pattern.id;
      tr.querySelector('.pattern-display-name').textContent = displayName;
      tr.querySelector('.pattern-season').textContent = pattern.season;
      tr.querySelector('.pattern-language').textContent = pattern.language;
      tr.querySelector('.pattern-quality').textContent = pattern.quality;
      tr.querySelector('.pattern-release-group').textContent = pattern.releasegroup || '-';
      tr.querySelectorAll('.btn-edit, .btn-delete, .btn-fix').forEach(button => {
        button.dataset.id = pattern.id;
      });
      const warning = tr.querySelector('.pattern-match-warning');
      if (warning) warning.title = `名称不完全匹配，Sonarr中为: ${series.title}`;
      const fix = tr.querySelector('.btn-fix');
      if (fix) fix.dataset.correctName = series.title;
      const add = tr.querySelector('.btn-add-series');
      if (add) add.dataset.query = pattern.series;
      const copy = tr.querySelector('.btn-copy-url');
      if (copy) copy.dataset.remote = pattern.remote;
      const sonarrLink = tr.querySelector('.btn-sonarr-link');
      if (sonarrLink) {
        const safeLink = this.externalHttpUrl(`${this.sonarrHost}/series/${series.titleSlug}`);
        if (safeLink) sonarrLink.href = safeLink;
        else sonarrLink.remove();
      }
      const lastMatched = tr.querySelector('.pattern-last-matched');
      if (pattern.last_matched_at) {
        const date = new Date(pattern.last_matched_at);
        const wrapper = document.createElement('div');
        wrapper.title = date.toLocaleString();
        wrapper.append(document.createTextNode(date.toLocaleDateString()), document.createElement('br'));
        const count = document.createElement('small');
        count.className = 'text-muted';
        count.textContent = `共 ${pattern.match_count || 0} 次`;
        wrapper.appendChild(count);
        lastMatched.appendChild(wrapper);
      } else {
        lastMatched.textContent = '-';
      }
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
      const stateClass = isFiltered ? 'empty-state--filtered' : 'empty-state--library';
      
      container.innerHTML = `
        <div class="pattern-card-empty ${stateClass}">
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
            <button type="button" class="btn btn-primary btn-empty-card-new">
              <i class="bi bi-plus-lg"></i> 新建 Pattern
            </button>
          ` : ''}
        </div>
      `;
      container.querySelector('.btn-empty-card-new')?.addEventListener('click', () => this.showPatternEdit());
      return;
    }

    patterns.forEach((pattern, index) => container.appendChild(this.createPatternCard(pattern, index)));
  }

  createPatternCard(pattern, index = 0) {
    const status = this.getPatternStatus(pattern);
    const statusMeta = {
      normal: { label: '正常', badgeClass: 'status-ok' },
      'case-mismatch': { label: '名称不一致', badgeClass: 'status-warning' },
      'not-found': { label: '未找到系列', badgeClass: 'status-error' }
    }[status];
    // Find the series to get tmdbId and stats
    const series = this.seriesList?.find(s => s.title.toLowerCase() === pattern.series.toLowerCase());
    const zhName = series?.tmdbId ? this.tmdbCache[series.tmdbId] : null;

    // Calculate episode stats
    let downloadedEpisodes = 0;
    let totalEpisodes = 0;
    let missingEpisodes = 0;
    let progressPercent = 0;

    if (series) {
      const stats = this.getSeasonStats(series, pattern.season);
      downloadedEpisodes = stats.downloaded;
      totalEpisodes = stats.total;
      missingEpisodes = stats.missing;
      progressPercent = stats.percent;
    }

    // Determine if we have poster available
    const hasPoster = series?.tmdbId || series?.images?.some(i => i.coverType === 'fanart' || i.coverType === 'poster');

    const card = document.createElement('div');
    card.className = `pattern-card pattern-card--${status}`;
    card.style.setProperty('--card-index', String(Math.min(index, 8)));
    card.dataset.patternId = pattern.id;
    card.dataset.tmdbId = series?.tmdbId || '';

    // Build poster HTML - use placeholder div if no image available
    let posterContent = '';
    if (hasPoster) {
      posterContent = '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="" loading="lazy">';
    } else {
      posterContent = `
        <div class="pattern-card-poster-placeholder">
          <i class="bi bi-film"></i>
          <span></span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="pattern-card-poster cursor-pointer">
        ${posterContent}
        <span class="pattern-card-season-badge"></span>
        <span class="pattern-card-status-badge"></span>
      </div>
      <div class="pattern-card-body cursor-pointer">
        <div class="pattern-card-title"></div>
        ${zhName ? '<div class="pattern-card-title-zh"></div>' : ''}
        <div class="pattern-card-meta">
          <span class="badge ${this.getLanguageBadgeClass(pattern.language)} pattern-card-language"></span>
          <span class="badge bg-primary pattern-card-quality"></span>
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
          <input type="checkbox" class="form-check-input card-checkbox">
        </div>
        <div class="pattern-card-actions">
          <button type="button" class="btn btn-sm btn-outline-secondary btn-card-copy" title="复制RSS链接" aria-label="复制 RSS 链接">
            <i class="bi bi-clipboard"></i>
          </button>
          ${series?.titleSlug && this.sonarrHost ? `
            <a target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-info btn-card-sonarr" title="在Sonarr中打开" aria-label="在 Sonarr 中打开">
              <i class="bi bi-box-arrow-up-right"></i>
            </a>
          ` : ''}
          <button type="button" class="btn btn-sm btn-outline-primary btn-card-edit" title="编辑" aria-label="编辑 Pattern">
            <i class="bi bi-pencil"></i>
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger btn-card-delete" title="删除" aria-label="删除 Pattern">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    `;

    const posterImage = card.querySelector('.pattern-card-poster img');
    if (posterImage) posterImage.alt = pattern.series;
    const posterLabel = card.querySelector('.pattern-card-poster-placeholder span');
    if (posterLabel) posterLabel.textContent = `${pattern.series.substring(0, 12)}${pattern.series.length > 12 ? '...' : ''}`;
    const cardStatus = card.querySelector('.pattern-card-status-badge');
    cardStatus.classList.add(statusMeta.badgeClass);
    cardStatus.textContent = statusMeta.label;
    card.querySelector('.pattern-card-season-badge').textContent = `S${pattern.season}`;
    card.querySelector('.pattern-card-title').textContent = pattern.series;
    if (zhName) card.querySelector('.pattern-card-title-zh').textContent = zhName;
    card.querySelector('.pattern-card-language').textContent = pattern.language;
    card.querySelector('.pattern-card-quality').textContent = pattern.quality;
    card.querySelector('.btn-card-copy').dataset.remote = pattern.remote || '';
    card.querySelector('.card-checkbox').dataset.id = pattern.id;
    card.querySelectorAll('.btn-card-edit, .btn-card-delete').forEach(button => {
      button.dataset.id = pattern.id;
    });
    const sonarrLink = card.querySelector('.btn-card-sonarr');
    if (sonarrLink) {
      const safeLink = this.externalHttpUrl(`${this.sonarrHost}/series/${series.titleSlug}`);
      if (safeLink) sonarrLink.href = safeLink;
      else sonarrLink.remove();
    }

    // Add event listeners
    const editHandler = (e) => {
      // Prevent bubbling if clicking on specific elements inside body
      if (e.target.closest('.pattern-card-progress')) return;
      this.editPattern(parseInt(card.dataset.patternId));
    };

    // Touch gesture support (Swipe)
    let touchStartX = 0;
    let touchEndX = 0;
    const swipeThreshold = 80;

    card.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    card.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });

    const handleSwipe = () => {
      const swipeDistance = touchEndX - touchStartX;
      if (Math.abs(swipeDistance) > swipeThreshold) {
        if (swipeDistance > 0) {
          // Swipe Right -> Edit
          this.editPattern(parseInt(card.dataset.patternId));
        } else {
          // Swipe Left -> Confirm Delete
          // Visual feedback before action would be ideal, but for now direct action
          if (confirm('确定要删除这个 Pattern 吗？(滑动触发)')) {
             this.deletePattern(parseInt(card.dataset.patternId));
          }
        }
      }
    };

    card.querySelector('.pattern-card-poster').addEventListener('click', editHandler);
    card.querySelector('.pattern-card-body').addEventListener('click', editHandler);

    card.querySelector('.btn-card-copy')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const remote = e.currentTarget.dataset.remote;
      if (remote) {
        await this.copyProxyUrlFromRemote(remote);
      } else {
        Toast.warning('无有效 RSS 链接');
      }
    });

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

    // Try TMDB first (优先使用竖版 poster)
    if (series.tmdbId) {
      try {
        const tmdbData = await this.getTmdbDetails(series.tmdbId);
        if (tmdbData?.poster_path) {
          img.src = this.imageProxyUrl(`https://image.tmdb.org/t/p/w154${tmdbData.poster_path}`);
          return;
        } else if (tmdbData?.backdrop_path) {
          img.src = this.imageProxyUrl(`https://image.tmdb.org/t/p/w300${tmdbData.backdrop_path}`);
          return;
        }
      } catch (error) {
        console.warn('[loadCardPoster] TMDB failed, using Sonarr fallback:', error);
      }
    }

    try {
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
        // 如果是 Sonarr 内部代理图片，尝试添加 width 参数 (取决于 Sonarr 版本支持)
        if (imageUrl.includes('/MediaCover')) {
          imageUrl += `${imageUrl.includes('?') ? '&' : '?'}width=200`;
        }
        img.src = this.sonarrImageUrl(imageUrl);
      }
    } catch (e) {
      console.warn('[loadCardPoster] Failed:', e);
    }
  }

  getTmdbDetails(tmdbId) {
    if (!this.tmdbDetails.has(tmdbId)) {
      const details = this.apiRequest(`/tmdb/tv/${tmdbId}`)
        .then(response => response.ok ? response.json() : null)
        .catch(error => {
          this.tmdbDetails.delete(tmdbId);
          throw error;
        });
      this.tmdbDetails.set(tmdbId, details);
    }
    return this.tmdbDetails.get(tmdbId);
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
  getVisibleCheckboxes() {
    const selector = this.currentView === 'card' ? '.card-checkbox' : '.row-checkbox';
    return Array.from(document.querySelectorAll(selector));
  }

  handleSelectAll(checked) {
    this.getVisibleCheckboxes().forEach(cb => {
      cb.checked = checked;
    });
    this.updateBatchUI();
  }

  updateBatchUI() {
    const allCheckboxes = this.getVisibleCheckboxes();
    const selected = allCheckboxes.filter(checkbox => checkbox.checked);
    const batchDeleteBtn = document.getElementById('batch-delete-btn');
    const batchFixBtn = document.getElementById('batch-fix-btn');
    const selectAll = document.getElementById('select-all');
    const count = String(selected.length);
    const selectedCount = document.getElementById('selected-count');
    const summarySelected = document.getElementById('pattern-summary-selected');
    const batchActions = document.getElementById('batch-actions');
    if (selectedCount) selectedCount.textContent = count;
    if (summarySelected) summarySelected.textContent = count;
    batchActions?.classList.toggle('d-none', selected.length === 0);
    
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
    const selected = this.getVisibleCheckboxes().filter(checkbox => checkbox.checked);
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
    const selected = this.getVisibleCheckboxes().filter(checkbox => checkbox.checked);
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
        const updatedPattern = { ...p, series: series.title };
        const response = await this.apiRequest(`/api/patterns/${p.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedPattern)
        });
        
        if (response.ok) {
          p.series = series.title;
          successCount++;
        }
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
      
      outputDiv.replaceChildren();
      if (matches.length > 0) {
        const summary = document.createElement('div');
        summary.className = 'text-success mb-2';
        summary.textContent = `✓ 匹配 ${matches.length} 条:`;
        outputDiv.appendChild(summary);
        const list = document.createElement('ul');
        list.className = 'mb-2';
        matches.slice(0, 5).forEach(m => {
          const item = document.createElement('li');
          item.append(document.createTextNode(`${m.title} → `));
          const episode = document.createElement('strong');
          episode.textContent = `E${m.episode}`;
          item.appendChild(episode);
          list.appendChild(item);
        });
        if (matches.length > 5) {
          const remaining = document.createElement('li');
          remaining.textContent = `... 还有 ${matches.length - 5} 条`;
          list.appendChild(remaining);
        }
        outputDiv.appendChild(list);
      }
      
      if (nonMatches.length > 0) {
        const summary = document.createElement('div');
        summary.className = 'text-danger';
        summary.textContent = `✗ 未匹配 ${nonMatches.length} 条`;
        outputDiv.appendChild(summary);
      }
      
      if (matches.length === 0) {
        const message = document.createElement('span');
        message.className = 'text-danger';
        message.textContent = '未匹配任何条目，请检查正则表达式';
        outputDiv.replaceChildren(message);
      }
      resultBox.classList.remove('d-none');
    } catch (error) {
      const message = document.createElement('span');
      message.className = 'text-danger';
      message.textContent = `正则表达式错误: ${error.message}`;
      outputDiv.replaceChildren(message);
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

    const deleteBtn = document.getElementById('edit-delete-btn');

    if (pattern) {
      console.log('[showPatternEdit] Editing pattern:', pattern.series);
      document.getElementById('edit-title').textContent = '编辑 Pattern';
      // Show delete button in edit mode
      deleteBtn.classList.remove('d-none');
      
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
      // Hide delete button in create mode
      deleteBtn.classList.add('d-none');

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

      previewDiv.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-circle" aria-hidden="true"></i> <span class="rss-error-message"></span>
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
      previewDiv.querySelector('.rss-error-message').textContent = error.message || '加载失败';
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

    previewDiv.replaceChildren();
    matchedItems.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = `rss-item${item.matched ? ' matched' : ''}`;
      row.textContent = item.title;
      row.addEventListener('click', () => this.selectRssItem(this.rssItems[index]));
      previewDiv.appendChild(row);
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
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'import-modal-title');
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
          <h3 id="import-modal-title" style="margin: 0 0 0.5rem 0; color: #495057; font-weight: 600;">选择导入模式</h3>
          <p style="margin: 0; color: #6c757d;">请选择如何导入patterns数据：</p>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem;">
          <button type="button" data-import-action="append" class="btn btn-primary" style="width: 100%; text-align: left; padding: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <strong>追加模式</strong>
            </div>
            <small style="display: block; margin-top: 0.25rem; color: #6c757d;">
              将新数据添加到现有patterns之后，保留原有ID
            </small>
          </button>
          
          <button type="button" data-import-action="overwrite" class="btn btn-warning" style="width: 100%; text-align: left; padding: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <strong>覆盖模式</strong>
            </div>
            <small style="display: block; margin-top: 0.25rem; color: #6c757d;">
              删除所有现有数据，重新导入并重置ID从1开始
            </small>
          </button>
        </div>
        
        <div style="text-align: right;">
          <button type="button" data-import-action="cancel" class="btn btn-secondary">取消</button>
        </div>
      `;
      
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
      // 获取按钮元素
      const appendBtn = modal.querySelector('[data-import-action="append"]');
      const overwriteBtn = modal.querySelector('[data-import-action="overwrite"]');
      const cancelBtn = modal.querySelector('[data-import-action="cancel"]');
      const previousFocus = document.activeElement;
      let settled = false;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', handleKeydown);
        overlay.remove();
        if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
        resolve(value);
      };
      const handleKeydown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(null);
        } else if (event.key === 'Tab') {
          const firstAction = appendBtn;
          const lastAction = cancelBtn;
          if (event.shiftKey && (!modal.contains(document.activeElement) || document.activeElement === firstAction)) {
            event.preventDefault();
            lastAction.focus();
          } else if (!event.shiftKey && (!modal.contains(document.activeElement) || document.activeElement === lastAction)) {
            event.preventDefault();
            firstAction.focus();
          }
        }
      };

      appendBtn.addEventListener('click', () => finish('append'));
      overwriteBtn.addEventListener('click', () => finish('overwrite'));
      cancelBtn.addEventListener('click', () => finish(null));
      document.addEventListener('keydown', handleKeydown);
      
      // 点击背景关闭
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          finish(null);
        }
      });
      
      // 防止点击对话框内部关闭
      modal.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      appendBtn.focus();
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
      return statusFilter === 'all' || this.getPatternStatus(pattern) === statusFilter;
    });

    this.filteredPatterns = filtered;
    this.updatePatternSummary();
    this.renderCurrentView(filtered);
    this.updateBatchUI(); // 更新批量操作UI状态
  }

  renderCurrentView(patterns = this.filteredPatterns || this.allPatterns || []) {
    if (this.currentView === 'card') this.renderPatternCards(patterns);
    else this.renderPatterns(patterns);
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
      th.closest('th')?.setAttribute('aria-sort', 'none');
      const icon = th.querySelector('i');
      if (icon) {
        icon.className = 'bi bi-arrow-down-up';
      }
    });
    
    // 设置当前排序字段的指示器
    const currentTh = document.querySelector(`[data-sort="${this.currentSort.field}"]`);
    if (currentTh) {
      currentTh.classList.add(this.currentSort.direction);
      currentTh.closest('th')?.setAttribute(
        'aria-sort',
        this.currentSort.direction === 'asc' ? 'ascending' : 'descending'
      );
      const icon = currentTh.querySelector('i');
      if (icon) {
        icon.className = `bi bi-arrow-down-up ${this.currentSort.direction}`;
      }
    }
  }

  async apiRequest(url, options = {}) {
    return this.client.request(url, options);
  }

  async handleAuthExpired() {
    if (this.authExpired) return;
    this.authExpired = true;
    this.showLoggedOut();
    Toast.warning('Session expired, please login again');
    await this.checkOidcConfig();
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

  // Get stats for a specific season
  getSeasonStats(series, seasonNumber) {
    if (!series || !series.seasons) {
      return { total: 0, downloaded: 0, missing: 0, percent: 0 };
    }

    // Ensure seasonNumber is an integer
    const seasonNum = parseInt(seasonNumber);
    const season = series.seasons.find(s => s.seasonNumber === seasonNum);
    
    if (!season || !season.statistics) {
      return { total: 0, downloaded: 0, missing: 0, percent: 0 };
    }

    const normalizeCount = value => {
      const count = Number(value);
      return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
    };
    const total = normalizeCount(season.statistics.episodeCount);
    const downloaded = normalizeCount(season.statistics.episodeFileCount);
    
    // In Sonarr v3, episodeFileCount is what we have. 
    // totalEpisodeCount might include unmonitored ones.
    // For simplicity, we use episodeCount as total.
    
    const missing = Math.max(0, total - downloaded);
    const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;

    return { total, downloaded, missing, percent };
  }
}

if (typeof module === 'object' && module.exports) {
  module.exports = { MikanarrApp };
} else {
  window.MikanarrApp = MikanarrApp;
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[App] Mikanarr v2.1.0 - Build: 2026-07-26');
    new MikanarrApp();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .catch(error => console.error('Service Worker registration failed:', error));
    }
  });
}
