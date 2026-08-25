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

function createShutdown({ server, database }) {
  let pending;
  return function shutdown() {
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      const finish = serverError => {
        try {
          database.close();
        } catch (databaseError) {
          return reject(databaseError);
        }
        return serverError ? reject(serverError) : resolve();
      };
      try {
        server.close(finish);
      } catch (error) {
        finish(error);
      }
    });
    return pending;
  };
}

function installShutdownHandlers(runtime, { processRef = process, logger = console } = {}) {
  const shutdown = createShutdown(runtime);
  for (const signal of ['SIGTERM', 'SIGINT']) {
    processRef.on(signal, () => {
      shutdown().catch(() => {
        logger.error(`[shutdown] ${signal} failed`);
        processRef.exitCode = 1;
      });
    });
  }
  return shutdown;
}

if (require.main === module) {
  require('dotenv').config();
  start()
    .then(runtime => installShutdownHandlers(runtime))
    .catch(error => {
      console.error('Failed to start:', error);
      process.exitCode = 1;
    });
}

module.exports = { start, createShutdown, installShutdownHandlers };
