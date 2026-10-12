'use strict';

/**
 * Server entrypoint: validate configuration, open the database, start listening.
 * Configuration problems fail fast and loudly rather than surfacing as confusing
 * 500s on the first sign-in attempt.
 */

const config = require('./config');
const { createDb } = require('./db');
const { createApp } = require('./app');

config.assertProductionConfig();

const db = createDb(config.databasePath);
const { app } = createApp({ config, db });

// Housekeeping: drop refresh tokens that expired more than a day ago.
const purgeExpiredTokens = () => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?').run(cutoff);
  } catch (error) {
    console.error('[startup] could not purge expired refresh tokens', error);
  }
};

purgeExpiredTokens();
const purgeTimer = setInterval(purgeExpiredTokens, 6 * 60 * 60 * 1000);
purgeTimer.unref();

const server = app.listen(config.port, config.host, () => {
  const bound = server.address();
  console.log(
    `[startup] Classroom API listening on ${bound?.address ?? config.host ?? '0.0.0.0'}:${bound?.port ?? config.port} (${config.nodeEnv})`
  );
  console.log(`[startup] Public origin configured as ${config.apiOrigin}`);
  if (config.jwtSecretIsEphemeral) {
    console.warn(
      '[startup] JWT_SECRET is not set — using a random secret for this run. Sessions and pending sign-ins will not survive a restart; set JWT_SECRET in server/.env.'
    );
  }
  console.log(
    `[startup] Google sign-in: ${config.google.configured ? 'configured' : 'NOT configured — set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET'}`
  );
  console.log(`[startup] Google redirect URI: ${config.google.redirectUri}`);
  console.log(`[startup] Allowed SPA origins: ${[...config.allowedOrigins].join(', ')}`);
});

const shutdown = (signal) => () => {
  console.log(`[shutdown] received ${signal}`);
  server.close(() => {
    try {
      db.close();
    } catch (error) {
      console.error('[shutdown] closing the database failed', error);
    }
    process.exit(0);
  });
};

process.on('SIGINT', shutdown('SIGINT'));
process.on('SIGTERM', shutdown('SIGTERM'));

module.exports = { server };
