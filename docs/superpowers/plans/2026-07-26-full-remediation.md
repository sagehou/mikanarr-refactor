# Mikanarr Full Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the existing Express, SQLite, and vanilla JavaScript product while fixing every confirmed security, data-integrity, correctness, performance, deployment, CI, and documentation defect in the approved design.

**Architecture:** Keep the monolith and split only boundaries that need independent testing: immutable configuration, an application factory, a database factory, OIDC adapter, Pattern validator, outbound URL policy, and two browser helpers. Existing route files become dependency-injected router factories so `node:test` can exercise real Express behavior with temporary SQLite databases and controlled upstreams.

**Tech Stack:** Node.js 22.23.1, CommonJS, Express 5, better-sqlite3, vanilla browser JavaScript, Bootstrap 5.3.8, `node:test`, jsdom 29.1.1, openid-client 6.8.4, safe-regex2 5.1.1, yaml 2.9.0.

## Global Constraints

- Preserve Express, SQLite, Bootstrap, and vanilla JavaScript; do not introduce a frontend framework, TypeScript, an ORM, or a second service.
- Every behavior change follows RED → GREEN → REFACTOR; record the failing command and expected failure before production edits.
- Use Node's built-in `node:test`; do not add Jest, Mocha, Vitest, or Supertest.
- Local auth requires both non-empty admin variables. OIDC requires complete issuer configuration and an explicit subject or group rule. At least one auth mode is required.
- Browser auth uses the `mikanarr_session` HttpOnly cookie. Never expose JWTs to browser JavaScript or accept JWTs in query parameters.
- API errors use `{ "error": string, "code": string }`; production 500s never expose internal or upstream bodies.
- Never log JWTs, cookies, Sonarr API keys, OIDC secrets, or URL query strings.
- Table DDL lives only in `server/database.js`; overwrite import is one transaction and never drops a table.
- Mikan URLs require HTTPS, exact hostname `mikanani.me`, no credentials, and no non-default port. Revalidate every redirect and cap redirects at 3.
- Use Axios 1.18.1, http-proxy-middleware 3.0.7, better-sqlite3 12.11.1, openid-client 6.8.4, safe-regex2 5.1.1, jsdom 29.1.1, and yaml 2.9.0.
- Keep the existing RSS output title format byte-for-byte equivalent for the same Pattern and source title.
- Each task ends with focused tests, `npm run check`, self-review, and one commit.

## File Responsibility Map

- `server/config.js`: parse and validate environment once; return immutable configuration.
- `server/app.js`: assemble Express middleware and router factories without listening.
- `server/index.js`: load dependencies, listen, and handle shutdown only as the entry point.
- `server/database.js`: own schema, migrations, CRUD, transactions, cache, health query, and connection lifetime.
- `server/session.js`: Cookie parsing/options, JWT keys, signing/verification, and same-origin guard.
- `server/oidc.js`: dynamic import of openid-client and issuer-discovery adapter.
- `server/patternValidation.js`: normalize/validate Pattern input and positive IDs.
- `server/urlPolicy.js`: validate initial URLs and redirect destinations; provide bounded Axios options.
- `server/routes/*.js`: router factories containing HTTP behavior only.
- `public/js/api.js`: browser API client with Cookie credentials and non-2xx handling.
- `public/js/ui.js`: safe Toast/ConfirmDialog DOM builders.
- `public/js/app.js`: feature orchestration consuming the two browser helpers.
- `test/helpers/*.js`: temporary database, Express listener, Cookie jar, and upstream fixtures.
- `test/*.test.js`: behavior-focused unit and integration regressions.

---

### Task 1: Test Harness, Configuration, Application Factory, and Database Foundation

**Files:**
- Create: `server/config.js`
- Create: `server/app.js`
- Create: `test/helpers/http.js`
- Create: `test/helpers/fixtures.js`
- Create: `test/config.test.js`
- Create: `test/database.test.js`
- Create: `test/app.test.js`
- Modify: `server/index.js`
- Modify: `server/database.js`
- Modify: `server/routes/auth.js`
- Modify: `server/routes/patterns.js`
- Modify: `server/routes/proxy.js`
- Modify: `server/routes/imageProxy.js`
- Modify: `server/routes/rss.js`
- Modify: `server/routes/sonarr.js`
- Modify: `server/routes/tmdb.js`
- Modify: `package.json`

**Interfaces:**
- Produces `loadConfig(env): Readonly<Config>` and `ConfigError` with `code`.
- Produces `createDatabase({ dataDir }): DatabaseApi`; the API owns `close()` and `healthCheck()`.
- Produces `createApp({ config, database, oidcProvider, httpClient, logger }): Express`.
- Produces `start({ env, logger } = {}): Promise<{ app, server, database }>`; `PORT=0` is valid for isolated tests.
- Every route exports `createXRouter(dependencies)` instead of a singleton.
- Produces `listen(app): Promise<{ server, baseUrl }>` for tests.
- Produces `createAppFixture`, `createTestDatabase`, `validPattern`, `login`, and a small Cookie jar in `test/helpers/fixtures.js`.

