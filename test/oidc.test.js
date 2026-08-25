const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppFixture, CookieJar } = require('./helpers/fixtures');

const temporaryNames = ['oidc_state', 'oidc_nonce', 'oidc_verifier'];

function fakeProvider(claims = { sub: 'subject' }, capture) {
  return {
    async authorizationRequest() {
      return { url: new URL('http://identity.example/authorize'), state: 'state-value', nonce: 'nonce-value', verifier: 'verifier-value' };
    },
    async exchange(currentUrl, checks) {
      if (capture) {
        capture.currentUrl = currentUrl;
        capture.checks = checks;
      }
      return claims;
    }
  };
}

async function startOidc(fixture) {
  const response = await fetch(`${fixture.baseUrl}/auth/oidc/login`, { redirect: 'manual' });
  const jar = new CookieJar();
  jar.set(response);
  return { response, jar };
}

function assertTemporaryCookiesCleared(response) {
  const cookies = response.headers.getSetCookie();
  for (const name of temporaryNames) {
    assert.ok(cookies.some(cookie => cookie.startsWith(`${name}=;`) && /Expires=Thu, 01 Jan 1970/i.test(cookie)), `${name} cleared`);
  }
}

test('OIDC login stores PKCE state in ten-minute HttpOnly Lax cookies', async t => {
  const fixture = await createAppFixture({ oidcOnly: true, oidcProvider: fakeProvider() });
  t.after(fixture.close);
  const { response } = await startOidc(fixture);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'http://identity.example/authorize');
  const cookies = response.headers.getSetCookie();
  for (const name of temporaryNames) {
    const cookie = cookies.find(value => value.startsWith(`${name}=`));
    assert.match(cookie, /Max-Age=600/i, name);
    assert.match(cookie, /HttpOnly/i, name);
    assert.match(cookie, /SameSite=Lax/i, name);
  }
});

test('OIDC routes fail closed when OIDC is not configured', async t => {
  const fixture = await createAppFixture();
  t.after(fixture.close);
  const response = await fetch(`${fixture.baseUrl}/auth/oidc/login`, { redirect: 'manual' });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'OIDC authentication is not available', code: 'OIDC_DISABLED' });
});

test('callback without every temporary cookie returns fixed text and clears cookies', async t => {
  const fixture = await createAppFixture({ oidcOnly: true, oidcProvider: fakeProvider() });
  t.after(fixture.close);
  const response = await fetch(`${fixture.baseUrl}/auth/oidc/callback?code=code&state=state-value`, {
    headers: { cookie: 'oidc_state=state-value; oidc_nonce=nonce-value' }
  });
  assert.equal(response.status, 400);
  assert.match(response.headers.get('content-type'), /^text\/plain/i);
  assert.equal(await response.text(), 'OIDC authentication failed');
  assertTemporaryCookiesCleared(response);
});

test('callback error payload is never reflected and clears temporary cookies', async t => {
  const fixture = await createAppFixture({ oidcOnly: true, oidcProvider: fakeProvider() });
  t.after(fixture.close);
  const { jar } = await startOidc(fixture);
  const response = await fetch(`${fixture.baseUrl}/auth/oidc/callback?error=attacker-secret`, { headers: { cookie: jar.header() } });
  assert.equal(response.status, 400);
  assert.match(response.headers.get('content-type'), /^text\/plain/i);
  assert.equal(await response.text(), 'OIDC authentication failed');
  assertTemporaryCookiesCleared(response);
});

test('callback rejects mismatched state before issuing a session', async t => {
  const fixture = await createAppFixture({ oidcOnly: true, oidcProvider: fakeProvider() });
  t.after(fixture.close);
  const { jar } = await startOidc(fixture);
  const response = await fetch(`${fixture.baseUrl}/auth/oidc/callback?code=code&state=wrong`, { headers: { cookie: jar.header() }, redirect: 'manual' });
  assert.equal(response.status, 400);
  assert.equal(response.headers.getSetCookie().some(cookie => cookie.startsWith('mikanarr_session=')), false);
  assertTemporaryCookiesCleared(response);
});

