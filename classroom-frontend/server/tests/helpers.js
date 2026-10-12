'use strict';

/**
 * Test harness.
 *
 * The fake Google is deliberately adversarial-friendly: it issues **really
 * signed** RS256 ID tokens against a keypair this process generates, so the
 * production verifier runs unmocked (signature, iss, aud, exp, nonce). Tests
 * swap the claims to exercise each rejection path.
 */

const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const configBase = require('../src/config');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

const KID = 'test-signing-key';
const KID_TWO = 'other-signing-key';

const generateKey = (kid) => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  return { kid, privateKey, jwk: { ...jwk, kid, alg: 'RS256', use: 'sig' } };
};

const parseForm = (body) => {
  if (!body) return {};
  if (typeof body === 'string') return Object.fromEntries(new URLSearchParams(body));
  if (typeof body.entries === 'function') return Object.fromEntries(body.entries());
  if (Buffer.isBuffer(body)) return Object.fromEntries(new URLSearchParams(body.toString()));
  return { ...body };
};

const createTestContext = (overrides = {}) => {
  const config = configBase.testConfig(overrides);

  const primary = generateKey(KID);
  const secondary = generateKey(KID_TWO); // used to sign tokens we must reject
  const calls = { tokenRequests: [], jwksRequests: 0 };

  const defaultClaims = {
    iss: 'https://accounts.google.com',
    aud: config.google.clientId,
    sub: 'google-subject-1',
    email: 'student@university.edu',
    email_verified: true,
    name: 'Ada Student',
    picture: null,
    nonce: 'placeholder',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const state = {
    // Which key signs the next ID token, and which JWKS the API may fetch.
    signWith: primary,
    jwksKeys: [primary.jwk],
    tokenError: null,
    idTokenOverride: null,
  };

  // NOTE: do not pass `noTimestamp: true` — jsonwebtoken deletes an explicitly
  // supplied `iat` in that mode, which would make every token look "not yet
  // valid" and hide real verifier bugs.
  const signIdToken = (claims, { key = state.signWith } = {}) =>
    jwt.sign({ ...defaultClaims, ...claims }, key.privateKey, {
      algorithm: 'RS256',
      keyid: key.kid,
    });

  const fetchImpl = async (url, options = {}) => {
    const target = String(url);

    if (target === config.google.jwksUri) {
      calls.jwksRequests += 1;
      return new Response(JSON.stringify({ keys: state.jwksKeys }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' },
      });
    }

    if (target === config.google.tokenEndpoint) {
      calls.tokenRequests.push({
        body: parseForm(options.body),
        headers: options.headers ?? {},
        method: options.method,
      });

      if (state.tokenError) {
        return new Response(JSON.stringify(state.tokenError.body), {
          status: state.tokenError.status,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          access_token: 'ya29.fake-access-token',
          expires_in: 3599,
          scope: 'openid email profile',
          token_type: 'Bearer',
          id_token: state.idTokenOverride ?? signIdToken({ nonce: state.pendingNonce }),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    throw new Error(`Unexpected network call in test: ${target}`);
  };

  const db = createDb(':memory:');
  const { app, services } = createApp({ config, db, fetchImpl, logger: silentLogger });

  return {
    app,
    db,
    config,
    services,
    calls,
    keys: { primary, secondary },
    signIdToken,
    /**
     * Sets the exact token the next callback will verify. The nonce defaults to
     * the one this attempt minted, so a test only has to state the claim it is
     * actually exercising.
     */
    useIdToken: (claims, options) => {
      state.idTokenOverride = signIdToken({ nonce: state.pendingNonce, ...claims }, options);
    },
    useBrokenIdToken: (raw) => {
      state.idTokenOverride = raw;
    },
    /** Makes the fake token endpoint fail the way Google would. */
    failTokenEndpoint: (body, status = 400) => {
      state.tokenError = { body, status };
    },
    /** Lets the flow continue with a nonce the caller has injected. */
    setPendingNonce: (nonce) => {
      state.pendingNonce = nonce;
    },
    setJwksKeys: (keys) => {
      state.jwksKeys = keys;
    },
    resetIdToken: () => {
      state.idTokenOverride = null;
    },
    close: () => db.close(),
  };
};

const silentLogger = { error: () => {}, warn: () => {}, log: () => {}, info: () => {} };

/** Minimal cookie jar — supertest agents hide the values we need to assert on. */
const createJar = () => {
  const cookies = new Map();

  const store = (response) => {
    const header = response.headers['set-cookie'];
    const list = Array.isArray(header) ? header : header ? [header] : [];
    for (const entry of list) {
      const [pair, ...attributes] = String(entry).split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const expired =
        /max-age=0/i.test(attributes.join(';')) || /expires=thu, 01 jan 1970/i.test(attributes.join(';'));
      if (!value || expired) cookies.delete(name);
      else cookies.set(name, value);
    }
    return response;
  };

  return {
    store,
    get: (name) => cookies.get(name),
    set: (name, value) => cookies.set(name, value),
    delete: (name) => cookies.delete(name),
    header: () =>
      [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
    entries: () => new Map(cookies),
  };
};

/** Extracts the auth marker from a 302 back into the SPA. */
const authMarker = (response) => {
  const location = response.headers.location;
  const url = new URL(location);
  return {
    url,
    location,
    auth: url.searchParams.get('auth'),
    reason: url.searchParams.get('reason'),
    via: url.searchParams.get('via'),
    path: url.pathname,
  };
};

module.exports = { createTestContext, createJar, authMarker, silentLogger, parseForm, KID, KID_TWO };