- [ ] **Step 1: Write configuration tests before the module exists**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, ConfigError } = require('../server/config');

test('rejects startup when neither auth mode is configured', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'test', DATA_DIR: '/tmp/mikanarr-test' }),
    error => error instanceof ConfigError && error.code === 'AUTH_NOT_CONFIGURED'
  );
});

test('enables local auth only with both credentials', () => {
  const config = loadConfig({
    NODE_ENV: 'test', DATA_DIR: '/tmp/mikanarr-test',
    ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'secret'
  });
  assert.equal(config.auth.local.enabled, true);
  assert.equal(config.auth.oidc.enabled, false);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/config.test.js`  
Expected: FAIL with `Cannot find module '../server/config'`.

- [ ] **Step 3: Implement immutable configuration**

```js
const path = require('node:path');

class ConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ConfigError';
    this.code = code;
  }
}

function csv(value) {
  return Object.freeze((value || '').split(',').map(item => item.trim()).filter(Boolean));
}

function integer(env, key, fallback, min, max) {
  const value = env[key] === undefined ? fallback : Number(env[key]);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ConfigError('INVALID_CONFIG', `${key} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function boolean(env, key, fallback) {
  if (env[key] === undefined) return fallback;
  if (env[key] === 'true') return true;
  if (env[key] === 'false') return false;
  throw new ConfigError('INVALID_CONFIG', `${key} must be true or false`);
}

function loadConfig(env = process.env) {
  const username = env.ADMIN_USERNAME?.trim() || '';
  const password = env.ADMIN_PASSWORD || '';
  const localEnabled = Boolean(username && password);
  const oidcTuple = [env.OIDC_ISSUER, env.OIDC_CLIENT_ID,
    env.OIDC_CLIENT_SECRET, env.OIDC_REDIRECT_URI];
  const oidcAny = oidcTuple.some(Boolean);
  const oidcComplete = oidcTuple.every(value => typeof value === 'string' && value.trim());
  const allowedSubjects = csv(env.OIDC_ALLOWED_SUBJECTS);
  const requiredGroup = env.OIDC_REQUIRED_GROUP?.trim() || '';

  if (!env.OIDC_ISSUER && (env.OIDC_AUTH_URL || env.OIDC_TOKEN_URL)) {
    throw new ConfigError('OIDC_LEGACY_CONFIG', 'Replace OIDC_AUTH_URL/OIDC_TOKEN_URL with OIDC_ISSUER');
  }
  if (oidcAny && !oidcComplete) {
    throw new ConfigError('OIDC_INCOMPLETE', 'OIDC issuer, client, secret, and redirect URI are all required');
  }
  if (oidcComplete && allowedSubjects.length === 0 && !requiredGroup) {
    throw new ConfigError('OIDC_AUTHORIZATION_REQUIRED', 'Configure allowed OIDC subjects or group');
  }
  if (!localEnabled && !oidcComplete) {
    throw new ConfigError('AUTH_NOT_CONFIGURED', 'Configure local auth or OIDC');
  }

  const nodeEnv = env.NODE_ENV || 'production';
  return Object.freeze({
    nodeEnv,
    port: integer(env, 'PORT', 12306, 0, 65535),
    dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, '../data')),
    cookieSecure: boolean(env, 'COOKIE_SECURE', nodeEnv === 'production'),
    http: Object.freeze({
      timeoutMs: integer(env, 'HTTP_TIMEOUT_MS', 15000, 1000, 60000),
      maxXmlBytes: integer(env, 'MAX_XML_BYTES', 5242880, 1024, 20971520),
      maxImageBytes: integer(env, 'MAX_IMAGE_BYTES', 10485760, 1024, 52428800)
    }),
    auth: Object.freeze({
      local: Object.freeze({ enabled: localEnabled, username, password }),
      oidc: Object.freeze({
        enabled: oidcComplete,
        issuer: env.OIDC_ISSUER || '', clientId: env.OIDC_CLIENT_ID || '',
        clientSecret: env.OIDC_CLIENT_SECRET || '', redirectUri: env.OIDC_REDIRECT_URI || '',
        autoLogin: boolean(env, 'OIDC_AUTO_LOGIN', false),
        allowedSubjects, requiredGroup,
        groupsClaim: env.OIDC_GROUPS_CLAIM?.trim() || 'groups'
      })
    }),
    sonarr: Object.freeze({
      host: env.SONARR_HOST || '', publicUrl: env.SONARR_PUBLIC_URL || '',
      apiKey: env.SONARR_API_KEY || '',
      tlsInsecure: boolean(env, 'SONARR_TLS_INSECURE', false)
    }),
    tmdb: Object.freeze({
      apiKey: env.TMDB_API_KEY || '', timeoutMs: 5000,
      cacheTtlMs: 2592000000, negativeTtlMs: 3600000, concurrency: 4
    })
  });
}
```

Freeze nested arrays/objects before returning so callers cannot mutate security policy. Normalize `SONARR_HOST`, `SONARR_PUBLIC_URL`, `OIDC_ISSUER`, and `OIDC_REDIRECT_URI` with WHATWG URL; reject non-HTTP(S) schemes, require HTTPS for OIDC outside test/development localhost, and strip trailing slashes where route composition requires it.

- [ ] **Step 4: Write database factory tests and verify RED**

```js
test('creates the data directory and complete Pattern schema', t => {
  const dataDir = join(tmpdir(), `mikanarr-${randomUUID()}`);
  const db = createDatabase({ dataDir });
  t.after(() => db.close());
  assert.equal(existsSync(join(dataDir, 'database.sqlite')), true);
  assert.deepEqual(
    db.raw.pragma('table_info(patterns)').map(column => column.name),
    ['id', 'remote', 'pattern', 'series', 'season', 'language', 'quality',
      'offset', 'releasegroup', 'created_at', 'last_matched_at', 'match_count']
  );
});
```

Run: `node --test test/database.test.js`  
Expected: FAIL because `createDatabase` is not exported.

- [ ] **Step 5: Convert the database singleton to a factory**

Create the directory before SQLite, fail on migration errors, prepare reusable statements once, expose `raw` only for migration tests, and make `close()` idempotent. Preserve CRUD behavior in this task.

- [ ] **Step 6: Write the application-factory test and verify RED**

```js
test('serves static HTML and database health without listening on import', async t => {
  const fixture = await createAppFixture();
  t.after(fixture.close);
  assert.equal((await fetch(`${fixture.baseUrl}/`)).status, 200);
  const health = await fetch(`${fixture.baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', database: 'ok' });
});
```

Run: `node --test test/app.test.js`  
Expected: FAIL because `server/app.js` and the fixture are absent.

- [ ] **Step 7: Implement `createApp` and route factories**

Preserve ordering: Sonarr/streaming proxies, `express.json({ limit: '256kb' })`, security/static/API/catch-all/error handler. Add `/api/health`. `server/index.js` invokes `start()` only under `if (require.main === module)` and exports `start`.

- [ ] **Step 8: Add scripts and verify GREEN**

```json
"scripts": {
  "start": "node server/index.js",
  "dev": "nodemon server/index.js",
  "test": "node --test --test-concurrency=1 test/*.test.js",
  "check:syntax": "node --check server/*.js && node --check server/routes/*.js && node --check public/js/*.js && node --check public/sw.js",
  "check": "npm run check:syntax && npm test"
}
```

Run: `npm run check`  
Expected: PASS with Task 1 tests and no listener created by imports.

- [ ] **Step 9: Commit**

```bash
git add package.json server test
git commit -m "test: establish isolated application foundation"
```

---

### Task 2: Fail-Closed Local Authentication, Cookie Sessions, and OIDC

**Files:**
- Create: `server/session.js`
- Create: `server/oidc.js`
- Create: `test/auth.test.js`
- Create: `test/oidc.test.js`
- Modify: `server/routes/auth.js`
- Modify: `server/app.js`
- Modify: `server/config.js`
- Modify: `test/helpers/fixtures.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces `createSessionManager({ config, clock })` with `issue`, `verifyRequest`, `clear`, and temporary Cookie options.
- Produces `createOidcProvider(config.auth.oidc)` with `authorizationRequest()` and `exchange(currentUrl, checks)`.
- Produces `isOidcAuthorized(claims, oidcConfig): boolean`.
- `/auth/login` returns `{ user: { username } }`, sets `mikanarr_session`, and never returns a token.
- Adds `GET /auth/session` and `POST /auth/logout`.

- [ ] **Step 1: Write authentication regressions**

```js
test('empty JSON never authenticates when local auth is disabled', async t => {
  const fixture = await createAppFixture({ oidcOnly: true });
  t.after(fixture.close);
  const response = await fetch(`${fixture.baseUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(response.status, 404);
  assert.equal(response.headers.has('set-cookie'), false);
});

