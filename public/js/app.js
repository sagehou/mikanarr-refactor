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
    this.checkAuth();
    this.setupEventListeners();
  }

  checkAuth() {
    if (this.token) {
      document.getElementById('login-container').classList.add('d-none');
      document.getElementById('main-container').classList.remove('d-none');
      this.loadPatterns();
      this.loadSeries();
    } else {
      document.getElementById('login-container').classList.remove('d-none');
      document.getElementById('main-container').classList.add('d-none');
    }
  }

setupEventListeners() {
    document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
    document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());
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
      const response = await this.apiRequest('/api/patterns');
      const patterns = await response.json();
      this.renderPatterns(patterns);
    } catch (error) {
      console.error('Failed to load patterns:', error);
    }
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
      
      console.log('[loadSeries] Loaded', series.length, 'series');
      
      this.seriesList = series;
      this.renderSeriesOptions(series);
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
      option.textContent = s.title;
      select.appendChild(option);
    });
    
    console.log('[renderSeriesOptions] Series options added to select element');
  }

  async loadSeasons() {
    const seriesTitle = document.getElementById('series').value;
    const seasonSelect = document.getElementById('season');
    seasonSelect.innerHTML = '<option value="">选择季度...</option>';

    if (!seriesTitle) return;

    const series = this.seriesList.find(s => s.title === seriesTitle);
    if (!series) {
      console.warn('[loadSeasons] Series not found in list:', seriesTitle);
      return;
    }
    
    if (!series.seasons) {
      console.warn('[loadSeasons] Series has no seasons:', seriesTitle);
      return;
    }

    console.log('[loadSeasons] Loading seasons for:', seriesTitle, series.seasons.length, 'seasons');
    
    series.seasons.forEach(season => {
      const option = document.createElement('option');
      option.value = String(season.seasonNumber).padStart(2, '0');
      option.textContent = `S${String(season.seasonNumber).padStart(2, '0')} ${season.monitored ? '' : '(未监控)'}`;
      seasonSelect.appendChild(option);
    });

    await this.loadTmdbInfo(series);
  }

  async loadTmdbInfo(series) {
    const tmdbBox = document.getElementById('tmdb-info-box');

    if (!series?.tmdbId) {
      tmdbBox.classList.add('d-none');
      return;
    }

    try {
      const response = await this.apiRequest(`/tmdb/tv/${series.tmdbId}?language=zh-CN`);

      // Handle 503 - TMDB not configured
      if (response.status === 503) {
        console.warn('[loadTmdbInfo] TMDB not configured, skipping');
        tmdbBox.classList.add('d-none');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[loadTmdbInfo] TMDB request failed:', errorData);
        tmdbBox.classList.add('d-none');
        return;
      }

      const data = await response.json();
      this.renderTmdbInfo(data);
      tmdbBox.classList.remove('d-none');
    } catch (error) {
      console.error('[loadTmdbInfo] Failed to load TMDB info:', error);
      tmdbBox.classList.add('d-none');
    }
  }

  renderTmdbInfo(data) {
    const posterUrl = data.poster_path 
      ? `https://image.tmdb.org/t/p/w200${data.poster_path}`
      : 'https://via.placeholder.com/60x90?text=No+Image';
    
    document.getElementById('tmdb-poster').src = posterUrl;
    document.getElementById('tmdb-title').textContent = data.name || data.original_name;
    document.getElementById('tmdb-overview').textContent = data.overview?.substring(0, 100) + '...' || '';
  }

  renderPatterns(patterns) {
    const tbody = document.getElementById('pattern-table-body');
    tbody.innerHTML = '';
    
    patterns.forEach(pattern => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${pattern.id}</td>
        <td><strong>${this.escapeHtml(pattern.series)}</strong></td>
        <td><span class="badge bg-secondary">S${pattern.season}</span></td>
        <td><span class="badge ${this.getLanguageBadgeClass(pattern.language)}">${this.escapeHtml(pattern.language)}</span></td>
        <td><span class="badge bg-primary">${this.escapeHtml(pattern.quality)}</span></td>
        <td>${this.escapeHtml(pattern.releasegroup || '-')}</td>
        <td>
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
      document.getElementById('season').value = pattern.season;
      document.getElementById('language').value = pattern.language;
      document.getElementById('quality').value = pattern.quality;
      document.getElementById('offset').value = pattern.offset || 0;
      document.getElementById('releasegroup').value = pattern.releasegroup || '';
      
      // Load seasons after setting series value
      this.loadSeasons();
      this.updateProxyUrl();
    } else {
      console.log('[showPatternEdit] Creating new pattern');
      document.getElementById('edit-title').textContent = '新建 Pattern';
      document.getElementById('pattern-id').value = '';
      document.getElementById('language').value = 'Chinese';
      document.getElementById('quality').value = 'WEBDL 1080p';
      document.getElementById('offset').value = '0';
      
      document.getElementById('tmdb-info-box').classList.add('d-none');
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
      
      const response = await this.apiRequest('/api/patterns/import', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        alert(`导入完成！成功导入 ${result.importedCount} 个 patterns，${result.errorCount} 个错误`);
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

  filterPatterns(query) {
    const rows = document.querySelectorAll('#pattern-table-body tr');
    const lowerQuery = query.toLowerCase();

    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(lowerQuery) ? '' : 'none';
    });
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
