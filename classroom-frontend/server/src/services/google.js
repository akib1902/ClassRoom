'use strict';

/**
 * Google OAuth 2.0 client — authorization code flow with PKCE (RFC 7636).
 *
 * Two security-critical jobs live here:
 *
 * 1. `exchangeCodeForTokens` redeems the authorization code using the client
 *    secret *and* the PKCE verifier. The secret only ever touches this process;
 *    the browser never sees it (the reason the flow is server-initiated).
 * 2. `verifyIdToken` fully verifies the returned ID token before any account is
 *    created: RS256 signature against Google's JWKS, `iss`, `aud`, `exp`/`iat`
 *    with clock skew, and the `nonce` minted for this specific attempt. A
 *    decoded-but-unverified token is never trusted.
 */

const crypto = require('node:crypto');
const { ApiError } = require('../errors');

const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const CLOCK_SKEW_SECONDS = 60;
const DEFAULT_JWKS_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

const base64urlDecode = (value) => Buffer.from(value, 'base64url').toString('utf8');

const decodeJwt = (token) => {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) {
    throw ApiError.badRequest('Google returned a malformed ID token.', { code: 'google_id_token' });
  }
  let header;
  let payload;
  try {
    header = JSON.parse(base64urlDecode(parts[0]));
    payload = JSON.parse(base64urlDecode(parts[1]));
  } catch {
    throw ApiError.badRequest('Google returned a malformed ID token.', { code: 'google_id_token' });
  }
  return { header, payload, signingInput: Buffer.from(`${parts[0]}.${parts[1]}`), signature: parts[2] };
};

const secondsSinceEpoch = () => Math.floor(Date.now() / 1000);