test('callback forwards its URL and every temporary check to the provider', async t => {
  const capture = {};
  const fixture = await createAppFixture({ oidcOnly: true, oidcProvider: fakeProvider({ sub: 'subject' }, capture) });
  t.after(fixture.close);
  const { jar } = await startOidc(fixture);
  const response = await fetch(`${fixture.baseUrl}/auth/oidc/callback?code=code&state=state-value`, {
    headers: { cookie: jar.header() }, redirect: 'manual'
  });
  assert.equal(response.status, 302);
  assert.equal(String(capture.currentUrl), 'http://localhost:12306/auth/oidc/callback?code=code&state=state-value');
  assert.deepEqual(capture.checks, {
    state: 'state-value', nonce: 'nonce-value', verifier: 'verifier-value'
  });
});

test('unauthorized OIDC claims return 403 without a session', async t => {
  const fixture = await createAppFixture({ oidcOnly: true, oidcProvider: fakeProvider({ sub: 'mallory', groups: ['guests'] }) });
  t.after(fixture.close);
  const { jar } = await startOidc(fixture);
  const response = await fetch(`${fixture.baseUrl}/auth/oidc/callback?code=code&state=state-value`, { headers: { cookie: jar.header() }, redirect: 'manual' });
  assert.equal(response.status, 403);
  assert.equal(await response.text(), 'OIDC authentication failed');
  assert.equal(response.headers.getSetCookie().some(cookie => cookie.startsWith('mikanarr_session=')), false);
  assertTemporaryCookiesCleared(response);
});

