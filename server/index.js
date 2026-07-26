const { loadConfig } = require('./config');
const { createDatabase } = require('./database');
const { createApp } = require('./app');

async function start({ env = process.env, logger = console } = {}) {
  const config = loadConfig(env);
  const database = createDatabase({ dataDir: config.dataDir });
  const app = createApp({ config, database, logger });
  try {
    const server = await new Promise((resolve, reject) => {
      const listener = app.listen(config.port);
      listener.once('error', reject);
      listener.once('listening', () => resolve(listener));
    });
    logger.log(`Mikanarr started on port ${server.address().port}`);
    return { app, server, database };
  } catch (error) {
    database.close();
    throw error;
  }
}

if (require.main === module) {
  require('dotenv').config();
  start().catch(error => {
    console.error('Failed to start:', error);
    process.exitCode = 1;
  });
}

module.exports = { start };
