const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const crypto = require('node:crypto');

function createAuthRouter({ config, logger = console, httpClient = axios }) {
  const router = express.Router();
  fs.mkdirSync(config.dataDir, { recursive: true });
  const privateKeyPath = path.join(config.dataDir, 'jwt.key');
  const publicKeyPath = path.join(config.dataDir, 'jwt.key.pub');
  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    });
    fs.writeFileSync(privateKeyPath, privateKey);
    fs.writeFileSync(publicKeyPath, publicKey);
  }
  const privateKey = fs.readFileSync(privateKeyPath);
  const publicKey = fs.readFileSync(publicKeyPath);

  function verifyToken(req, res, next) {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.split(' ')[1] : req.query.token;
    if (!token) return res.status(401).json({ error: 'No token provided' });
    jwt.verify(token, publicKey, { algorithms: ['RS512'] }, (error, decoded) => {
      if (error) {
        logger.error('[auth] Token verification failed:', error.message);
        return res.status(401).json({ error: 'Invalid token' });
      }
      req.user = decoded;
      next();
    });
  }

  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === config.auth.local.username && password === config.auth.local.password) {
      res.json({ token: jwt.sign({ username }, privateKey, { algorithm: 'RS512', expiresIn: '24h' }) });
    } else {
      res.status(401).send('Username or password incorrect');
    }
  });

  const legacyAuthUrl = process.env.OIDC_AUTH_URL;
  const legacyTokenUrl = process.env.OIDC_TOKEN_URL;
  router.get('/config', (req, res) => res.json({ oidcEnabled: Boolean(config.auth.oidc.enabled), oidcAutoLogin: config.auth.oidc.autoLogin }));
  router.get('/oidc/login', (req, res) => {
    if (!config.auth.oidc.enabled || !legacyAuthUrl) return res.status(500).send('OIDC not configured');
    const state = crypto.randomBytes(16).toString('hex');
    const params = new URLSearchParams({ client_id: config.auth.oidc.clientId, redirect_uri: config.auth.oidc.redirectUri, response_type: 'code', scope: 'openid profile email', state });
    res.redirect(`${legacyAuthUrl}?${params.toString()}`);
  });
  router.get('/oidc/callback', async (req, res) => {
    const { code, error } = req.query;
    if (error) return res.status(400).send(`OIDC Error: ${error}`);
    if (!code) return res.status(400).send('No code provided');
    if (!legacyTokenUrl) return res.status(500).send('OIDC not configured');
    try {
      const params = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: config.auth.oidc.redirectUri, client_id: config.auth.oidc.clientId, client_secret: config.auth.oidc.clientSecret });
      await httpClient.post(legacyTokenUrl, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      const token = jwt.sign({ username: 'sso_user', role: 'admin' }, privateKey, { algorithm: 'RS512', expiresIn: '24h' });
      res.send(`<!DOCTYPE html><html><body><script>localStorage.setItem('token', '${token}');window.location.href='/';</script></body></html>`);
    } catch (error) {
      logger.error('OIDC Callback Error:', error.response?.data || error.message);
      res.status(500).send(`Authentication failed: ${error.message}`);
    }
  });
  router.verifyToken = verifyToken;
  return router;
}

module.exports = { createAuthRouter };
