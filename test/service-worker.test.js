const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function createWorker({ fetchImpl } = {}) {
  const listeners = new Map();
  const entries = new Map();
  const deletedCaches = [];
  let claimCalls = 0;
  const origin = 'https://mikanarr.test';
  const requestUrl = request => typeof request === 'string'
    ? new URL(request, origin).href
    : request.url;
  const cache = {
    async addAll() {},
    async put(request, response) { entries.set(requestUrl(request), response); }
  };
  const caches = {
    async open() { return cache; },
    async match(request) { return entries.get(requestUrl(request)); },
    async keys() { return ['mikanarr-v1', 'mikanarr-shell-v2']; },
    async delete(name) { deletedCaches.push(name); return true; }
  };
  const self = {
    location: { origin },
    clients: { async claim() { claimCalls += 1; } },
    addEventListener(type, listener) { listeners.set(type, listener); }
  };
  const source = readFileSync(require.resolve('../public/sw.js'), 'utf8');
  vm.runInNewContext(source, {
    self,
    caches,
    fetch: fetchImpl || (async () => new Response('ok', { status: 200 })),
    URL,
    Request,
    Response,
    Promise,
    Set
  });

  async function dispatchFetch(path) {
    let responsePromise;
    const request = new Request(new URL(path, origin));
    listeners.get('fetch')({
      request,
      respondWith(promise) { responsePromise = promise; }
    });
    if (responsePromise) await responsePromise;
  }

  async function dispatchActivate() {
    let activation;
    assert.equal(typeof listeners.get('activate'), 'function');
    listeners.get('activate')({ waitUntil(promise) { activation = promise; } });
    await activation;
  }

  return {
    entries,
    deletedCaches,
    claimCalls: () => claimCalls,
    dispatchFetch,
    dispatchActivate
  };
}

test('caches a successful explicit shell asset but never an API request', async () => {
  const worker = createWorker();

  await worker.dispatchFetch('/css/style.css');
  await worker.dispatchFetch('/api/patterns');

  assert.equal(worker.entries.has('https://mikanarr.test/css/style.css'), true);
  assert.equal(worker.entries.has('https://mikanarr.test/api/patterns'), false);
});

test('does not cache an unsuccessful shell response', async () => {
  const worker = createWorker({
    fetchImpl: async () => new Response('failed', { status: 503 })
  });

  await worker.dispatchFetch('/css/style.css');

  assert.equal(worker.entries.size, 0);
});

test('activation removes old caches and claims open clients', async () => {
  const worker = createWorker();

  await worker.dispatchActivate();

  assert.deepEqual(worker.deletedCaches, ['mikanarr-v1']);
  assert.equal(worker.claimCalls(), 1);
});
