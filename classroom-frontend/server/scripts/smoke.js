'use strict';

/**
 * HTTP smoke test for the auth API.
 *
 * Boots the real Express app on a loopback port and drives it with real HTTP
 * requests (`fetch`), so redirects, Set-Cookie handling, status codes and the
 * Google round-trip are exercised end to end. The Jest suite covers the
 * behaviour in-process; this script is for checking a running-like server,
 * including a genuine call to Google's token endpoint.
 *
 *   npm run smoke            # uses server/.env when present
 *   SMOKE_PORT=4123 npm run smoke
 *
 * Exit code is non-zero when any check fails.
 */

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const dotenv = require('dotenv');
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const configBase = require('../src/config');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

// Port 0 lets the OS pick a free port, so running this next to a dev server (or
// next to another smoke run) never fails with EADDRINUSE.
const REQUESTED_PORT = Number(process.env.SMOKE_PORT || 0);
let API = '';
const APP = 'http://127.0.0.1:5199';

let passed = 0;
let failed = 0;

const check = (label, expected, actual) => {
  if (String(expected) === String(actual)) {
    passed += 1;
    console.log(`  \u2713 ${label}`);
  } else {
    failed += 1;
    console.log(`  \u2717 ${label}\n      expected: ${expected}\n      actual:   ${actual}`);
  }
};

const contains = (label, needle, haystack) =>
  check(label, true, String(haystack ?? '').includes(needle));

/* --------------------------------- helpers -------------------------------- */

const jar = {
  cookies: new Map(),
  store(response) {
    const list = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
    for (const entry of list) {
      const [pair, ...attributes] = String(entry).split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const attrs = attributes.join(';').toLowerCase();
      if (!value || /max-age=0/.test(attrs) || /expires=thu, 01 jan 1970/.test(attrs)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, { value, attributes: attrs });
      }
    }
    return response;
  },
  header() {
    return [...this.cookies.entries()].map(([name, entry]) => `${name}=${entry.value}`).join('; ');
  },
};

const call = (pathname, { method = 'GET', body, origin, cookies, headers = {} } = {}) =>
  fetch(`${API}${pathname}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(origin ? { origin } : {}),
      ...(cookies ? { cookie: cookies } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

/* ---------------------------------- run ----------------------------------- */

const config = configBase.testConfig({
  apiOrigin: `http://127.0.0.1:${REQUESTED_PORT}`,
  appOrigin: APP,
  allowedOrigins: new Set([APP]),
  // Turn the real rate limits on: this script asserts them, unlike the Jest
  // suite which would otherwise trip over them.
  isTest: false,
  rateLimitDisabled: false,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  },
});

const db = createDb(':memory:');
const { app } = createApp({ config, db });

const server = app.listen(REQUESTED_PORT, '127.0.0.1', () => {
  // The redirect URI is derived from the origin the server actually bound to.
  const { port } = server.address();
  API = `http://127.0.0.1:${port}`;
  config.apiOrigin = API;
  config.google.redirectUri = `${API}${config.google.redirectPath}`;
});

server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `\nPort ${REQUESTED_PORT} is already in use — set SMOKE_PORT to pick another.\n`
      : `\nCould not start the smoke server: ${error.message}\n`
  );
  process.exit(1);
});

