'use strict';

/**
 * Express app factory.
 *
 * Everything the app talks to the outside world with (config, database handle,
 * `fetch`) is injected, so tests can drive the whole Google flow with a fake
 * token endpoint and a fake JWKS instead of hitting Google.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { errorHandler, notFoundHandler } = require('./errors');
const { createAuthMiddleware } = require('./middleware/auth');
const { createAuthRouter } = require('./routes/auth');
const { createGoogleClient } = require('./services/google');
const { createSessionService } = require('./services/tokens');
const { createUsersService } = require('./services/users');
const { createUsersRepository, toPublicUser } = require('./repositories/users');
const { createRefreshTokensRepository } = require('./repositories/refresh-tokens');

const buildLimiters = (config) => {
  if (config.rateLimitDisabled) {
    return { strict: null, session: null, oauth: null };
  }

  const reject = (message) => (req, res) => {
    res.status(429).json({ statusCode: 429, message });
  };

  return {
    // Brute-force guard on credential endpoints (PRD §2: 10 req / 15 min / IP).
    strict: rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: config.isTest ? 1000 : 10,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      handler: reject('Too many attempts. Please wait a few minutes and try again.'),
    }),
    // Session bootstrap runs on every page load; keep the ceiling generous.
    session: rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: config.isTest ? 1000 : 120,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: reject('Too many requests. Please slow down.'),
    }),
    oauth: rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: config.isTest ? 1000 : 30,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: reject('Too many sign-in attempts. Please wait a few minutes and try again.'),
    }),
  };
};

const createApp = ({ config, db, fetchImpl, logger = console }) => {
  const usersRepository = createUsersRepository(db);
  const refreshTokensRepository = createRefreshTokensRepository(db);

  const users = createUsersService({
    users: { ...usersRepository, toPublicUser },
    config,
  });
  const sessions = createSessionService({
    config,
    users: usersRepository,
    refreshTokens: refreshTokensRepository,
  });
  const google = createGoogleClient({ config, fetchImpl, logger });
  const { requireAuth, requireRole, requireSameOrigin } = createAuthMiddleware({
    sessions,
    users: { ...usersRepository, toPublicUser },
  });

  const app = express();

  // Single-value X-Forwarded-For handling; required for per-IP rate limiting
  // behind a trusted reverse proxy, and opt-in so it cannot be spoofed by
  // clients when the app is exposed directly.
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(
    cors({
      // Echoing only allowlisted origins (never `*`) is what makes
      // `credentials: true` safe for the refresh cookie.
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (config.allowedOrigins.has(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    })
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const limiters = buildLimiters(config);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', google: config.google.configured ? 'configured' : 'unconfigured' });
  });

  app.use(
    '/api/auth',
    createAuthRouter({
      config,
      sessions,
      users,
      google,
      requireAuth,
      requireSameOrigin,
      limiters: {
        strict: limiters.strict ?? undefined,
        session: limiters.session ?? undefined,
        oauth: limiters.oauth ?? undefined,
      },
    })
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  const services = {
    users: usersRepository,
    refreshTokens: refreshTokensRepository,
    sessions,
    google,
    toPublicUser,
    requireAuth,
    requireRole,
  };

  return { app, services };
};

module.exports = { createApp, buildLimiters };
