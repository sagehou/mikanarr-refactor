import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const privKey = fs.readFileSync(path.join(__dirname, '../../data/jwt.key'));
const pubKey = fs.readFileSync(path.join(__dirname, '../../data/jwt.key.pub'));

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ username }, privKey, { algorithm: 'RS512', expiresIn: '24h' });
    res.json({ token });
  } else {
    res.status(401).send('Username or password incorrect');
  }
});

export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send('No token provided');
  
  const token = authHeader.split(' ')[1];
  jwt.verify(token, pubKey, { algorithms: ['RS512'] }, (err, decoded) => {
    if (err) return res.status(401).send('Invalid token');
    req.user = decoded;
    next();
  });
}

export default router;