test('login stores JWT only in an HttpOnly SameSite cookie', async t => {
  const fixture = await createAppFixture();
  t.after(fixture.close);
  const response = await login(fixture, 'admin', 'secret');
  assert.equal(response.status, 200);
  assert.equal('token' in await response.json(), false);
  assert.match(response.headers.get('set-cookie'), /mikanarr_session=.*HttpOnly.*SameSite=Strict/i);
});
```

Also test session lookup, logout, rejection of query-token auth, cross-site mutation rejection, sixth failed login returning 429, and success resetting the counter.

- [ ] **Step 2: Verify RED**

Run: `node --test test/auth.test.js`  
Expected: FAIL because login returns a JSON token and session/logout are absent.

- [ ] **Step 3: Implement session security**

Use `res.cookie`/`res.clearCookie` and an exact Cookie parser without cookie-parser. Create the private key with mode `0600`, chmod existing keys to `0600`, and public key to `0644`. Compare equal-length credential Buffers with `timingSafeEqual`. Rate-limit per `req.ip`: five failures per 15 minutes with injected clock. Remove the `cors` dependency/middleware and reject explicit cross-site mutation headers on login, logout, and every protected POST/PUT/DELETE route.

- [ ] **Step 4: Install and wrap openid-client**

Run: `npm install --save-exact openid-client@6.8.4`

```js
const oidcModule = import('openid-client');

