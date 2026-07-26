# Task 1 report — test harness, configuration, app, and database foundation

## Implementation

- Added immutable `loadConfig(env)` and coded `ConfigError`, including complete local/OIDC validation, strict scalar parsing, frozen nested policy, and normalized HTTP(S) service/OIDC URLs.
- Replaced the import-time SQLite singleton with `createDatabase({ dataDir })`, directory creation, schema migration, reusable statements, idempotent `close()`, and `healthCheck()`.
- Added `createApp({ config, database, oidcProvider, httpClient, logger })`; it preserves proxy-before-body-parser routing, limits JSON to 256kb, provides `GET /api/health`, static/SPI behavior, and error handling without listening on import.
- Made `start({ env, logger } = {})` construct and listen explicitly (including `PORT=0`), and only execute startup when `server/index.js` is the main module.
- Converted every server route to a dependency-injected `createXRouter` factory. Authentication behavior remains deliberately unchanged pending Task 2.
- Added listener/database/app fixtures, a small cookie jar, pattern fixture, login helper, TDD coverage, and project test/syntax/check scripts.

## Files

- Created: `server/config.js`, `server/app.js`, `test/helpers/http.js`, `test/helpers/fixtures.js`, `test/config.test.js`, `test/database.test.js`, `test/app.test.js`, `test/index.test.js`.
- Modified: `package.json`, `server/index.js`, `server/database.js`, and all seven route modules required by the brief.

## RED evidence

1. `node --test test/config.test.js` exited 1 with `Cannot find module '../server/config'`.
2. `node --test test/database.test.js` exited 1: the old singleton attempted to open the non-existent data directory during import, demonstrating it could not provide isolated `createDatabase` instances.
3. `node --test test/app.test.js` exited 1 with `Cannot find module './helpers/fixtures'`; after the helper was introduced, it exited 1 with `Cannot find module '../../server/app'`.
4. `node --test test/index.test.js` exited 1 because the pre-factory index mounted old route singleton exports (`TypeError: argument handler must be a function`).

## GREEN evidence

1. `node --test test/config.test.js` — 4 passed, 0 failed.
2. `node --test test/database.test.js && node --test test/config.test.js` — 6 passed, 0 failed.
3. `node --test test/app.test.js` — 1 passed, 0 failed.
4. `node --test test/index.test.js && node --test test/config.test.js test/database.test.js test/app.test.js` — 8 passed, 0 failed.
5. Final: `npm run check` — syntax checks passed; 8 tests passed, 0 failed. `git diff --check` also exited 0.

## Self-review

- Confirmed no module creates a listener on import; only main-module execution invokes `start()`.
- Confirmed `PORT=0`, per-fixture temporary databases, directory creation, migration columns, idempotent close, and health response with integration tests.
- Confirmed all config objects and the subject array are frozen, and all explicit factory names are exported.
- Kept the explicit existing proxy, static, SPA catch-all, and legacy authentication route behavior within Task 1 scope.

## Concerns / deferred work

- The old bearer/query-token and legacy OIDC route behavior remains intentionally intact for Task 2, which owns fail-closed cookie sessions and standards-based OIDC.
- Pattern/proxy hardening and frontend/deployment work remain intentionally deferred to their assigned tasks.
