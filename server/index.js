require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./database');
const authRoutes = require('./routes/auth');
const patternRoutes = require('./routes/patterns');
const proxyRoutes = require('./routes/proxy');
const sonarrRoutes = require('./routes/sonarr');
const rssRoutes = require('./routes/rss');
const tmdbRoutes = require('./routes/tmdb');

const app = express();
const PORT = parseInt(process.env.PORT || '12306');

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '../public')));

app.use('/auth', authRoutes);
app.use('/api/patterns', patternRoutes);
app.use('/proxy', proxyRoutes);
app.use('/sonarr', sonarrRoutes);
app.use('/RSS', rssRoutes);
app.use('/tmdb', tmdbRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

async function start() {
  try {
    initDb();
    app.listen(PORT, () => {
      console.log(`Mikanarr started on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

start();