async function createOidcProvider(config) {
  const client = await oidcModule;
  const discovered = await client.discovery(
    new URL(config.issuer), config.clientId, config.clientSecret
  );
  return {
    async authorizationRequest() {
      const verifier = client.randomPKCECodeVerifier();
      const challenge = await client.calculatePKCECodeChallenge(verifier);
      const state = client.randomState();
      const nonce = client.randomNonce();
      const url = client.buildAuthorizationUrl(discovered, {
        redirect_uri: config.redirectUri, scope: 'openid profile email groups',
        code_challenge: challenge, code_challenge_method: 'S256', state, nonce
      });
      return { url, state, nonce, verifier };
    },
    async exchange(currentUrl, checks) {
      const tokens = await client.authorizationCodeGrant(discovered, currentUrl, {
        pkceCodeVerifier: checks.verifier,
        expectedState: checks.state,
        expectedNonce: checks.nonce,
        idTokenExpected: true
      });
      return tokens.claims();
    }
  };
}
```

- [ ] **Step 5: Write OIDC boundary tests and verify RED**

Inject a fake only at the external provider boundary. Assert callback without all temporary cookies returns 400; an error payload returns fixed `text/plain` without the payload; unauthorized claims return 403/no session; authorized subject or group sets the session and redirects; temporary cookies clear on every outcome.

Run: `node --test test/oidc.test.js`  
Expected: FAIL because callback trusts token exchange and returns HTML.

- [ ] **Step 6: Implement OIDC routes and authorization**

Store `oidc_state`, `oidc_nonce`, and `oidc_verifier` in 10-minute HttpOnly SameSite=Lax cookies. Authorize only when `sub` is allowed or the configured groups claim contains the required group. Always clear temporary cookies.

- [ ] **Step 7: Verify GREEN and mutation coverage**

Run: `node --test test/auth.test.js test/oidc.test.js && npm run check`  
Expected: PASS. Mutating the missing-config gate, HttpOnly flag, state check, or claim rule must fail a test.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json server test
git commit -m "fix: harden authentication and OIDC sessions"
```

---

### Task 3: Pattern Validation, Transactional Import, Route Correctness, and RSS Accounting

