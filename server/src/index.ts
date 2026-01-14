import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import authRoutes from './routes/auth.js';
import patternsRoutes from './routes/patterns.js';
import proxyRoutes from './routes/proxy.js';
import sonarrRoutes from './routes/sonarr.js';
import rssRoutes from './routes/rss.js';
import { errorHandler } from './middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '12306');

const app = express();
app.use(express.json());

// Initialize database
initDb();

// Routes
app.use('/auth', authRoutes);
app.use('/api/patterns', patternsRoutes);
app.use('/proxy', proxyRoutes);
app.use('/sonarr', sonarrRoutes);
app.use('/RSS', rssRoutes);

// Serve static files
const buildPath = path.join(__dirname, '../web/dist');
app.use(express.static(buildPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
