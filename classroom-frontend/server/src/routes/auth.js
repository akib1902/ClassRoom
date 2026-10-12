'use strict';

/**
 * Auth routes (README §5.3).
 *
 * Google sign-in is a **server-initiated** authorization-code + PKCE flow:
 *
 *   SPA    → GET /api/auth/google/start     (302 to Google, sets signed tx cookie)
 *   Google → GET /api/auth/google/callback  (exchanges code, verifies ID token)
 *   API    → 302 back to APP_ORIGIN + ?auth=success  (sets httpOnly refresh cookie)
 *   SPA    → POST /api/auth/refresh         (mints the in-memory access token)
 *
 * The client secret and the PKCE verifier never leave this process, and the
 * callback never puts a token in a URL — only an opaque marker plus a cookie.
 * Every callback failure is a redirect back to the SPA login page with a stable
 * reason code, because the endpoint is reached by browser navigation.
 */

const crypto = require('node:crypto');
const express = require('express');
const { z } = require('zod');

const { ApiError, asyncRoute } = require('../errors');
const { validateBody, validateQuery } = require('../middleware/validate');
const {
  setOAuthCookie,
  clearOAuthCookie,
  readOAuthCookie,
  createCodeVerifier,
  createCodeChallenge,
  randomToken,
  REFRESH_COOKIE,
  setRefreshCookie,
  clearRefreshCookie,
} = require('../lib/cookies');

const EMAIL = z.string().trim().toLowerCase().email().max(254);

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(120),
  email: EMAIL,
  // 12+ characters with a letter and a number — long enough that bcrypt cost 12
  // stays the bottleneck rather than the password.
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters.')
    .max(200)
    .regex(/[A-Za-z]/, 'Password must contain a letter.')
    .regex(/\d/, 'Password must contain a number.'),
});

const loginSchema = z.object({
  email: EMAIL,
  password: z.string().min(1, 'Password is required.').max(200),
});

const googleStartSchema = z.object({
  redirect: z.string().max(1024).optional(),
  login_hint: z.string().max(254).optional(),
  intent: z.enum(['signin', 'signup']).optional(),
});

const callbackSchema = z.object({
  code: z.string().min(1).max(4096).optional(),
  state: z.string().min(1).max(512).optional(),
  error: z.string().max(120).optional(),
  error_description: z.string().max(500).optional(),
});

/** Internal failure reason → stable, non-leaky marker handed to the SPA. */
const reasonFor = (error) => {
  if (error instanceof ApiError) {
    if (error.statusCode >= 500) return 'server_error';
    if (error.statusCode === 403) return 'not_allowed';
    if (error.code === 'oauth_state') return 'oauth_state';
    if (error.code === 'google_exchange_failed') return 'google_exchange_failed';
    if (error.code === 'google_id_token') return 'google_id_token';
    return 'signin_failed';
  }
  return 'server_error';
};