**Files:**
- Create: `server/patternValidation.js`
- Create: `test/pattern-validation.test.js`
- Create: `test/pattern-routes.test.js`
- Create: `test/rss.test.js`
- Modify: `server/database.js`
- Modify: `server/routes/patterns.js`
- Modify: `server/routes/rss.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces `validatePattern(input): NormalizedPattern` and `parsePositiveId(value): number`.
- Adds `overwritePatterns(patterns)` and `incrementMatchCounts(Map<number, number>)` to the database API.
- Keeps exact title output `[${releasegroup}] ${series} - S${season}E${episode} - ${language} - ${quality}`.

- [ ] **Step 1: Install safe-regex and write validator tests**

Run: `npm install --save-exact safe-regex2@5.1.1`

Use literal cases for a valid anime pattern, missing `episode` group, invalid syntax, nested-quantifier ReDoS, Mikan userinfo, prefix-host attack, non-integer offset, oversized fields, and body metadata stripping.

```js
test('normalizes input and removes client-owned metadata', () => {
  const result = validatePattern({
    id: 99, created_at: 'forged', match_count: 900,
    remote: 'https://mikanani.me/RSS/Bangumi?bangumiId=1',
    pattern: '\\[Group\\] Show - (?<episode>\\d+)',
    series: 'Show', season: '1', language: 'Chinese',
    quality: 'WEBDL 1080p', offset: 0, releasegroup: 'Group'
  });
  assert.equal('id' in result, false);
  assert.equal('created_at' in result, false);
  assert.equal(result.series, 'Show');
});
```

- [ ] **Step 2: Verify RED, then implement validation**

Run: `node --test test/pattern-validation.test.js`  
Expected: FAIL because the module is absent.

Use maxima: pattern 1000, series 200, season 8, remote 2048, language/quality/releasegroup 100 characters, offset -100000..100000. Compile the RegExp, require a named `episode` group in the source, call safe-regex2, and return only insertable columns.

- [ ] **Step 3: Write transaction tests and verify RED**

```js
test('overwrite retains schema and rolls back every row on failure', t => {
  const db = createTestDatabase(t);
  db.createPattern(validPattern({ series: 'Original' }));
  assert.throws(() => db.overwritePatterns([
    validPattern({ series: 'Replacement' }),
    { ...validPattern(), series: null }
  ]));
  assert.deepEqual(db.getPatterns().map(row => row.series), ['Original']);
  assert.equal(db.raw.pragma('table_info(patterns)').some(c => c.name === 'match_count'), true);
});
```

Run: `node --test test/database.test.js`  
Expected: FAIL because `overwritePatterns` is absent.

- [ ] **Step 4: Implement transactional database operations**

Use one prepared insert inside `db.transaction(patterns => { DELETE; reset sqlite_sequence; insert all; })`. Use `{ ...data, id }` in update, return delete `changes`, and prepare `UPDATE ... match_count = match_count + ?` once.

- [ ] **Step 5: Write route regressions and verify RED**

Real HTTP assertions:

- anonymous export is 401;
- PUT resource A with body `id: B` changes only A;
- malformed IDs return 400;
- missing DELETE returns 404;
- overwrite retains statistics columns and reports final count;
- `sortBy=last_matched_at` changes ordering;
- `/api/patterns/test-clear` returns 404;
- export/import are single authenticated handlers.

Run: `node --test test/pattern-routes.test.js`  
Expected: FAIL on anonymous export, ID override, and table recreation.

- [ ] **Step 6: Replace `patterns.js` with one ordered router**

Authenticate before every route, put `/export` and `/import` before `/:id`, validate bodies/IDs, remove duplicate/dead handlers, and return `INVALID_PATTERN`, `INVALID_ID`, or `PATTERN_NOT_FOUND` codes.

- [ ] **Step 7: Write RSS transformation/accounting tests and verify RED**

Use fixed XML with two titles/two Patterns. Assert exact titles, one aggregated increment per matched Pattern, invalid stored regex skipped, and oversized upstream response returns fixed 502 without upstream content.

- [ ] **Step 8: Precompile and aggregate RSS work**

Export pure `compilePatterns(patterns)` and `transformTitle(title, compiledPattern)`. Compile before item iteration, accumulate `Map<id,count>`, and update counts once after transformation. Log route/status/duration only.

- [ ] **Step 9: Verify GREEN and commit**

Run: `node --test test/pattern-validation.test.js test/database.test.js test/pattern-routes.test.js test/rss.test.js && npm run check`  
Expected: PASS.

```bash
git add package.json package-lock.json server test
git commit -m "fix: protect Pattern data integrity"
```

---

### Task 4: SSRF-Safe Proxies, Sonarr Secret Handling, and Bounded TMDB Work

**Files:**
- Create: `server/urlPolicy.js`
- Create: `server/concurrency.js`
- Create: `test/url-policy.test.js`
- Create: `test/proxy.test.js`
- Create: `test/sonarr.test.js`
- Create: `test/tmdb.test.js`
- Modify: `server/routes/proxy.js`
- Modify: `server/routes/imageProxy.js`
- Modify: `server/routes/sonarr.js`
- Modify: `server/routes/rss.js`
- Modify: `server/routes/tmdb.js`
- Modify: `server/config.js`

**Interfaces:**
- Produces `parseAllowedUrl(raw, policy): URL` and `boundedAxiosOptions(policy, config)`.
- `server/urlPolicy.js` exports immutable `MIKAN_POLICY` and `IMAGE_POLICY`.
- `server/concurrency.js` exports `mapConcurrent(items, limit, worker)`.
- A policy is `{ exactHosts, parentDomains, maxRedirects, maxBytes }`.
- TMDB sync uses `mapConcurrent(items, 4, worker)` and never permanently caches transport failures.

- [ ] **Step 1: Write URL policy tests and verify RED**

```js
for (const blocked of [
  'https://mikanani.me.evil.example/rss',
  'https://mikanani.me@127.0.0.1/private',
  'http://mikanani.me/rss',
  'https://mikanani.me:444/rss'
]) {
  test(`rejects ${blocked}`, () => {
    assert.throws(() => parseAllowedUrl(blocked, MIKAN_POLICY), /URL_NOT_ALLOWED/);
  });
}

