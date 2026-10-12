'use strict';

/**
 * Server configuration, parsed once at boot.
 *
 * Security posture: in `production` the app refuses to start unless every
 * secret/origin is present and sane (no plain-HTTP origins, no short signing
 * keys). In `development`/`test` the Google credentials are optional so the
 * API can boot without a Google Cloud project — the Google endpoints then
 * answer 503 with an actionable message instead of crashing the process.
 */

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const MIN_JWT_SECRET_LENGTH = 32;

const raw = (key, fallback = '') => (process.env[key] ?? fallback).trim();

const bool = (key, fallback = false) => {
  const value = raw(key).toLowerCase();
  if (value === '') return fallback;
  return value === 'true' || value === '1' || value === 'yes';
};

const int = (key, fallback) => {
  const value = Number.parseInt(raw(key), 10);
  return Number.isFinite(value) ? value : fallback;
};

const list = (key) =>
  raw(key)
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

const csvOrigins = (key, fallback) => {
  const values = raw(key) ? raw(key).split(',') : [];
  const origins = values.map((origin) => origin.trim()).filter(Boolean);
  return origins.length > 0 ? origins : fallback;
};

const nodeEnv = raw('NODE_ENV', 'development') || 'development';
const isProduction = nodeEnv === 'production';

/**
 * Outside production a missing `JWT_SECRET` is generated per boot instead of
 * crashing the API, so a developer only has to configure Google to try the
 * flow. Sessions (and any in-flight OAuth attempt) do not survive a restart in
 * that mode, which is exactly why production still refuses to start without a
 * real secret.
 */
let jwtSecret = raw('JWT_SECRET');
let jwtSecretIsEphemeral = false;
if (!jwtSecret && !isProduction) {
  jwtSecret = require('node:crypto').randomBytes(48).toString('base64url');
  jwtSecretIsEphemeral = true;
}

const appOrigin = raw('APP_ORIGIN', 'http://localhost:5173').replace(/\/+$/, '');
const apiOrigin = raw('API_ORIGIN', `http://localhost:${int('PORT', 4000)}`).replace(/\/+$/, '');

// The SPA may legitimately be served from several origins (e.g. a Vite dev
// server plus a preview deployment), so CORS and the post-login redirect both
// consult an allowlist rather than a single string.
const allowedOrigins = new Set(csvOrigins('ALLOWED_ORIGINS', [appOrigin]));

/**
 * `lax` is correct whenever the SPA and the API share a registrable domain
 * (localhost:5173 → localhost:4000, or app.example.com → api.example.com).
 * Deployments that split the two across different domains must opt in to
 * `none`, which browsers only honour on `Secure` cookies.
 */
const cookieSameSite = (raw('COOKIE_SAMESITE', isProduction ? 'lax' : 'lax') || 'lax').toLowerCase();

const config = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',
  port: int('PORT', 4000),
  // Empty/absent binds every interface (the usual choice behind a managed
  // proxy). Set HOST=127.0.0.1 or HOST=::1 to expose the API on loopback only.
  host: raw('HOST') || undefined,
  trustProxy: bool('TRUST_PROXY', isProduction),

  appOrigin,
  apiOrigin,
  allowedOrigins,
  cookie: {
    sameSite: cookieSameSite,
    domain: raw('COOKIE_DOMAIN') || undefined,
    // Browsers ignore `SameSite=None` without `Secure`; force it on so the
    // refresh cookie is never silently dropped.
    secure: bool('COOKIE_SECURE', isProduction) || cookieSameSite === 'none',
  },

  jwtSecret,
  jwtSecretIsEphemeral,
  accessTokenTtl: raw('ACCESS_TOKEN_TTL', '15m'),
  refreshTokenTtlDays: int('REFRESH_TOKEN_TTL_DAYS', 7),
  jwtIssuer: raw('JWT_ISSUER', 'classroom-api'),
  jwtAudience: raw('JWT_AUDIENCE', 'classroom-app'),

  google: {
    clientId: raw('GOOGLE_CLIENT_ID'),
    clientSecret: raw('GOOGLE_CLIENT_SECRET'),
    // Optional hardening: restrict sign-in to Workspace domains.
    hostedDomains: list('GOOGLE_ALLOWED_DOMAINS'),
    authorizationEndpoint: raw(
      'GOOGLE_AUTHORIZATION_ENDPOINT',
      'https://accounts.google.com/o/oauth2/v2/auth'
    ),
    tokenEndpoint: raw('GOOGLE_TOKEN_ENDPOINT', 'https://oauth2.googleapis.com/token'),
    jwksUri: raw('GOOGLE_JWKS_URI', 'https://www.googleapis.com/oauth2/v3/certs'),
    redirectPath: '/api/auth/google/callback',
  },

  /** Emails promoted to `admin` on first sign-in — the role bootstrap. */
  adminEmails: list('ADMIN_EMAILS'),

  databasePath: raw('DATABASE_PATH', path.resolve(__dirname, '..', 'classroom.db')),
  rateLimitDisabled: bool('RATE_LIMIT_DISABLED', nodeEnv === 'test'),
};