const createAuthRouter = ({
  config,
  sessions,
  users,
  google,
  requireAuth,
  requireSameOrigin,
  limiters = {},
}) => {
  const router = express.Router();
  const strict = limiters.strict ?? ((req, res, next) => next());
  const session = limiters.session ?? ((req, res, next) => next());
  const oauth = limiters.oauth ?? ((req, res, next) => next());
  const sameOrigin = requireSameOrigin(config.allowedOrigins);

  const sessionBody = (user, issued) => ({
    accessToken: issued.accessToken,
    accessTokenExpiresIn: issued.accessTokenExpiresIn,
    user: users.toPublicUser(user),
  });

  /** Redirect target for the "browser is back in the SPA" step. */
  const appRedirect = (path, params) => {
    const url = new URL(config.resolveAllowedRedirect(path));
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    }
    return url.toString();
  };

  const failRedirect = (res, reason) =>
    res.redirect(302, appRedirect('/login', { auth: 'error', reason }));

  /* ------------------------------- discovery ------------------------------ */

  /** Lets the SPA disable the Google button instead of failing on click. */
  router.get('/providers', (req, res) => {
    res.json({
      password: true,
      google: {
        enabled: config.google.configured,
        hostedDomains: config.google.hostedDomains,
      },
    });
  });

  /* -------------------------- Google sign-in flow ------------------------- */

  router.get('/google/start', oauth, validateQuery(googleStartSchema), (req, res) => {
    const { redirect, login_hint: loginHint, intent } = req.validatedQuery;

    if (!config.google.configured) {
      return failRedirect(res, 'google_unconfigured');
    }

    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    const state = randomToken(32);
    const nonce = randomToken(32);

    setOAuthCookie(res, config, {
      state,
      nonce,
      codeVerifier,
      redirect: redirect ?? '/',
      intent: intent ?? 'signin',
      exp: Date.now() + 10 * 60 * 1000,
    });

    // Only the S256 challenge leaves the server — never the verifier.
    return res.redirect(302, google.buildAuthorizationUrl({ state, codeChallenge, nonce, loginHint }));
  });

  router.get('/google/callback', validateQuery(callbackSchema), async (req, res) => {
    // Read the one-shot transaction, then clear it immediately: the cookie must
    // be gone on *every* exit path, and it has to happen before the first byte
    // of the response is written (a `finally` after `redirect` would throw
    // ERR_HTTP_HEADERS_SENT).
    let transaction = null;
    try {
      transaction = readOAuthCookie(req, config);
    } catch {
      transaction = null;
    }
    clearOAuthCookie(res, config);

    if (!transaction) {
      console.warn('[auth] google callback rejected: missing or expired transaction cookie');
      return failRedirect(res, 'oauth_state');
    }

    const { code, state, error: googleError } = req.validatedQuery;

    const stateMatches =
      typeof state === 'string' &&
      state.length === transaction.state.length &&
      crypto.timingSafeEqual(Buffer.from(state), Buffer.from(transaction.state));

    if (!stateMatches) {
      console.warn('[auth] google callback rejected: state mismatch');
      return failRedirect(res, 'oauth_state');
    }

    // `access_denied` is the user closing the consent screen — not an incident,
    // but it must not create a session.
    if (googleError) return failRedirect(res, 'google_denied');
    if (!code) return failRedirect(res, 'signin_failed');

    try {
      const tokens = await google.exchangeCodeForTokens({
        code,
        codeVerifier: transaction.codeVerifier,
      });

      const profile = await google.verifyIdToken({
        idToken: tokens.id_token,
        nonce: transaction.nonce,
      });

      const user = users.upsertFromGoogle({ profile });
      const issued = sessions.startSession({ user, req });

      setRefreshCookie(res, config, {
        token: issued.refreshToken,
        expiresAt: issued.refreshExpiresAt,
      });

      return res.redirect(302, appRedirect(transaction.redirect, { auth: 'success', via: 'google' }));
    } catch (error) {
      // Log the real cause server-side; send only a stable code to the browser.
      console.error('[auth] google sign-in failed', {
        reason: reasonFor(error),
        message: error instanceof Error ? error.message : String(error),
      });
      return failRedirect(res, reasonFor(error));
    }
  });

  /* ------------------------------- passwords ------------------------------ */

  router.post(
    '/register',
    strict,
    validateBody(registerSchema),
    asyncRoute(async (req, res) => {
      const user = users.createWithPassword(req.body);
      const issued = sessions.startSession({ user, req });
      setRefreshCookie(res, config, {
        token: issued.refreshToken,
        expiresAt: issued.refreshExpiresAt,
      });
      res.status(201).json(sessionBody(user, issued));
    })
  );

  router.post(
    '/login',
    strict,
    validateBody(loginSchema),
    asyncRoute(async (req, res) => {
      const { email, password } = req.body;
      const row = users.findByEmail(email);

      // One message for "no such account" and "wrong password" so the endpoint
      // never becomes an account-enumeration oracle.
      if (!row || !users.verifyPassword({ user: row, password })) {
        throw ApiError.unauthorized('Incorrect email or password.', { code: 'invalid_credentials' });
      }

      const issued = sessions.startSession({ user: row, req });
      setRefreshCookie(res, config, {
        token: issued.refreshToken,
        expiresAt: issued.refreshExpiresAt,
      });
      res.json(sessionBody(row, issued));
    })
  );

  /* -------------------------------- session ------------------------------- */

  /**
   * Bootstraps the SPA session on load: the httpOnly refresh cookie is the
   * credential, and the short-lived access token comes back in the body only.
   */
  router.post(
    '/refresh',
    sameOrigin,
    session,
    asyncRoute(async (req, res) => {
      const { user, session: issued } = sessions.rotateSession({
        token: req.cookies?.[REFRESH_COOKIE],
        req,
      });
      setRefreshCookie(res, config, {
        token: issued.refreshToken,
        expiresAt: issued.refreshExpiresAt,
      });
      res.set('Cache-Control', 'no-store');
      res.json(sessionBody(user, issued));
    })
  );

  router.post(
    '/logout',
    sameOrigin,
    session,
    asyncRoute(async (req, res) => {
      sessions.revokeSession({ token: req.cookies?.[REFRESH_COOKIE] });
      clearRefreshCookie(res, config);
      res.status(204).end();
    })
  );

  router.get('/me', requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(req.user);
  });

  return router;
};

module.exports = {
  createAuthRouter,
  reasonFor,
  registerSchema,
  loginSchema,
  googleStartSchema,
};
