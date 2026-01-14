const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

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

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send('No token provided');
  
  const token = authHeader.split(' ')[1];
  jwt.verify(token, pubKey, { algorithms: ['RS512'] }, (err, decoded) => {
    if (err) return res.status(401).send('Invalid token');
    req.user = decoded;
    next();
  });
}

module.exports = router;
module.exports.verifyToken = verifyToken;
