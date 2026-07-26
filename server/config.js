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

function normalizedUrl(value, key, { requireHttps = false, allowLocalHttp = false, stripTrailingSlash = true } = {}) {
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError('INVALID_CONFIG', `${key} must be a valid HTTP(S) URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ConfigError('INVALID_CONFIG', `${key} must be a valid HTTP(S) URL`);
  }
  if (requireHttps && url.protocol !== 'https:' && !(allowLocalHttp && url.hostname === 'localhost')) {
    throw new ConfigError('INVALID_CONFIG', `${key} must use HTTPS`);
  }
  const normalized = url.toString();
  return stripTrailingSlash ? normalized.replace(/\/$/, '') : normalized;
}

function loadConfig(env = process.env) {
  const username = env.ADMIN_USERNAME?.trim() || '';
  const password = env.ADMIN_PASSWORD || '';
  const localEnabled = Boolean(username && password);
  const oidcTuple = [env.OIDC_ISSUER, env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET, env.OIDC_REDIRECT_URI];
  const oidcAny = oidcTuple.some(Boolean);
  const oidcComplete = oidcTuple.every(value => typeof value === 'string' && value.trim());
  const allowedSubjects = csv(env.OIDC_ALLOWED_SUBJECTS);
  const requiredGroup = env.OIDC_REQUIRED_GROUP?.trim() || '';
  const nodeEnv = env.NODE_ENV || 'production';

  if (env.OIDC_AUTH_URL || env.OIDC_TOKEN_URL) {
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

  const allowLocalHttp = nodeEnv === 'test' || nodeEnv === 'development';
  const oidcIssuer = normalizedUrl(env.OIDC_ISSUER, 'OIDC_ISSUER', {
    requireHttps: true, allowLocalHttp, stripTrailingSlash: false
  });
  const oidcRedirectUri = normalizedUrl(env.OIDC_REDIRECT_URI, 'OIDC_REDIRECT_URI', {
    requireHttps: true, allowLocalHttp, stripTrailingSlash: false
  });
  return Object.freeze({
    nodeEnv,
    port: integer(env, 'PORT', 12306, 0, 65535),
    trustProxyHops: integer(env, 'TRUST_PROXY_HOPS', 0, 0, 5),
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
        issuer: oidcIssuer, clientId: env.OIDC_CLIENT_ID || '', clientSecret: env.OIDC_CLIENT_SECRET || '',
        redirectUri: oidcRedirectUri, autoLogin: boolean(env, 'OIDC_AUTO_LOGIN', false),
        allowInsecureRequests: Boolean(oidcIssuer && new URL(oidcIssuer).protocol === 'http:'),
        allowedSubjects, requiredGroup, groupsClaim: env.OIDC_GROUPS_CLAIM?.trim() || 'groups'
      })
    }),
    sonarr: Object.freeze({
      host: normalizedUrl(env.SONARR_HOST, 'SONARR_HOST'),
      publicUrl: normalizedUrl(env.SONARR_PUBLIC_URL, 'SONARR_PUBLIC_URL'),
      apiKey: env.SONARR_API_KEY || '', tlsInsecure: boolean(env, 'SONARR_TLS_INSECURE', false)
    }),
    tmdb: Object.freeze({ apiKey: env.TMDB_API_KEY || '', timeoutMs: 5000, cacheTtlMs: 2592000000, negativeTtlMs: 3600000, concurrency: 4 })
  });
}

module.exports = { loadConfig, ConfigError };
