'use strict';

const crypto = require('node:crypto');
const request = require('supertest');

const { createTestContext, createJar, authMarker } = require('./helpers');

const START = '/api/auth/google/start';
const CALLBACK = '/api/auth/google/callback';
const APP_ORIGIN = 'http://localhost:5173';

/** Runs /start and hands back everything the callback needs. */
const beginGoogleSignIn = async (ctx, { query = '?redirect=/subjects', jar = createJar() } = {}) => {
  const response = await request(ctx.app).get(`${START}${query}`).set('Cookie', jar.header());
  jar.store(response);

  const location = response.headers.location ?? '';
  const url = location ? new URL(location) : null;

  if (url) ctx.setPendingNonce(url.searchParams.get('nonce'));

  return { response, url, jar };
};

const completeGoogleSignIn = async (ctx, { jar, code = 'auth-code-1', state }) =>
  request(ctx.app)
    .get(`${CALLBACK}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`)
    .set('Cookie', jar.header());

describe('Google sign-in — happy path', () => {
  let ctx;

  beforeEach(() => {
    ctx = createTestContext();
  });
  afterEach(() => ctx.close());

  it('redirects to Google with PKCE, state and nonce', async () => {
    const { response, url } = await beginGoogleSignIn(ctx);

    expect(response.status).toBe(302);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe(ctx.config.google.clientId);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe(
      `${ctx.config.apiOrigin}/api/auth/google/callback`
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(url.searchParams.get('nonce')).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    // `state` and `nonce` must be independent values.
    expect(url.searchParams.get('state')).not.toBe(url.searchParams.get('nonce'));
  });

  it('stores the verifier in an httpOnly cookie and never in the URL', async () => {
    const { response, url } = await beginGoogleSignIn(ctx);

    const cookie = (response.headers['set-cookie'] ?? []).find((entry) =>
      entry.startsWith('classroom_oauth=')
    );
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/httponly/i);
    expect(cookie).toMatch(/samesite=lax/i);

    // The raw verifier must not be recoverable from anything the browser sends
    // to Google.
    expect(url.toString()).not.toContain('code_verifier');
  });

  it('exchanges the code server-side with the verifier that matches the challenge', async () => {
    const { url, jar } = await beginGoogleSignIn(ctx);
    await completeGoogleSignIn(ctx, { jar, state: url.searchParams.get('state') });

    expect(ctx.calls.tokenRequests).toHaveLength(1);
    const { body, method, headers } = ctx.calls.tokenRequests[0];

    expect(method).toBe('POST');
    expect(headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(body.grant_type).toBe('authorization_code');
    expect(body.code).toBe('auth-code-1');
    expect(body.client_id).toBe(ctx.config.google.clientId);
    expect(body.client_secret).toBe(ctx.config.google.clientSecret);
    expect(body.redirect_uri).toBe(`${ctx.config.apiOrigin}/api/auth/google/callback`);

    const expectedChallenge = crypto
      .createHash('sha256')
      .update(body.code_verifier)
      .digest('base64url');
    expect(expectedChallenge).toBe(url.searchParams.get('code_challenge'));
  });

  it('creates the account, sets an httpOnly refresh cookie and returns to the SPA', async () => {
    const { url, jar } = await beginGoogleSignIn(ctx);
    const callback = await completeGoogleSignIn(ctx, { jar, state: url.searchParams.get('state') });

    expect(callback.status).toBe(302);
    const marker = authMarker(callback);
    expect(marker.location.startsWith(APP_ORIGIN)).toBe(true);
    expect(marker.path).toBe('/subjects');
    expect(marker.auth).toBe('success');
    expect(marker.via).toBe('google');
    // No token material may ride along in the redirect.
    expect(marker.location).not.toMatch(/access|token|code=/i);

    const refreshCookie = (callback.headers['set-cookie'] ?? []).find((entry) =>
      entry.startsWith('classroom_rt=')
    );
    expect(refreshCookie).toMatch(/httponly/i);
    expect(refreshCookie).toMatch(/path=\/api\/auth/i);

    // The one-shot transaction cookie is cleared on the way out.
    const clearedTx = (callback.headers['set-cookie'] ?? []).find((entry) =>
      entry.startsWith('classroom_oauth=')
    );
    expect(clearedTx).toMatch(/classroom_oauth=;|expires=/i);
  });

  it('provisions the user with a server-assigned role', async () => {
    const { url, jar } = await beginGoogleSignIn(ctx);
    await completeGoogleSignIn(ctx, { jar, state: url.searchParams.get('state') });

    const user = ctx.services.users.findByEmail('student@university.edu');
    expect(user.role).toBe('student');
    expect(user.email_verified).toBe(1);
    expect(user.google_sub).toBe('google-subject-1');
    expect(user.password_hash).toBeNull();
  });

  it('promotes accounts listed in ADMIN_EMAILS and ignores a client-supplied role', async () => {
    ctx.close();
    ctx = createTestContext({ adminEmails: ['ada.student@university.edu'] });

    // A client asking for admin must not get admin...
    const first = await beginGoogleSignIn(ctx, { query: '?redirect=/&role=admin' });
    ctx.useIdToken({ email: 'student@university.edu', sub: 'sub-student' });
    await completeGoogleSignIn(ctx, { jar: first.jar, state: first.url.searchParams.get('state') });
    expect(ctx.services.users.findByEmail('student@university.edu').role).toBe('student');

    // ...but the server-side bootstrap list does.
    const second = await beginGoogleSignIn(ctx);
    ctx.useIdToken({ email: 'ada.student@university.edu', sub: 'sub-admin', name: 'Ada Admin' });
    await completeGoogleSignIn(ctx, { jar: second.jar, state: second.url.searchParams.get('state') });
    expect(ctx.services.users.findByEmail('ada.student@university.edu').role).toBe('admin');
  });

  it('links a Google identity to an existing password account by verified email', async () => {
    const created = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'Ada Student', email: 'student@university.edu', password: 'correct-horse-1' });
    expect(created.status).toBe(201);

    const { url, jar } = await beginGoogleSignIn(ctx);
    await completeGoogleSignIn(ctx, { jar, state: url.searchParams.get('state') });

    const rows = ctx.db.prepare('SELECT * FROM users').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].google_sub).toBe('google-subject-1');
    expect(rows[0].password_hash).not.toBeNull();
  });

  it('issues a working session that /me and /refresh accept', async () => {
    const { url, jar } = await beginGoogleSignIn(ctx);
    const callback = await completeGoogleSignIn(ctx, { jar, state: url.searchParams.get('state') });
    jar.store(callback);

    const refreshed = await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', jar.header())
      .set('Origin', APP_ORIGIN)
      .send({});

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.user.email).toBe('student@university.edu');
    expect(typeof refreshed.body.accessToken).toBe('string');
    // The refresh token stays in the cookie — never in the body.
    expect(refreshed.body.refreshToken).toBeUndefined();
    jar.store(refreshed);

    const me = await request(ctx.app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('student');
    expect(me.headers['cache-control']).toMatch(/no-store/);
  });
});

