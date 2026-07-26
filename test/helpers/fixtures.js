const { rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { randomUUID } = require('node:crypto');
const { loadConfig } = require('../../server/config');
const { createDatabase } = require('../../server/database');
const { createApp } = require('../../server/app');
const { listen } = require('./http');

function createTestDatabase() {
  const dataDir = join(tmpdir(), `mikanarr-${randomUUID()}`);
  const database = createDatabase({ dataDir });
  return { database, dataDir, close() { database.close(); rmSync(dataDir, { recursive: true, force: true }); } };
}

async function createAppFixture({ oidcOnly = false, env: overrides = {}, oidcProvider, oidcProviderFactory, clock, logger = { log() {}, warn() {}, error() {} } } = {}) {
  const fixture = createTestDatabase();
  const defaults = oidcOnly
    ? { NODE_ENV: 'test', DATA_DIR: fixture.dataDir, OIDC_ISSUER: 'http://localhost:8080', OIDC_CLIENT_ID: 'client', OIDC_CLIENT_SECRET: 'secret', OIDC_REDIRECT_URI: 'http://localhost:12306/auth/oidc/callback', OIDC_ALLOWED_SUBJECTS: 'subject' }
    : { NODE_ENV: 'test', DATA_DIR: fixture.dataDir, ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'secret' };
  const env = { ...defaults, ...overrides };
  const config = loadConfig(env);
  const app = createApp({ config, database: fixture.database, oidcProvider, oidcProviderFactory, clock, logger });
  const http = await listen(app);
  return { ...fixture, ...http, app, config, async close() { await new Promise(resolve => http.server.close(resolve)); fixture.close(); } };
}

const validPattern = Object.freeze({ remote: '', pattern: '(?<episode>\\d+)', series: 'Example', season: '1', language: 'Chinese', quality: 'WEBDL 1080p', offset: 0, releasegroup: '' });

class CookieJar {
  constructor() { this.cookies = new Map(); }
  set(response) {
    for (const cookie of response.headers.getSetCookie()) {
      const [name, value] = cookie.split(';')[0].split('=');
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
  }
  header() { return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '); }
}

async function login(fixture, username = 'admin', password = 'secret', jar = new CookieJar()) {
  const response = await fetch(`${fixture.baseUrl}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  jar.set(response);
  return response;
}

module.exports = { createAppFixture, createTestDatabase, validPattern, login, CookieJar };
