const express = require('express');
const crypto = require('node:crypto');
const { createOidcProvider, isOidcAuthorized } = require('../oidc');
const { readCookie } = require('../session');

const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURE_CLIENTS = 1024;
const OIDC_ERROR_TEXT = 'OIDC authentication failed';
const OIDC_COOKIE_NAMES = Object.freeze(['oidc_state', 'oidc_nonce', 'oidc_verifier']);

function credentialsMatch(actual, expected) {
  const left = Buffer.from(typeof actual === 'string' ? actual : '');
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function reserveFailureWindow(failures, address, now, capacity = MAX_FAILURE_CLIENTS) {
  for (const [storedAddress, failure] of failures) {
    if (now - failure.startedAt >= FAILURE_WINDOW_MS) failures.delete(storedAddress);
  }
  if (failures.size >= capacity) return undefined;
  const failure = { count: 0, startedAt: now };
  failures.set(address, failure);
  return failure;
}

function createAuthRouter({ config, sessionManager, oidcProvider, oidcProviderFactory = createOidcProvider, clock = Date.now, logger = console, failureCapacity = MAX_FAILURE_CLIENTS }) {
  const router = express.Router();
  const failures = new Map();
  let discoveredProvider;

  async function provider() {
    if (oidcProvider) return oidcProvider;
    const pending = discoveredProvider || (discoveredProvider = oidcProviderFactory(config.auth.oidc));
    try {
      return await pending;
    } catch (error) {
      if (discoveredProvider === pending) discoveredProvider = undefined;
      throw error;
    }
  }

  function clearOidcCookies(res) {
    const { maxAge, ...options } = sessionManager.temporaryCookieOptions;
    for (const name of OIDC_COOKIE_NAMES) res.clearCookie(name, options);
  }

  function oidcError(res, status) {
    return res.status(status).type('text/plain').send(OIDC_ERROR_TEXT);
  }

  router.post('/login', (req, res) => {
    if (!config.auth.local.enabled) {
      return res.status(404).json({ error: 'Local authentication is not available', code: 'LOCAL_AUTH_DISABLED' });
    }
    const now = clock();
    let failure = failures.get(req.ip);
    if (failure && now - failure.startedAt >= FAILURE_WINDOW_MS) {
      failures.delete(req.ip);
      failure = undefined;
    }
    if (failure?.count >= 5) {
      return res.status(429).json({ error: 'Too many login attempts', code: 'LOGIN_RATE_LIMITED' });
    }
    if (!failure) {
      failure = reserveFailureWindow(failures, req.ip, now, failureCapacity);
      if (!failure) {
        return res.status(429).json({ error: 'Too many login attempts', code: 'LOGIN_RATE_LIMITED' });
      }
    }
    const { username, password } = req.body || {};
    if (credentialsMatch(username, config.auth.local.username) && credentialsMatch(password, config.auth.local.password)) {
      failures.delete(req.ip);
      const user = { username: config.auth.local.username };
      sessionManager.issue(res, user);
      return res.json({ user });
    }
    failure.count += 1;
    return res.status(401).json({ error: 'Username or password incorrect', code: 'INVALID_CREDENTIALS' });
  });

  router.get('/session', sessionManager.verifyRequest, (req, res) => res.json({ user: { username: req.user.username } }));
  router.post('/logout', (req, res) => {
    sessionManager.clear(res);
    res.status(204).send();
  });

  router.get('/config', (req, res) => res.json({ oidcEnabled: Boolean(config.auth.oidc.enabled), oidcAutoLogin: config.auth.oidc.autoLogin }));
  router.get('/oidc/login', async (req, res) => {
    if (!config.auth.oidc.enabled) {
      return res.status(404).json({ error: 'OIDC authentication is not available', code: 'OIDC_DISABLED' });
    }
    try {
      const request = await (await provider()).authorizationRequest();
      res.cookie('oidc_state', request.state, sessionManager.temporaryCookieOptions);
      res.cookie('oidc_nonce', request.nonce, sessionManager.temporaryCookieOptions);
      res.cookie('oidc_verifier', request.verifier, sessionManager.temporaryCookieOptions);
      return res.redirect(String(request.url));
    } catch {
      logger.error('[auth] OIDC authorization request failed');
      return res.status(500).json({ error: 'OIDC authentication failed', code: 'OIDC_FAILURE' });
    }
  });

  router.get('/oidc/callback', async (req, res) => {
    clearOidcCookies(res);
    if (!config.auth.oidc.enabled || req.query.error) return oidcError(res, 400);
    const checks = {
      state: readCookie(req, 'oidc_state'),
      nonce: readCookie(req, 'oidc_nonce'),
      verifier: readCookie(req, 'oidc_verifier')
    };
    if (!req.query.code || !req.query.state || !checks.state || !checks.nonce || !checks.verifier || req.query.state !== checks.state) {
      return oidcError(res, 400);
    }
    try {
      const currentUrl = new URL(req.originalUrl, config.auth.oidc.redirectUri);
      const claims = await (await provider()).exchange(currentUrl, checks);
      if (!isOidcAuthorized(claims, config.auth.oidc)) return oidcError(res, 403);
      sessionManager.issue(res, { username: claims.preferred_username || claims.email || claims.sub });
      return res.redirect('/');
    } catch {
      logger.error('[auth] OIDC callback failed');
      return oidcError(res, 500);
    }
  });
  router.verifyToken = sessionManager.verifyRequest;
  return router;
}

module.exports = { createAuthRouter, reserveFailureWindow };
