const test = require('node:test');
const assert = require('node:assert/strict');

const { createClient } = require('../public/js/api');

test('uses Cookie credentials and throws parsed non-2xx errors', async () => {
  const calls = [];
  const client = createClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ error: 'bad input', code: 'INVALID_PATTERN' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    },
    onUnauthorized() {}
  });

  await assert.rejects(
    () => client.request('/api/patterns', {
      method: 'POST',
      headers: { Authorization: 'Bearer stale-browser-token' }
    }),
    error => error.message === 'bad input' && error.status === 400 && error.code === 'INVALID_PATTERN'
  );
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.headers.has('authorization'), false);
});

test('retains response status for valid non-object JSON error bodies', async () => {
  for (const body of ['null', '"upstream text"', '[]']) {
    const client = createClient({
      fetchImpl: async () => new Response(body, {
        status: 502,
        headers: { 'content-type': 'application/json' }
      })
    });
    await assert.rejects(
      () => client.request('/api/patterns'),
      error => error.message === 'Request failed (502)' && error.status === 502 && error.code === undefined,
      body
    );
  }
});

test('session, login, and logout use the Cookie auth endpoints', async () => {
  const calls = [];
  const client = createClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ authenticated: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    },
    onUnauthorized() {}
  });

  await client.session();
  await client.login({ username: 'user', password: 'password' });
  await client.logout();

  assert.deepEqual(calls.map(call => [call.url, call.options.method]), [
    ['/auth/session', 'GET'],
    ['/auth/login', 'POST'],
    ['/auth/logout', 'POST']
  ]);
  assert.deepEqual(JSON.parse(calls[1].options.body), { username: 'user', password: 'password' });
});

test('coalesces concurrent unauthorized handling', async () => {
  let unauthorizedCalls = 0;
  let releaseUnauthorized;
  const unauthorizedFinished = new Promise(resolve => { releaseUnauthorized = resolve; });
  const client = createClient({
    fetchImpl: async () => new Response(JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    }),
    onUnauthorized: async () => {
      unauthorizedCalls += 1;
      await unauthorizedFinished;
    }
  });

  const first = client.request('/api/patterns');
  const second = client.request('/api/config');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(unauthorizedCalls, 1);
  releaseUnauthorized();
  await assert.rejects(first, error => error.status === 401);
  await assert.rejects(second, error => error.status === 401);
});

test('handles a later unauthorized response after the first handler finishes', async () => {
  let unauthorizedCalls = 0;
  const client = createClient({
    fetchImpl: async () => new Response(null, { status: 401 }),
    onUnauthorized: () => { unauthorizedCalls += 1; }
  });

  await assert.rejects(() => client.request('/api/patterns'), error => error.status === 401);
  await assert.rejects(() => client.request('/api/config'), error => error.status === 401);

  assert.equal(unauthorizedCalls, 2);
});

test('defaults body requests to JSON without adding an Authorization header', async () => {
  let requestOptions;
  const client = createClient({
    fetchImpl: async (url, options) => {
      requestOptions = options;
      return new Response(null, { status: 204 });
    }
  });

  await client.request('/api/patterns', {
    method: 'POST',
    body: JSON.stringify({ series: 'Example' })
  });

  assert.equal(requestOptions.headers.get('content-type'), 'application/json');
  assert.equal(requestOptions.headers.has('authorization'), false);
});

test('login and session probes do not run the expired-session handler', async () => {
  let unauthorizedCalls = 0;
  const client = createClient({
    fetchImpl: async () => new Response(JSON.stringify({ error: 'invalid', code: 'INVALID_CREDENTIALS' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    }),
    onUnauthorized: () => { unauthorizedCalls += 1; }
  });

  await assert.rejects(() => client.login({ username: 'user', password: 'bad' }), error => error.status === 401);
  await assert.rejects(() => client.session(), error => error.status === 401);

  assert.equal(unauthorizedCalls, 0);
});