test('an allowed OIDC subject receives a cookie session and redirect', async t => {
  const fixture = await createAppFixture({ oidcOnly: true, oidcProvider: fakeProvider({ sub: 'subject', preferred_username: 'alice' }) });
  t.after(fixture.close);
  const { jar } = await startOidc(fixture);
  const response = await fetch(`${fixture.baseUrl}/auth/oidc/callback?code=code&state=state-value`, { headers: { cookie: jar.header() }, redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/');
  assert.match(response.headers.getSetCookie().find(cookie => cookie.startsWith('mikanarr_session=')), /HttpOnly.*SameSite=Strict/i);
  assertTemporaryCookiesCleared(response);
});

test('the configured OIDC group claim can authorize a session', async t => {
  const fixture = await createAppFixture({
    oidcOnly: true,
    env: { OIDC_ALLOWED_SUBJECTS: '', OIDC_REQUIRED_GROUP: 'admins', OIDC_GROUPS_CLAIM: 'roles' },
    oidcProvider: fakeProvider({ sub: 'group-member', roles: ['admins'] })
  });
  t.after(fixture.close);
  const { jar } = await startOidc(fixture);
  const response = await fetch(`${fixture.baseUrl}/auth/oidc/callback?code=code&state=state-value`, { headers: { cookie: jar.header() }, redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.ok(response.headers.getSetCookie().some(cookie => cookie.startsWith('mikanarr_session=')));
  assertTemporaryCookiesCleared(response);
});

test('provider exchange errors use fixed text and clear temporary cookies', async t => {
  const provider = fakeProvider();
  provider.exchange = async () => { throw new Error('provider-secret'); };
  const messages = [];
  const logger = { log() {}, warn() {}, error(...parts) { messages.push(parts.join(' ')); } };
  const fixture = await createAppFixture({ oidcOnly: true, oidcProvider: provider, logger });
  t.after(fixture.close);
  const { jar } = await startOidc(fixture);
  const response = await fetch(`${fixture.baseUrl}/auth/oidc/callback?code=code&state=state-value`, { headers: { cookie: jar.header() } });
  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'OIDC authentication failed');
  assertTemporaryCookiesCleared(response);
  assert.equal(messages.some(message => message.includes('provider-secret')), false);
});

test('failed OIDC discovery is retried and a successful provider is reused', async t => {
  let attempts = 0;
  const discoveredProvider = fakeProvider();
  const fixture = await createAppFixture({
    oidcOnly: true,
    oidcProviderFactory: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary discovery failure');
      return discoveredProvider;
    }
  });
  t.after(fixture.close);

  assert.equal((await fetch(`${fixture.baseUrl}/auth/oidc/login`, { redirect: 'manual' })).status, 500);
  assert.equal((await fetch(`${fixture.baseUrl}/auth/oidc/login`, { redirect: 'manual' })).status, 302);
  assert.equal((await fetch(`${fixture.baseUrl}/auth/oidc/login`, { redirect: 'manual' })).status, 302);
  assert.equal(attempts, 2);
});

test('OIDC authorization allows only configured subjects or groups', () => {
  const { isOidcAuthorized } = require('../server/oidc');
  const config = { allowedSubjects: ['alice'], requiredGroup: 'admins', groupsClaim: 'roles' };
  assert.equal(isOidcAuthorized({ sub: 'alice', roles: [] }, config), true);
  assert.equal(isOidcAuthorized({ sub: 'bob', roles: ['admins'] }, config), true);
  assert.equal(isOidcAuthorized({ sub: 'bob', roles: 'admins' }, config), false);
  assert.equal(isOidcAuthorized({ sub: 'bob', roles: ['guests'] }, config), false);
  assert.equal(isOidcAuthorized({}, config), false);
});

test('OIDC wrapper passes every callback check to the authorization code grant', async () => {
  const capture = {};
  const discovered = { marker: 'configuration' };
  const client = {
    async discovery(issuer, clientId, clientSecret) {
      capture.discovery = { issuer: String(issuer), clientId, clientSecret };
      return discovered;
    },
    async authorizationCodeGrant(configuration, currentUrl, options) {
      capture.grant = { configuration, currentUrl: String(currentUrl), options };
      return { claims() { return { sub: 'subject' }; } };
    }
  };
  const { createOidcProvider } = require('../server/oidc');
  const provider = await createOidcProvider({
    issuer: 'https://identity.example', clientId: 'client-id', clientSecret: 'client-secret',
    redirectUri: 'https://app.example/auth/oidc/callback'
  }, Promise.resolve(client));
  const claims = await provider.exchange(
    new URL('https://app.example/auth/oidc/callback?code=code&state=state-value'),
    { state: 'state-value', nonce: 'nonce-value', verifier: 'verifier-value' }
  );
  assert.deepEqual(claims, { sub: 'subject' });
  assert.deepEqual(capture.discovery, {
    issuer: 'https://identity.example/', clientId: 'client-id', clientSecret: 'client-secret'
  });
  assert.deepEqual(capture.grant, {
    configuration: discovered,
    currentUrl: 'https://app.example/auth/oidc/callback?code=code&state=state-value',
    options: {
      pkceCodeVerifier: 'verifier-value',
      expectedState: 'state-value',
      expectedNonce: 'nonce-value',
      idTokenExpected: true
    }
  });
});

test('OIDC wrapper enables insecure requests only for approved localhost HTTP config', async () => {
  const calls = [];
  const allowInsecureRequests = () => {};
  const client = {
    allowInsecureRequests,
    async discovery(...args) {
      calls.push(args);
      return { marker: 'configuration' };
    }
  };
  const { createOidcProvider } = require('../server/oidc');
  await createOidcProvider({
    issuer: 'http://localhost:8080/', clientId: 'client-id', clientSecret: 'client-secret',
    redirectUri: 'http://localhost:12306/auth/oidc/callback', allowInsecureRequests: true
  }, Promise.resolve(client));
  await createOidcProvider({
    issuer: 'https://identity.example/', clientId: 'client-id', clientSecret: 'client-secret',
    redirectUri: 'https://app.example/auth/oidc/callback', allowInsecureRequests: false
  }, Promise.resolve(client));

  assert.deepEqual(calls[0].slice(3), [undefined, { execute: [allowInsecureRequests] }]);
  assert.deepEqual(calls[1].slice(3), []);
});
