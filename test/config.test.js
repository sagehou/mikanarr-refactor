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

test('freezes nested authorization policy', () => {
  const config = loadConfig({
    NODE_ENV: 'test', DATA_DIR: '/tmp/mikanarr-test',
    OIDC_ISSUER: 'http://localhost:8080/', OIDC_CLIENT_ID: 'client',
    OIDC_CLIENT_SECRET: 'secret', OIDC_REDIRECT_URI: 'http://localhost:12306/auth/oidc/callback',
    OIDC_ALLOWED_SUBJECTS: 'alice, bob'
  });
  assert.equal(Object.isFrozen(config.auth.oidc.allowedSubjects), true);
  assert.throws(() => config.auth.oidc.allowedSubjects.push('mallory'), TypeError);
  assert.equal(config.auth.oidc.issuer, 'http://localhost:8080');
});

test('rejects incomplete and legacy OIDC configuration', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'test', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'secret', OIDC_ISSUER: 'http://localhost' }),
    error => error instanceof ConfigError && error.code === 'OIDC_INCOMPLETE'
  );
  assert.throws(
    () => loadConfig({ NODE_ENV: 'test', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'secret', OIDC_AUTH_URL: 'http://localhost' }),
    error => error instanceof ConfigError && error.code === 'OIDC_LEGACY_CONFIG'
  );
});

test('rejects legacy OIDC URLs alongside a complete issuer configuration', () => {
  const modern = {
    NODE_ENV: 'test', DATA_DIR: '/tmp/mikanarr-test',
    OIDC_ISSUER: 'http://localhost:8080/', OIDC_CLIENT_ID: 'client',
    OIDC_CLIENT_SECRET: 'secret', OIDC_REDIRECT_URI: 'http://localhost:12306/auth/oidc/callback',
    OIDC_ALLOWED_SUBJECTS: 'alice'
  };
  for (const legacy of ['OIDC_AUTH_URL', 'OIDC_TOKEN_URL']) {
    assert.throws(
      () => loadConfig({ ...modern, [legacy]: 'http://localhost/legacy' }),
      error => error instanceof ConfigError && error.code === 'OIDC_LEGACY_CONFIG',
      legacy
    );
  }
});