const main = async () => {
  // The server binds asynchronously; give the callback a tick to publish the port.
  while (!API) await new Promise((resolve) => setTimeout(resolve, 10));
  console.log(`\nClassroom auth API smoke test (${API})\n`);

  console.log('discovery');
  const health = await call('/api/health');
  check('GET /api/health -> 200', 200, health.status);
  contains(
    'health reports Google as configured',
    `"google":"${config.google.configured ? 'configured' : 'unconfigured'}"`,
    await health.text()
  );
  const providers = await readJson(await call('/api/auth/providers'));
  check('providers.google.enabled matches config', config.google.configured, providers.google.enabled);

  if (!config.google.configured) {
    console.log('\n  (Google credentials absent — skipping the redirect/callback checks.)');
  } else {
    console.log('\ngoogle sign-in start (PKCE)');
    const txJar = Object.create(jar);
    txJar.cookies = new Map();

    const start = txJar.store(await call('/api/auth/google/start?redirect=/subjects'));
    check('GET /api/auth/google/start -> 302', 302, start.status);

    const location = start.headers.get('location') ?? '';
    const googleUrl = new URL(location);
    contains('redirects to the Google authorization endpoint', 'accounts.google.com', googleUrl.origin);
    check('uses the S256 challenge method', 'S256', googleUrl.searchParams.get('code_challenge_method'));
    check('sends the redirect_uri registered for this server', `${API}/api/auth/google/callback`, googleUrl.searchParams.get('redirect_uri'));
    check('requests the openid scope', true, (googleUrl.searchParams.get('scope') ?? '').includes('openid'));
    check('code_challenge is a 43-char base64url digest', 43, (googleUrl.searchParams.get('code_challenge') ?? '').length);
    check('never sends the verifier to the browser', false, location.includes('code_verifier'));
    const txCookie = txJar.cookies.get('classroom_oauth');
    check('sets the httpOnly transaction cookie', true, Boolean(txCookie?.attributes.includes('httponly')));

    const state = googleUrl.searchParams.get('state');

    console.log('\ngoogle callback rejection paths');
    const noCookie = await call(`/api/auth/google/callback?code=x&state=${state}`);
    contains('missing transaction cookie -> oauth_state', 'reason=oauth_state', noCookie.headers.get('location'));
    const badState = await call(`/api/auth/google/callback?code=x&state=wrong`, { cookies: txJar.header() });
    contains('state mismatch -> oauth_state', 'reason=oauth_state', badState.headers.get('location'));
    const denied = await call(`/api/auth/google/callback?error=access_denied&state=${state}`, { cookies: txJar.header() });
    contains('user cancelled -> google_denied', 'reason=google_denied', denied.headers.get('location'));

    console.log('\ngoogle callback against the real token endpoint');
    const freshJar = Object.create(jar);
    freshJar.cookies = new Map();
    const freshStart = freshJar.store(await call('/api/auth/google/start?redirect=/subjects'));
    const freshState = new URL(freshStart.headers.get('location')).searchParams.get('state');
    const exchange = await call(`/api/auth/google/callback?code=definitely-not-a-real-code&state=${freshState}`, {
      cookies: freshJar.header(),
    });
    const reason = new URL(exchange.headers.get('location')).searchParams.get('reason');
    console.log(`      Google answered -> ${exchange.status} ${reason}`);
    check('a real (invalid) code is rejected without creating a session', 'google_exchange_failed', reason);
    const issuedCookies = exchange.headers.getSetCookie?.() ?? [];
    check('no session cookie was issued', false, issuedCookies.some((entry) => /^classroom_rt=[^;]/.test(entry)));
  }

  console.log('\npassword session lifecycle');
  const sessionJar = Object.create(jar);
  sessionJar.cookies = new Map();

  const registered = sessionJar.store(
    await call('/api/auth/register', {
      method: 'POST',
      body: { name: 'Ada Student', email: 'ada@university.edu', password: 'correct-horse-1', role: 'admin' },
    })
  );
  const registerBody = await readJson(registered);
  check('POST /api/auth/register -> 201', 201, registered.status);
  check('the client-supplied role is ignored', 'student', registerBody.user.role);
  check('the password hash is never returned', false, JSON.stringify(registerBody).includes('password_hash'));
  check('an access token is returned in the body', true, typeof registerBody.accessToken === 'string');

  const me = await call('/api/auth/me', { headers: { authorization: `Bearer ${registerBody.accessToken}` } });
  check('GET /api/auth/me with a bearer token -> 200', 200, me.status);
  check('me without a token -> 401', 401, (await call('/api/auth/me')).status);

  const rotated = sessionJar.store(
    await call('/api/auth/refresh', { method: 'POST', body: {}, origin: APP, cookies: sessionJar.header() })
  );
  const rotatedBody = await readJson(rotated);
  check('POST /api/auth/refresh -> 200', 200, rotated.status);
  check('refresh keeps the refresh token out of the body', false, JSON.stringify(rotatedBody).includes('refreshToken'));
  check('the refresh cookie is rotated', true, Boolean(sessionJar.cookies.get('classroom_rt')?.value));

  const foreignOrigin = await call('/api/auth/refresh', {
    method: 'POST',
    body: {},
    origin: 'https://evil.example.com',
    cookies: sessionJar.header(),
  });
  check('refresh from a foreign origin -> 403', 403, foreignOrigin.status);

  console.log('\nlogout');
  const loggedOut = sessionJar.store(await call('/api/auth/logout', { method: 'POST', body: {}, origin: APP, cookies: sessionJar.header() }));
  check('POST /api/auth/logout -> 204', 204, loggedOut.status);
  const afterLogout = await call('/api/auth/refresh', { method: 'POST', body: {}, origin: APP, cookies: sessionJar.header() });
  check('refresh after logout -> 401', 401, afterLogout.status);

  console.log('\npassword policy and enumeration');
  const weak = await call('/api/auth/register', { method: 'POST', body: { name: 'Bob', email: 'bob@university.edu', password: 'short' } });
  check('weak password -> 400', 400, weak.status);
  const weakBody = await readJson(weak);
  contains('the failing field is named', 'password', JSON.stringify(weakBody.errors));

  const duplicate = await call('/api/auth/register', {
    method: 'POST',
    body: { name: 'Ada Student', email: 'ada@university.edu', password: 'correct-horse-1' },
  });
  check('duplicate email -> 409', 409, duplicate.status);
  check('the duplicate message does not confirm the account', false, /already|exists/i.test((await readJson(duplicate)).message));

  const goodLogin = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'ada@university.edu', password: 'correct-horse-1' },
  });
  check('correct password -> 200', 200, goodLogin.status);

  const wrongPassword = await readJson(
    await call('/api/auth/login', { method: 'POST', body: { email: 'ada@university.edu', password: 'nope-nope-nope-1' } })
  );
  const unknownUser = await readJson(
    await call('/api/auth/login', { method: 'POST', body: { email: 'ghost@university.edu', password: 'nope-nope-nope-1' } })
  );
  check('unknown user and wrong password look identical', JSON.stringify(wrongPassword), JSON.stringify(unknownUser));

  console.log('\nrate limiting');
  let limited = false;
  for (let i = 0; i < 14 && !limited; i += 1) {
    const attempt = await call('/api/auth/login', {
      method: 'POST',
      body: { email: 'spray@university.edu', password: 'not-the-password-1' },
    });
    if (attempt.status === 429) limited = true;
  }
  check('repeated failed logins -> 429', true, limited);

  console.log('\nhardening headers');
  const headers = (await call('/api/health')).headers;
  check('x-powered-by is not advertised', null, headers.get('x-powered-by'));
  check('a content-security-policy is set', true, Boolean(headers.get('content-security-policy')));

  // The Google half needs credentials; `.finally` still prints the summary.
  if (!config.google.configured) return undefined;

  // The transaction cookie is HMAC-signed: tamper with it and the callback must
  // refuse rather than trust the payload.
  console.log('\ntamper resistance');
  const tamperJar = Object.create(jar);
  tamperJar.cookies = new Map();
  const tamperStart = tamperJar.store(await call('/api/auth/google/start'));
  const tamperState = new URL(tamperStart.headers.get('location')).searchParams.get('state');
  const honest = tamperJar.cookies.get('classroom_oauth').value;
  tamperJar.cookies.set('classroom_oauth', {
    value: `${honest.slice(0, -4)}${crypto.randomBytes(3).toString('base64url').slice(0, 4)}`,
    attributes: 'httponly',
  });
  const tampered = await call(`/api/auth/google/callback?code=x&state=${tamperState}`, { cookies: tamperJar.header() });
  contains('a tampered transaction cookie is refused', 'reason=oauth_state', tampered.headers.get('location'));

  return undefined;
};

main()
  .catch((error) => {
    failed += 1;
    console.error('\nUnexpected failure:', error);
  })
  .finally(async () => {
    server.close();
    db.close();
    console.log(`\nRESULT: ${passed} passed, ${failed} failed\n`);
    process.exit(failed === 0 ? 0 : 1);
  });
