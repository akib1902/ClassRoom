'use strict';

/**
 * Cookie policy for the auth endpoints, in one place so the logout path can
 * never disagree with the login path about scope/attributes.
 *
 * - `classroom_rt`  refresh token: httpOnly, never readable by JavaScript, and
 *   scoped to `/api/auth` so it is not attached to ordinary API calls.
 * - `classroom_oauth`  short-lived, HMAC-signed transaction cookie carrying the
 *   PKCE `code_verifier`, `state` and `nonce` between the redirect to Google and
 *   the callback. It is httpOnly and signed, so an attacker who can write
 *   cookies cannot forge or read a verifier.
 */

const crypto = require('node:crypto');
const { ApiError } = require('../errors');

const REFRESH_COOKIE = 'classroom_rt';
const OAUTH_COOKIE = 'classroom_oauth';
const OAUTH_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

const base64url = (input) => Buffer.from(input).toString('base64url');

/**
 * Signs an OAuth transaction payload: `base64url(json).base64url(hmac)`.
 * Tampering invalidates the HMAC; the payload also carries its own expiry
 * because cookies can be replayed after logout.
 */
const signTransaction = (payload, secret) => {
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
};

const verifyTransaction = (token, secret) => {
  if (typeof token !== 'string') return null;

  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  if (typeof payload.state !== 'string' || typeof payload.codeVerifier !== 'string') return null;

  return payload;
};

const baseCookieOptions = (config, overrides = {}) => ({
  httpOnly: true,
  sameSite: config.cookie.sameSite,
  secure: config.cookie.secure,
  path: '/',
  ...(config.cookie.domain ? { domain: config.cookie.domain } : {}),
  ...overrides,
});

const setRefreshCookie = (res, config, { token, expiresAt }) => {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseCookieOptions(config, { path: '/api/auth' }),
    expires: new Date(expiresAt),
  });
};

const clearRefreshCookie = (res, config) => {
  res.clearCookie(REFRESH_COOKIE, baseCookieOptions(config, { path: '/api/auth' }));
};

const setOAuthCookie = (res, config, transaction) => {
  res.cookie(OAUTH_COOKIE, signTransaction(transaction, config.jwtSecret), {
    ...baseCookieOptions(config, { path: '/api/auth' }),
    maxAge: OAUTH_COOKIE_MAX_AGE_MS,
  });
};

const clearOAuthCookie = (res, config) => {
  res.clearCookie(OAUTH_COOKIE, baseCookieOptions(config, { path: '/api/auth' }));
};

const readOAuthCookie = (req, config) => {
  const token = req.cookies?.[OAUTH_COOKIE];
  const payload = verifyTransaction(token, config.jwtSecret);
  if (!payload) {
    // Distinguish "expired/tampered" from "missing" only in the server log —
    // the client always gets the same opaque reason code.
    throw ApiError.badRequest('This sign-in attempt expired. Please try again.', {
      code: 'oauth_state',
    });
  }
  return payload;
};

/** RFC 7636 §4.1 — 43–128 characters from the unreserved set. */
const createCodeVerifier = () => crypto.randomBytes(48).toString('base64url');

const createCodeChallenge = (verifier) =>
  crypto.createHash('sha256').update(verifier).digest('base64url');

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = {
  REFRESH_COOKIE,
  OAUTH_COOKIE,
  OAUTH_COOKIE_MAX_AGE_MS,
  signTransaction,
  verifyTransaction,
  setRefreshCookie,
  clearRefreshCookie,
  setOAuthCookie,
  clearOAuthCookie,
  readOAuthCookie,
  createCodeVerifier,
  createCodeChallenge,
  randomToken,
  hashToken,
};
