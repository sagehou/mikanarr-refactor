const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const SESSION_COOKIE = 'mikanarr_session';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function readCookie(req, name) {
  for (const item of (req.headers.cookie || '').split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    const value = item.slice(separator + 1).trim();
    try { return decodeURIComponent(value); } catch { return undefined; }
  }
  return undefined;
}

function createSessionManager({ config, clock = Date.now }) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const privateKeyPath = path.join(config.dataDir, 'jwt.key');
  const publicKeyPath = path.join(config.dataDir, 'jwt.key.pub');
  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    });
    fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
    fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });
  }
  fs.chmodSync(privateKeyPath, 0o600);
  fs.chmodSync(publicKeyPath, 0o644);
  const privateKey = fs.readFileSync(privateKeyPath);
  const publicKey = fs.readFileSync(publicKeyPath);
  const cookieOptions = Object.freeze({
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    path: '/'
  });
  const temporaryCookieOptions = Object.freeze({
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/auth/oidc',
    maxAge: 10 * 60 * 1000
  });

  function issue(res, user) {
    const token = jwt.sign({ username: user.username, iat: Math.floor(clock() / 1000) }, privateKey, { algorithm: 'RS512', expiresIn: '24h' });
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_MAX_AGE_MS });
  }

  function verifyRequest(req, res, next) {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    try {
      req.user = jwt.verify(token, publicKey, { algorithms: ['RS512'], clockTimestamp: Math.floor(clock() / 1000) });
      next();
    } catch {
      res.status(401).json({ error: 'Invalid session', code: 'INVALID_SESSION' });
    }
  }

  function clear(res) {
    res.clearCookie(SESSION_COOKIE, cookieOptions);
  }

  return Object.freeze({ issue, verifyRequest, clear, temporaryCookieOptions });
}

function createSameOriginGuard(config) {
  return function sameOriginGuard(req, res, next) {
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return next();
    if (req.get('sec-fetch-site') === 'cross-site') {
      return res.status(403).json({ error: 'Cross-site request rejected', code: 'CROSS_SITE_REQUEST' });
    }
    const origin = req.get('origin');
    if (origin) {
      try {
        const parsed = new URL(origin);
        const expectedProtocol = config.cookieSecure ? 'https:' : `${req.protocol}:`;
        if (parsed.protocol !== expectedProtocol || parsed.host !== req.get('host')) {
          return res.status(403).json({ error: 'Cross-site request rejected', code: 'CROSS_SITE_REQUEST' });
        }
      } catch {
        return res.status(403).json({ error: 'Cross-site request rejected', code: 'CROSS_SITE_REQUEST' });
      }
    }
    next();
  };
}

module.exports = { createSessionManager, createSameOriginGuard, readCookie };