test('allows exact Mikan HTTPS', () => {
  assert.equal(parseAllowedUrl(
    'https://mikanani.me/RSS/Bangumi?id=1', MIKAN_POLICY
  ).hostname, 'mikanani.me');
});
```

Invoke the Axios redirect callback with `169.254.169.254` and assert rejection.

Run: `node --test test/url-policy.test.js`  
Expected: FAIL because `server/urlPolicy.js` is absent.

- [ ] **Step 2: Implement URL and redirect validation**

Require HTTPS, empty credentials, empty/443 port, exact host or dot-boundary subdomain. Return Axios timeout, `maxRedirects: 3`, content/body limits, and `beforeRedirect` that revalidates the destination. Throw `URL_NOT_ALLOWED` or `UPSTREAM_TOO_LARGE`.

- [ ] **Step 3: Write proxy tests and verify RED**

Authenticate to the real app. Assert prefix-host/userinfo requests return 403 before the injected HTTP boundary runs; oversized image streams terminate before full content; upstream HTML/error bodies never appear in JSON.

Run: `node --test test/proxy.test.js`  
Expected: FAIL because both bypass forms currently pass and errors expose upstream details.

- [ ] **Step 4: Apply shared policy to Mikan/image proxies**

Use bounded requests and fixed User-Agent. Return generic 502 errors. Stream images through a byte-counting Transform that destroys both sides at the cap, preserves a verified image content type, and returns `Cache-Control: private, max-age=86400`. Log route/status/bytes/duration only.

- [ ] **Step 5: Write Sonarr proxy tests and verify RED**

Use a real local upstream server. Assert it receives `x-api-key: sonarr-secret`, never receives `apikey` or browser `token` in URL, and production config defaults TLS verification on.

Run: `node --test test/sonarr.test.js`  
Expected: FAIL because the API key is appended to the query.

- [ ] **Step 6: Update http-proxy-middleware configuration**

Use v3 `on: { proxyReq, error }`; set `X-Api-Key`, strip incoming `token`/`apikey`, keep streams intact, and log method/pathname only. Set `secure: !config.sonarrTlsInsecure`.

- [ ] **Step 7: Write TMDB tests and verify RED**

Assert eight controlled workers reach concurrency above 1 but never above 4; timeout is not cached; stale negative cache retries; `/tmdb/search` returns 404 promptly.

Run: `node --test test/tmdb.test.js`  
Expected: FAIL because sync is serial, transport failures are permanent, and `/search` hangs.

- [ ] **Step 8: Implement bounded TMDB operations**

Use `mapConcurrent(items, config.tmdb.concurrency, worker)`, the 5000 ms timeout, 30-day successful cache TTL, one-hour confirmed-404 negative TTL, and stale-null retry. Delete `/search`.

- [ ] **Step 9: Verify GREEN and commit**

Run: `node --test test/url-policy.test.js test/proxy.test.js test/sonarr.test.js test/tmdb.test.js test/rss.test.js && npm run check`  
Expected: PASS.

```bash
git add server test
git commit -m "fix: constrain external service boundaries"
```

---

### Task 5: Browser Session Migration, DOM Safety, UI Correctness, Performance, and PWA Cache Scope

**Files:**
- Create: `public/js/api.js`
- Create: `public/js/ui.js`
- Create: `test/frontend-api.test.js`
- Create: `test/frontend-ui.test.js`
- Create: `test/frontend-app.test.js`
- Create: `test/service-worker.test.js`
- Modify: `public/index.html`
- Modify: `public/js/app.js`
- Modify: `public/sw.js`
- Modify: `server/app.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces `MikanarrApi.createClient({ fetchImpl, onUnauthorized })` with `request`, `session`, `login`, `logout`.
- Produces `MikanarrUi.Toast` and `MikanarrUi.ConfirmDialog`; caller strings are always text.
- `MikanarrApp` no longer owns or reads a JWT.

- [ ] **Step 1: Install jsdom and write API client tests**

Run: `npm install --save-dev --save-exact jsdom@29.1.1`

```js
test('uses Cookie credentials and throws parsed non-2xx errors', async () => {
  const calls = [];
  const client = createClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ error: 'bad input', code: 'INVALID_PATTERN' }), {
        status: 400, headers: { 'content-type': 'application/json' }
      });
    },
    onUnauthorized() {}
  });
  await assert.rejects(() => client.request('/api/patterns', { method: 'POST' }),
    error => error.status === 400 && error.code === 'INVALID_PATTERN');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal('Authorization' in calls[0].options.headers, false);
});
```

- [ ] **Step 2: Verify RED, then implement `api.js`**

Run: `node --test test/frontend-api.test.js`  
Expected: FAIL because the module is absent.

Expose the factory through CommonJS and `window.MikanarrApi`. One in-flight unauthorized handler prevents duplicate redirects.

- [ ] **Step 3: Write DOM injection tests and verify RED**

