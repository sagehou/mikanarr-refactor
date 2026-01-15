class MikanarrApp {
  constructor() {
    this.token = localStorage.getItem('token');
    this.currentPatternId = null;
    this.seriesList = [];
    this.rssItems = [];
    this.debounceTimer = null;
    
    this.init();
  }

  init() {
    this.initTheme();
    this.checkAuth();
    this.setupEventListeners();
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

  checkAuth() {
    if (this.token) {
      document.getElementById('login-container').classList.add('d-none');
      document.getElementById('main-container').classList.remove('d-none');
      this.loadConfig();
      this.loadPatterns();
      this.loadSeries();
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
    document.getElementById('series').addEventListener('change', () => this.loadSeasons());
    document.getElementById('pattern').addEventListener('input', () => this.updateRssPreview());
    document.getElementById('copy-proxy-btn').addEventListener('click', () => this.copyProxyUrl());
    document.getElementById('export-btn').addEventListener('click', () => this.exportPatterns());
    document.getElementById('import-input').addEventListener('change', (e) => this.importPatterns(e));
    
    // Mikan导入
    document.getElementById('import-mikan-btn').addEventListener('click', () => this.importFromMikan());
    
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
    
    // 添加表头排序事件监听
    document.querySelectorAll('.sortable').forEach(th => {
      th.addEventListener('click', () => this.handleSortClick(th));
    });
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
    try {
      const currentSort = this.currentSort || { field: 'created_at', direction: 'desc' };
      const response = await this.apiRequest(`/api/patterns?sortBy=${currentSort.field}&order=${currentSort.direction}`);
      const patterns = await response.json();
      this.allPatterns = patterns; // 保存所有 patterns
      this.filterPatterns(document.getElementById('search-input').value); // 使用筛选渲染
      this.updateSortIndicators();
    } catch (error) {
      console.error('Failed to load patterns:', error);
    }
  }

  // 当前排序状态
  currentSort = { field: 'id', direction: 'desc' };
  allPatterns = []; // 初始化为空数组

  // TMDB中文名缓存 { tmdbId: titleZh }
  tmdbCache = {};

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
    
    patterns.forEach(pattern => {
      // Find the series to get tmdbId for Chinese name lookup (case-insensitive)
      const series = this.seriesList?.find(s => s.title.toLowerCase() === pattern.series.toLowerCase());
      const zhName = series?.tmdbId ? this.tmdbCache[series.tmdbId] : null;
      
      // Check match status
      let matchStatus = '';
      let matchIcon = '';
      let fixBtn = '';
      if (!series) {
        // Series not found in Sonarr at all
        matchStatus = 'not-found';
        matchIcon = '<i class="bi bi-exclamation-circle text-danger" title="Sonarr中未找到此系列"></i> ';
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
        <td>${this.escapeHtml(pattern.releasegroup || '-')}</td>
        <td class="text-nowrap">
          ${copyUrlBtn}
          ${sonarrBtn}
          ${fixBtn}
          <button class="btn btn-sm btn-outline-primary btn-edit" data-id="${pattern.id}">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${pattern.id}">
            <i class="bi bi-trash"></i>
          </button>
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

    tbody.querySelectorAll('.btn-copy-url').forEach(btn => {
      btn.addEventListener('click', (e) => this.copyProxyUrlFromRemote(e.currentTarget.dataset.remote));
    });
  }

  async copyProxyUrlFromRemote(remoteUrl) {
    try {
      const url = new URL(remoteUrl);
      const proxyUrl = `${window.location.origin}${url.pathname}${url.search}`;
      await navigator.clipboard.writeText(proxyUrl);
      
      // Show brief feedback
      const toast = document.createElement('div');
      toast.className = 'position-fixed bottom-0 end-0 p-3';
      toast.innerHTML = `<div class="toast show bg-success text-white"><div class="toast-body">已复制代理URL</div></div>`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    } catch (error) {
      alert('复制失败: ' + error.message);
    }
  }

  async fixPatternName(id, correctName) {
    if (!confirm(`确定要将系列名修复为 "${correctName}" 吗？`)) return;
    
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
    } catch (error) {
      alert('修复失败: ' + error.message);
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
    
    if (!confirm(`确定要删除选中的 ${ids.length} 个 Pattern 吗？`)) return;
    
    try {
      for (const id of ids) {
        await this.apiRequest(`/api/patterns/${id}`, { method: 'DELETE' });
      }
      this.loadPatterns();
    } catch (error) {
      alert('批量删除失败: ' + error.message);
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
      alert('选中的项目中没有需要修复名称的 Pattern');
      return;
    }

    if (!confirm(`确定要修复选中的 ${fixable.length} 个 Pattern 的系列名吗？`)) return;

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
      alert(`成功修复 ${successCount} 个 Pattern`);
    } catch (error) {
      alert('批量修复失败: ' + error.message);
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
      this.loadRssPreview();
      
      // Clear input
      document.getElementById('mikan-import').value = '';
    } else {
      alert('无法解析URL，请确保是有效的Mikan RSS或番剧页面URL');
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
    if (!confirm('确定要删除这个 pattern 吗？')) return;

    try {
      await this.apiRequest(`/api/patterns/${id}`, { method: 'DELETE' });
      this.loadPatterns();
    } catch (error) {
      console.error('Failed to delete pattern:', error);
    }
  }

  showPatternEdit(pattern = null) {
    document.getElementById('pattern-list').classList.add('d-none');
    document.getElementById('pattern-edit').classList.remove('d-none');
    
    const form = document.getElementById('pattern-form');
    form.reset();

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
    } catch (error) {
      alert('保存失败: ' + error.message);
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
          const toast = document.createElement('div');
          toast.className = 'position-fixed bottom-0 end-0 p-3';
          toast.innerHTML = `
            <div class="toast show bg-success text-white">
              <div class="toast-body">
                <i class="bi bi-magic"></i> 自动匹配到系列: ${match.title}
              </div>
            </div>`;
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 3000);
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
    alert('Proxy URL 已复制到剪贴板');
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
      
      alert('Patterns 导出成功！');
    } catch (error) {
      console.error('[exportPatterns] Failed:', error);
      alert(`导出失败: ${error.message}`);
    }
  }

  async importPatterns(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.json')) {
      alert('请选择 JSON 文件');
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
        let message = `导入完成！成功导入 ${result.importedCount} 个 patterns，${result.errorCount} 个错误`;
        if (result.mode === 'overwrite') {
          message += '\n\n注意：所有现有数据已被覆盖，ID已重新排序从1开始';
        } else {
          message += '\n\n注意：数据已追加到现有patterns之后';
        }
        
        alert(message);
        
        if (result.errors.length > 0) {
          console.error('Import errors:', result.errors);
          alert('部分 patterns 导入失败，请查看控制台获取详细信息');
        }
        
        this.loadPatterns();
      } else {
        throw new Error(result.message || '导入失败');
      }
      
      // 清空文件输入
      event.target.value = '';
    } catch (error) {
      console.error('[importPatterns] Failed:', error);
      alert(`导入失败: ${error.message}`);
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

    this.renderPatterns(filtered);
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

    const response = await fetch(url, mergedOptions);

    // Check if response is HTML (likely an error page)
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      console.error('[apiRequest] Received HTML instead of JSON:', url, response.status);
      throw new Error('Server returned HTML instead of JSON (likely a server error)');
    }

    return response;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[App] Mikanarr v2.1.0 - Build: 2025-01-14');
  new MikanarrApp();
});