describe('Google sign-in — rejected attempts', () => {
  let ctx;

  beforeEach(() => {
    ctx = createTestContext();
  });
  afterEach(() => ctx.close());

  const expectRejection = (callback, reason) => {
    expect(callback.status).toBe(302);
    const marker = authMarker(callback);
    expect(marker.path).toBe('/login');
    expect(marker.auth).toBe('error');
    expect(marker.reason).toBe(reason);
    // A failed attempt must never persist an account or a session.
    expect(ctx.db.prepare('SELECT COUNT(*) AS total FROM users').get().total).toBe(0);
    expect(ctx.db.prepare('SELECT COUNT(*) AS total FROM refresh_tokens').get().total).toBe(0);
  };

  it('rejects a callback with no transaction cookie', async () => {
    const callback = await request(ctx.app).get(`${CALLBACK}?code=auth-code-1&state=whatever`);
    expectRejection(callback, 'oauth_state');
  });

  it('rejects a state that does not match the transaction', async () => {
    const { url, jar } = await beginGoogleSignIn(ctx);
    expect(url.searchParams.get('state')).toBeTruthy();
    const callback = await completeGoogleSignIn(ctx, { jar, state: 'a-different-state-value' });
    expectRejection(callback, 'oauth_state');
  });

  it('rejects a tampered transaction cookie (HMAC mismatch)', async () => {
    const { url, jar } = await beginGoogleSignIn(ctx);
    const tampered = `${jar.get('classroom_oauth')}xx`;
    jar.set('classroom_oauth', tampered);

    const callback = await completeGoogleSignIn(ctx, { jar, state: url.searchParams.get('state') });
    expectRejection(callback, 'oauth_state');
  });

  it('handles the user cancelling the consent screen', async () => {
    const { url, jar } = await beginGoogleSignIn(ctx);
    const callback = await request(ctx.app)
      .get(`${CALLBACK}?error=access_denied&state=${url.searchParams.get('state')}`)
      .set('Cookie', jar.header());

    expectRejection(callback, 'google_denied');
  });

  it('maps a token-endpoint rejection to google_exchange_failed', async () => {
    const { url, jar } = await beginGoogleSignIn(ctx);
    ctx.failTokenEndpoint({ error: 'invalid_grant', error_description: 'Bad code' }, 400);

    const callback = await completeGoogleSignIn(ctx, { jar, state: url.searchParams.get('state') });
    expectRejection(callback, 'google_exchange_failed');
  });

  it('rejects an ID token signed by a key Google does not publish', async () => {
    const { url, jar } = await beginGoogleSignIn(ctx);
    ctx.useIdToken({}, { key: ctx.keys.secondary });

    const callback = await completeGoogleSignIn(ctx, { jar, state: url.searchParams.get('state') });
    expectRejection(callback, 'google_id_token');
  });

  it('rejects a structurally invalid ID token', async () => {
    const { url, jar } = await beginGoogleSignIn(ctx);
    ctx.useBrokenIdToken('not-a-jwt');

    const callback = await completeGoogleSignIn(ctx, { jar, state: url.searchParams.get('state') });
    expectRejection(callback, 'google_id_token');
  });

  it('rejects an ID token minted for a different client (aud)', async () => {
    const { url, jar } = await beginGoogleSignIn(ctx);
    ctx.useIdToken({ aud: 'someone-elses-client-id.apps.googleusercontent.com' });

    const callback = await completeGoogleSignIn(ctx, { jar, state: url.searchParams.get('state') });
    expectRejection(callback, 'google_id_token');
  });

  it('rejects an ID token from an unexpected issuer', async () => {
    const { url, jar } = await beginGoogleSignIn(ctx);
    ctx.useIdToken({ iss: 'https://evil.example.com' });

    const callback = await completeGoogleSignIn(ctx, { jar, state: url.searchParams.get('state') });
    expectRejection(callback, 'google_id_token');
  });

  it('rejects an expired ID token', async () => {
    const { url, jar } = await beginGoogleSignIn(ctx);
    const past = Math.floor(Date.now() / 1000) - 7200;
    ctx.useIdToken({ iat: past, exp: past + 3600 });

    const callback = await completeGoogleSignIn(ctx, { jar, state: url.searchParams.get('state') });
    expectRejection(callback, 'google_id_token');
  });

  it('rejects an ID token whose nonce does not match this attempt', async () => {
    const { url, jar } = await beginGoogleSignIn(ctx);
    ctx.useIdToken({ nonce: 'a-nonce-from-another-session' });

    const callback = await completeGoogleSignIn(ctx, { jar, state: url.searchParams.get('state') });
    expectRejection(callback, 'google_id_token');
  });

  it('rejects an unverified Google email address', async () => {
    const { url, jar } = await beginGoogleSignIn(ctx);
    ctx.useIdToken({ email_verified: false });

    const callback = await completeGoogleSignIn(ctx, { jar, state: url.searchParams.get('state') });
    expectRejection(callback, 'not_allowed');
  });

  it('rejects a Workspace domain outside the allowlist', async () => {
    ctx.close();
    ctx = createTestContext({ google: { hostedDomains: ['university.edu'] } });

    const { url, jar } = await beginGoogleSignIn(ctx);
    ctx.useIdToken({ hd: 'not-university.example' });

    const callback = await completeGoogleSignIn(ctx, { jar, state: url.searchParams.get('state') });
    expectRejection(callback, 'not_allowed');
  });

  it('never redirects to an origin outside the allowlist (open redirect)', async () => {
    const hostile = 'https://evil.example.com/steal';
    const { url, jar } = await beginGoogleSignIn(ctx, {
      query: `?redirect=${encodeURIComponent(hostile)}`,
    });

    const callback = await completeGoogleSignIn(ctx, { jar, state: url.searchParams.get('state') });

    expect(callback.status).toBe(302);
    const location = callback.headers.location;
    expect(location.startsWith(APP_ORIGIN)).toBe(true);
    expect(location).not.toContain('evil.example.com');
  });

  it('refuses to start when Google credentials are absent', async () => {
    ctx.close();
    ctx = createTestContext({ google: { configured: false, clientId: '', clientSecret: '' } });

    const response = await request(ctx.app).get(`${START}?redirect=/`);
    expect(response.status).toBe(302);
    const marker = authMarker(response);
    expect(marker.reason).toBe('google_unconfigured');

    const providers = await request(ctx.app).get('/api/auth/providers');
    expect(providers.body.google.enabled).toBe(false);
  });
});