With jsdom, pass `<img src=x onerror="globalThis.pwned=1">` through Toast, ConfirmDialog, Pattern name/season, Sonarr network/root/profile, and RSS errors. Assert no injected element/script exists and the literal payload is in `textContent`. Assert external TMDB/Sonarr poster URLs are rewritten to the same-origin authenticated image proxy.

Run: `node --test test/frontend-ui.test.js test/frontend-app.test.js`  
Expected: FAIL because Toast and renderers use untrusted `innerHTML`.

- [ ] **Step 4: Extract safe UI builders and repair renderers**

Static fragments may use templates; external/user values use `textContent`, property setters, or validated URL setters. Route all external poster URLs through `/api/image-proxy?url=`. Remove inline `onclick`, attach listeners explicitly, and export app/classes under CommonJS without browser auto-start in tests.

- [ ] **Step 5: Migrate browser authentication and status handling**

Startup calls `client.session()`. Login/logout use server Cookie endpoints. Remove localStorage JWT and Authorization header. State-changing UI updates only after a successful request; one 401 resets UI once.

- [ ] **Step 6: Write correctness/performance tests and verify RED**

Assert card checkboxes drive batch selection; `last_matched_at` is sent; import cancel targets its own modal; ConfirmDialog removes Escape listener; two cards sharing a TMDB ID make one detail request; filtering renders only the visible view; Series completion redraws without a second Pattern fetch.

Run: `node --test test/frontend-app.test.js`  
Expected: FAIL on current regressions.

- [ ] **Step 7: Implement minimal state/render fixes**

Add `getVisibleCheckboxes()`, `tmdbDetails: Map<id, Promise>`, `renderCurrentView()`, and local redraw after Series/TMDB updates. Use `modal.querySelector` and central listener cleanup. Remove `maximum-scale`/`user-scalable=no`, add accessible names to icon-only controls, and retain visible keyboard focus.

- [ ] **Step 8: Pin CDN assets and add script CSP**

Use exact jsDelivr assets and SRI:

- Bootstrap CSS 5.3.8: `sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB`
- Bootstrap JS 5.3.8: `sha384-FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI`
- Bootstrap Icons 1.13.1: `sha384-CK2SzKma4jA5H/MXDUU7i1TqZlCFaD4T01vtyDFvPlD97JQyS+IsSh1nI2EFbpyk`

Remove inline `onerror`/registration. Load `/js/ui.js`, `/js/api.js`, `/js/app.js`. Set CSP with `script-src 'self' https://cdn.jsdelivr.net` and no script `unsafe-inline`; permit inline styles temporarily; set `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `connect-src 'self'`, `img-src 'self' data:`, and `font-src 'self' https://cdn.jsdelivr.net data:`. Also set `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a deny-by-default Permissions Policy.

- [ ] **Step 9: Write Service Worker behavior tests and verify RED**

Execute the worker in a fake service-worker scope. Assert successful `/css/style.css` is cached, `/api/patterns` is never cached, and activate removes old cache.

Run: `node --test test/service-worker.test.js`  
Expected: FAIL because every same-origin GET is currently cached.

- [ ] **Step 10: Restrict PWA caching**

Cache only explicit same-origin shell assets, cache only `response.ok`, ignore every API/proxy prefix, delete old caches on activate, and call `clients.claim()`.

- [ ] **Step 11: Verify GREEN and commit**

Run: `node --test test/frontend-api.test.js test/frontend-ui.test.js test/frontend-app.test.js test/service-worker.test.js && npm run check`  
Expected: PASS.

```bash
git add package.json package-lock.json public server/app.js test
git commit -m "fix: secure and streamline the browser client"
```

---

### Task 6: Patched Dependencies, Non-Root Container, Health-Gated Compose, and CI

**Files:**
- Create: `.dockerignore`
- Create: `.github/dependabot.yml`
- Create: `.github/workflows/check.yml`
- Create: `test/container-config.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.github/workflows/docker-publish.yml`
- Modify: `.gitlab-ci.yml`

**Interfaces:**
- `npm run check` is the single local/GitHub/GitLab gate.
- Container health probes `/api/health` and runs as `node`.
- Compose defaults to GHCR and `${BIND_ADDRESS:-127.0.0.1}:12306:12306`.

- [ ] **Step 1: Refresh dependency floors**

Set:

```json
"axios": "^1.18.1",
"better-sqlite3": "^12.11.1",
"dotenv": "^17.4.2",
"http-proxy-middleware": "^3.0.7"
```

Remove `cors`; retain compatible Express/jsonwebtoken/xml2js and exact new dependencies. Run `npm install --package-lock-only` then `npm ci`.

- [ ] **Step 2: Verify dependency state**

Run: `npm outdated --json || true && npm audit --omit=dev --audit-level=high && npm run check`  
Expected: no high/critical production finding and all tests pass. If audit transport fails, record it and use the OSV lockfile batch query from the review; never describe a transport failure as clean.