config.google.redirectUri = `${config.apiOrigin}${config.google.redirectPath}`;
config.google.configured = Boolean(config.google.clientId && config.google.clientSecret);

/** Redirects must stay on an allowlisted origin — no open redirects (CWE-601). */
const resolveAllowedRedirect = (candidate) => {
  const fallback = `${config.appOrigin}/`;
  if (typeof candidate !== 'string' || candidate.trim() === '') return fallback;

  const value = candidate.trim();

  // Relative app paths ("/subjects?page=2") are always safe.
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) {
    return `${config.appOrigin}${value}`;
  }

  try {
    const url = new URL(value);
    if (config.allowedOrigins.has(url.origin)) return url.toString();
  } catch {
    /* fall through to the fallback */
  }

  return fallback;
};

/**
 * Fails fast on insecure production configuration. Called by `index.js` so unit
 * tests can build an app with deliberately partial config.
 */
const assertProductionConfig = () => {
  if (!isProduction) return;

  const problems = [];
  if (config.jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }
  if (!config.google.configured) {
    problems.push('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required');
  }
  for (const origin of config.allowedOrigins) {
    if (!origin.startsWith('https://')) {
      problems.push(`ALLOWED_ORIGINS must use https in production (got ${origin})`);
    }
  }
  if (!config.appOrigin.startsWith('https://')) {
    problems.push(`APP_ORIGIN must use https in production (got ${config.appOrigin})`);
  }
  if (!config.apiOrigin.startsWith('https://')) {
    problems.push(`API_ORIGIN must use https in production (got ${config.apiOrigin})`);
  }
  if (config.cookie.sameSite === 'none' && !config.cookie.secure) {
    problems.push('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
  }

  if (problems.length > 0) {
    throw new Error(`Refusing to start with an insecure production config:\n  - ${problems.join('\n  - ')}`);
  }
};

/** Builds a config object for tests without re-reading the environment. */
const testConfig = (overrides = {}) => {
  const base = {
    ...config,
    nodeEnv: 'test',
    isProduction: false,
    isTest: true,
    jwtSecret: 'test-secret-'.padEnd(MIN_JWT_SECRET_LENGTH, 'x'),
    databasePath: ':memory:',
    rateLimitDisabled: true,
    adminEmails: [],
    google: {
      ...config.google,
      clientId: 'test-client-id.apps.googleusercontent.com',
      clientSecret: 'test-client-secret',
      configured: true,
      hostedDomains: [],
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    },
    allowedOrigins: new Set(['http://localhost:5173']),
    appOrigin: 'http://localhost:5173',
    apiOrigin: 'http://localhost:4000',
  };
  const merged = {
    ...base,
    ...overrides,
    google: { ...base.google, ...(overrides.google ?? {}) },
    cookie: { ...base.cookie, ...(overrides.cookie ?? {}) },
  };
  merged.google.redirectUri = `${merged.apiOrigin}${merged.google.redirectPath}`;
  merged.resolveAllowedRedirect = resolveAllowedRedirect;
  return merged;
};

config.resolveAllowedRedirect = resolveAllowedRedirect;
config.assertProductionConfig = assertProductionConfig;
config.testConfig = testConfig;
config.MIN_JWT_SECRET_LENGTH = MIN_JWT_SECRET_LENGTH;

module.exports = config;