const createGoogleClient = ({ config, fetchImpl = fetch, logger = console }) => {
  let jwksCache = { keys: new Map(), expiresAt: 0 };

  const fetchJwks = async ({ force = false } = {}) => {
    if (!force && jwksCache.expiresAt > Date.now() && jwksCache.keys.size > 0) {
      return jwksCache.keys;
    }

    let response;
    try {
      response = await fetchImpl(config.google.jwksUri, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      logger.error('[google] JWKS request failed', error);
      throw ApiError.unavailable('Could not reach Google to verify the sign-in. Please retry.');
    }

    if (!response.ok) {
      throw ApiError.unavailable('Could not reach Google to verify the sign-in. Please retry.');
    }

    const body = await response.json();
    const keys = new Map();
    for (const key of body.keys ?? []) {
      if (key?.kid) keys.set(key.kid, key);
    }
    if (keys.size === 0) {
      throw ApiError.unavailable('Google returned no usable signing keys. Please retry.');
    }

    // Google rotates keys; honour its cache hint but never longer than an hour.
    const cacheControl = response.headers?.get?.('cache-control') ?? '';
    const maxAgeMatch = /max-age=(\d+)/.exec(cacheControl);
    const ttl = maxAgeMatch
      ? Math.min(Number(maxAgeMatch[1]) * 1000, DEFAULT_JWKS_TTL_MS)
      : DEFAULT_JWKS_TTL_MS;

    jwksCache = { keys, expiresAt: Date.now() + ttl };
    return keys;
  };

  const verifySignature = async (header, signingInput, signature) => {
    if (header.alg !== 'RS256') {
      throw ApiError.badRequest('Google returned an ID token signed with an unexpected algorithm.', {
        code: 'google_id_token',
      });
    }

    let keys = await fetchJwks();
    let jwk = keys.get(header.kid);

    // A miss usually means Google rotated keys a moment ago — refetch once.
    if (!jwk) {
      keys = await fetchJwks({ force: true });
      jwk = keys.get(header.kid);
    }
    if (!jwk) {
      throw ApiError.badRequest('Google signed this token with an unknown key.', {
        code: 'google_id_token',
      });
    }

    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const valid = crypto.verify(
      'RSA-SHA256',
      signingInput,
      publicKey,
      Buffer.from(signature, 'base64url')
    );

    if (!valid) {
      throw ApiError.badRequest('Google ID token signature did not verify.', {
        code: 'google_id_token',
      });
    }
  };

  return {
    /** Step 1 of the flow — where the browser is sent. */
    buildAuthorizationUrl: ({ state, codeChallenge, nonce, loginHint, prompt = 'select_account' }) => {
      const url = new URL(config.google.authorizationEndpoint);
      url.searchParams.set('client_id', config.google.clientId);
      url.searchParams.set('redirect_uri', config.google.redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'openid email profile');
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('nonce', nonce);
      url.searchParams.set('prompt', prompt);
      url.searchParams.set('include_granted_scopes', 'true');
      if (loginHint) url.searchParams.set('login_hint', loginHint);
      return url.toString();
    },

    /** Step 2 — redeem the code (server-side, with the client secret). */
    exchangeCodeForTokens: async ({ code, codeVerifier }) => {
      const body = new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      });

      let response;
      try {
        response = await fetchImpl(config.google.tokenEndpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
          },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        logger.error('[google] token endpoint request failed', error);
        throw ApiError.unavailable('Google did not answer the token request. Please retry.');
      }

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.id_token) {
        // Log the provider's error server-side only — never echo it to a browser.
        logger.error('[google] token exchange rejected', {
          status: response.status,
          error: payload?.error,
          description: payload?.error_description,
        });
        throw ApiError.badRequest('Google rejected the sign-in attempt. Please try again.', {
          code: 'google_exchange_failed',
        });
      }

      return payload;
    },

    /** Step 3 — prove the ID token really is Google's, for this app, right now. */
    verifyIdToken: async ({ idToken, nonce }) => {
      const { header, payload, signingInput, signature } = decodeJwt(idToken);

      await verifySignature(header, signingInput, signature);

      const now = secondsSinceEpoch();

      if (!GOOGLE_ISSUERS.has(String(payload.iss))) {
        throw ApiError.badRequest('Google ID token has an unexpected issuer.', {
          code: 'google_id_token',
        });
      }
      if (payload.aud !== config.google.clientId) {
        throw ApiError.badRequest('Google ID token was issued for a different application.', {
          code: 'google_id_token',
        });
      }
      if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < now) {
        throw ApiError.badRequest('Google ID token has expired.', { code: 'google_id_token' });
      }
      if (typeof payload.iat !== 'number' || payload.iat - CLOCK_SKEW_SECONDS > now) {
        throw ApiError.badRequest('Google ID token is not valid yet.', { code: 'google_id_token' });
      }
      // `nonce` binds the token to this exact browser attempt, blocking replay
      // of a token captured from another session.
      if (!nonce || payload.nonce !== nonce) {
        throw ApiError.badRequest('Google ID token did not match this sign-in attempt.', {
          code: 'google_id_token',
        });
      }
      if (payload.email_verified !== true && payload.email_verified !== 'true') {
        throw ApiError.forbidden('Your Google address is not verified, so it cannot be used to sign in.');
      }

      const email = String(payload.email ?? '').trim().toLowerCase();
      if (!email || !payload.sub) {
        throw ApiError.badRequest('Google did not return an email address.', {
          code: 'google_id_token',
        });
      }

      const hostedDomain = payload.hd ? String(payload.hd).toLowerCase() : null;
      if (config.google.hostedDomains.length > 0 && !config.google.hostedDomains.includes(hostedDomain ?? '')) {
        throw ApiError.forbidden('This Google Workspace domain is not allowed to sign in.');
      }

      return {
        sub: String(payload.sub),
        email,
        emailVerified: true,
        name: String(payload.name ?? email.split('@')[0]).trim(),
        picture: payload.picture ? String(payload.picture) : null,
        hostedDomain,
      };
    },
  };
};

module.exports = { createGoogleClient, GOOGLE_ISSUERS, CLOCK_SKEW_SECONDS };