- [ ] **Step 3: Write container/Compose behavior tests and verify RED**

Run `npm install --save-dev --save-exact yaml@2.9.0`. Parse Compose with `yaml.parse` and assert effective image, root `.env`, loopback default, healthcheck, and `/app/data` volume. Docker build/run assertions check non-root user and healthy runtime, with one named skip only when Docker is unavailable.

Run: `node --test test/container-config.test.js`  
Expected: FAIL on current image/env/health/user, with at most one Docker-runtime skip.

- [ ] **Step 4: Harden Docker and Compose**

Use `node:22.23.1-alpine3.24`, `npm ci --omit=dev`, create/chown `/app/data`, `USER node`, direct Node CMD, and wget healthcheck. `.dockerignore` excludes Git/worktrees/node_modules/env/data/keys/databases/logs. Compose uses root `.env`, GHCR image, configurable bind, persistent data, and healthcheck.

- [ ] **Step 5: Add CI checks and repair rules**

`check.yml` is a reusable `workflow_call` workflow using Node 22.23.1, `npm ci`, `npm run check`, and production audit. `docker-publish.yml` defines a `check` job with `uses: ./.github/workflows/check.yml`; `build-and-push` declares `needs: check` and no longer ignores `.github/**`. Add weekly Dependabot.

GitLab adds a Node test stage, removes mixed-commit skip behavior, makes publish depend on test, pins Alpine, uses pre-provisioned known_hosts, and deploys with `docker compose up -d --wait` without `StrictHostKeyChecking=no`.

- [ ] **Step 6: Verify GREEN and commit**

Run: `node --test test/container-config.test.js && npm run check && git diff --check`  
Expected: PASS; Docker runtime is PASS or one explicit skip.

```bash
git add .dockerignore .github .gitlab-ci.yml Dockerfile docker-compose.yml package.json package-lock.json test
git commit -m "chore: gate hardened releases on verification"
```

---

### Task 7: Documentation, License, Migration Notes, and Final Verification

**Files:**
- Create: `LICENSE`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `QUICKSTART.md`
- Modify: `TROUBLESHOOTING.md`
- Modify: `UPGRADE_NOTES.md`
- Modify: `PROJECT_SUMMARY.md`
- Modify: `package.json`

**Interfaces:**
- Every deployment document uses root `.env`, GHCR image, `/app/data`, `docker compose`, and the same variable names.
- Upgrade notes include legacy-OIDC migration and credential rotation.

- [ ] **Step 1: Add metadata and ISC license**

```json
"license": "ISC",
"engines": { "node": ">=22.13.0 <23" },
"packageManager": "npm@11.18.0"
```

Add standard ISC text with copyright `2026 Sage Hou and contributors`.

- [ ] **Step 2: Replace deployment instructions with one path**

```bash
cp .env.example .env
mkdir -p data
docker compose pull
docker compose up -d --wait
```

Document loopback default, recommended HTTPS proxy, and explicit `BIND_ADDRESS=0.0.0.0` for LAN exposure.

- [ ] **Step 3: Document auth and OIDC migration exactly**

Document local pair rules, `COOKIE_SECURE`, issuer/client/redirect, allowed subjects/group/groups claim. State old auth/token URL variables are rejected and show `OIDC_ISSUER=https://auth.example.com/application/o/mikanarr/`.

- [ ] **Step 4: Remove stale claims and add incident guidance**

Remove PUID/PGID, Node 18, `data/.env`, `/data`, missing backups, unsupported batch-import claims, and unverified security claims. Add SQLite backup/restore, log hygiene, and rotation of Mikan token, Sonarr API key, and JWT keys for exposed instances.

- [ ] **Step 5: Run fresh end-to-end verification**

```bash
npm ci
npm run check
npm audit --omit=dev --audit-level=high
git diff --check
git status --short
```

Start the real server with temporary data/random port. Verify health 200; empty login denied; valid login HttpOnly cookie; authenticated CRUD; anonymous export 401; body ID isolation; overwrite schema retention; logout invalidation; OIDC error plain text; proxy prefix-host/userinfo rejection.

- [ ] **Step 6: Commit documentation**

```bash
git add LICENSE .env.example README.md QUICKSTART.md TROUBLESHOOTING.md UPGRADE_NOTES.md PROJECT_SUMMARY.md package.json package-lock.json
git commit -m "docs: align secure deployment and migration guidance"
```

- [ ] **Step 7: Request final whole-branch review**

Generate a merge-base-to-HEAD review package. Review spec compliance, auth/OIDC, SSRF redirects, DOM sinks, SQLite transactions, test mutation quality, secret logging, CI gates, and docs. Resolve every Critical/Important finding through one reviewed fix wave before completion.
