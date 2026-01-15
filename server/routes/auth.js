const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const router = express.Router();
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const privKeyPath = path.join(dataDir, 'jwt.key');
const pubKeyPath = path.join(dataDir, 'jwt.key.pub');

if (!fs.existsSync(privKeyPath) || !fs.existsSync(pubKeyPath)) {
  const { generateKeyPairSync } = require('crypto');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
  fs.writeFileSync(privKeyPath, privateKey);
  fs.writeFileSync(pubKeyPath, publicKey);
}

const privKey = fs.readFileSync(privKeyPath);
const pubKey = fs.readFileSync(pubKeyPath);

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ username }, privKey, { algorithm: 'RS512', expiresIn: '24h' });
    res.json({ token });
  } else {
    res.status(401).send('Username or password incorrect');
  }
});

// OIDC Routes
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID;
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET;
const OIDC_AUTH_URL = process.env.OIDC_AUTH_URL;
const OIDC_TOKEN_URL = process.env.OIDC_TOKEN_URL;
const OIDC_REDIRECT_URI = process.env.OIDC_REDIRECT_URI;
const OIDC_AUTO_LOGIN = process.env.OIDC_AUTO_LOGIN === 'true';

router.get('/config', (req, res) => {
  res.json({
    oidcEnabled: !!(OIDC_CLIENT_ID && OIDC_AUTH_URL && OIDC_REDIRECT_URI),
    oidcAutoLogin: OIDC_AUTO_LOGIN
  });
});

router.get('/oidc/login', (req, res) => {
  if (!OIDC_CLIENT_ID || !OIDC_AUTH_URL || !OIDC_REDIRECT_URI) {
    return res.status(500).send('OIDC not configured');
  }

  const state = crypto.randomBytes(16).toString('hex');
  // In a production app, store state in cookie to verify later
  // res.cookie('oidc_state', state, { httpOnly: true, secure: true });

  const params = new URLSearchParams({
    client_id: OIDC_CLIENT_ID,
    redirect_uri: OIDC_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid profile email',
    state: state
  });

  res.redirect(`${OIDC_AUTH_URL}?${params.toString()}`);
});

router.get('/oidc/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`OIDC Error: ${error}`);
  }

  if (!code) {
    return res.status(400).send('No code provided');
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', OIDC_REDIRECT_URI);
    params.append('client_id', OIDC_CLIENT_ID);
    params.append('client_secret', OIDC_CLIENT_SECRET);

    const tokenRes = await axios.post(OIDC_TOKEN_URL, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    // We trust the IdP. If we got a valid token, we assume the user is authenticated.
    // In a real app, you might validate the ID token signature or fetch user info to check permissions.
    // Here we just map it to the admin user or a generic OIDC user.
    
    // Generate Mikanarr internal Token
    const token = jwt.sign({ username: 'sso_user', role: 'admin' }, privKey, { algorithm: 'RS512', expiresIn: '24h' });

    // Return HTML to save token and redirect
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Login Successful</title>
      </head>
      <body>
        <p>Login successful, redirecting...</p>
        <script>
          localStorage.setItem('token', '${token}');
          window.location.href = '/';
        </script>
      </body>
      </html>
    `;
    
    res.send(html);

  } catch (error) {
    console.error('OIDC Callback Error:', error.response?.data || error.message);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

function verifyToken(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) return res.status(401).json({ error: 'No token provided' });

  jwt.verify(token, pubKey, { algorithms: ['RS512'] }, (err, decoded) => {
    if (err) {
      console.error('[auth] Token verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = decoded;
    next();
  });
}

module.exports = router;
module.exports.verifyToken = verifyToken;
