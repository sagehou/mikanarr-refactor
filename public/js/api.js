(function exposeApi(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MikanarrApi = api;
}(typeof window !== 'undefined' ? window : null, () => {
  function createClient({ fetchImpl, onUnauthorized = () => {} } = {}) {
    const fetchRequest = fetchImpl || globalThis.fetch;
    let unauthorizedHandler = null;

    async function request(url, options = {}) {
      const { skipUnauthorized = false, ...fetchOptions } = options;
      const headers = new Headers(fetchOptions.headers || {});
      headers.delete('Authorization');
      if (typeof fetchOptions.body === 'string' && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      const response = await fetchRequest(url, {
        ...fetchOptions,
        credentials: 'same-origin',
        headers
      });

      if (response.ok) return response;

      let payload = {};
      try {
        payload = await response.json();
      } catch (_) {
        payload = {};
      }

      if (response.status === 401 && !skipUnauthorized) {
        if (!unauthorizedHandler) {
          const current = Promise.resolve().then(onUnauthorized);
          const handled = current.finally(() => {
            if (unauthorizedHandler === handled) unauthorizedHandler = null;
          });
          unauthorizedHandler = handled;
        }
        await unauthorizedHandler;
      }

      const error = new Error(payload.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.code = payload.code;
      throw error;
    }

    async function readJson(url, options) {
      const response = await request(url, options);
      return response.status === 204 ? null : response.json();
    }

    return {
      request,
      session: () => readJson('/auth/session', { method: 'GET', skipUnauthorized: true }),
      login: credentials => readJson('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
        skipUnauthorized: true
      }),
      logout: () => readJson('/auth/logout', { method: 'POST' })
    };
  }

  return { createClient };
}));
