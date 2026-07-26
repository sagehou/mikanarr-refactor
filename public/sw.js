const CACHE_NAME = 'mikanarr-shell-v2';
const SHELL_ASSETS = new Set([
  '/',
  '/index.html',
  '/css/style.css',
  '/js/ui.js',
  '/js/api.js',
  '/js/app.js',
  '/images/icon.svg',
  '/manifest.json'
]);

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.all(Array.from(SHELL_ASSETS, async asset => {
      const response = await fetch(asset);
      if (response.ok) await cache.put(asset, response);
    })))
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.search || !SHELL_ASSETS.has(url.pathname)) return;

  e.respondWith(
    fetch(e.request)
      .then(async response => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(e.request, response.clone());
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith('mikanarr-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
