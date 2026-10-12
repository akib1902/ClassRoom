'use strict';

/**
 * Session service (README F1: "refresh tokens rotate on use and are revocable
 * on logout").
 *
 * - Access token: short-lived HS256 JWT, handed to the SPA and kept in memory.
 * - Refresh token: opaque random string, httpOnly cookie, stored only as a
 *   SHA-256 hash. Rotated on every use.
 * - Reuse detection: presenting an already-rotated token means it was stolen, so
 *   the entire token family is revoked instead of silently issuing a new pair.
 */

const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const { ApiError } = require('../errors');
const { randomToken, hashToken } = require('../lib/cookies');

const createSessionService = ({ config, users, refreshTokens }) => {
  const now = () => new Date();
  const iso = (date) => date.toISOString();

  const signAccessToken = (user) =>
    jwt.sign(
      { role: user.role, email: user.email, name: user.name },
      config.jwtSecret,
      {
        subject: String(user.id),
        expiresIn: config.accessTokenTtl,
        issuer: config.jwtIssuer,
        audience: config.jwtAudience,
        algorithm: 'HS256',
      }
    );

  const verifyAccessToken = (token) => {
    try {
      return jwt.verify(token, config.jwtSecret, {
        algorithms: ['HS256'],
        issuer: config.jwtIssuer,
        audience: config.jwtAudience,
      });
    } catch (error) {
      const expired = error?.name === 'TokenExpiredError';
      throw ApiError.unauthorized(
        expired ? 'Your session expired. Please sign in again.' : 'Invalid access token.',
        { code: expired ? 'token_expired' : 'token_invalid' }
      );
    }
  };

  const issueRefreshToken = ({ userId, familyId, req }) => {
    const token = randomToken(48);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(
      now().getTime() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000
    );

    refreshTokens.insert({
      userId,
      tokenHash,
      familyId,
      expiresAt: iso(expiresAt),
      userAgent: req?.get?.('user-agent') ?? null,
      ip: req?.ip ?? null,
      now: iso(now()),
    });

    return { token, tokenHash, expiresAt: iso(expiresAt) };
  };

  const buildSession = ({ user, refresh }) => ({
    accessToken: signAccessToken(user),
    accessTokenExpiresIn: config.accessTokenTtl,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  });

  return {
    verifyAccessToken,

    /** Fresh login (Google callback or password login). Starts a new family. */
    startSession: ({ user, req }) => {
      const refresh = issueRefreshToken({
        userId: user.id,
        familyId: crypto.randomUUID(),
        req,
      });
      return buildSession({ user, refresh });
    },

    /**
     * Exchanges a refresh token for a new pair. Throws 401 (and revokes the
     * family) when the token is unknown, expired, or replayed.
     */
    rotateSession: ({ token, req }) => {
      if (!token) throw ApiError.unauthorized('No session to refresh.', { code: 'refresh_missing' });

      const tokenHash = hashToken(token);
      const existing = refreshTokens.findByHash(tokenHash);

      if (!existing) {
        throw ApiError.unauthorized('Invalid session. Please sign in again.', {
          code: 'refresh_invalid',
        });
      }

      if (existing.revoked_at) {
        // Replay of a rotated token: assume theft and kill every sibling.
        const revoked = refreshTokens.revokeFamily({ familyId: existing.family_id, now: iso(now()) });
        console.warn(
          `[auth] refresh token reuse detected for user ${existing.user_id}; revoked ${revoked} token(s)`
        );
        throw ApiError.unauthorized('This session was revoked. Please sign in again.', {
          code: 'refresh_reuse',
        });
      }

      if (new Date(existing.expires_at).getTime() <= Date.now()) {
        refreshTokens.revoke({ tokenHash, now: iso(now()) });
        throw ApiError.unauthorized('Your session expired. Please sign in again.', {
          code: 'refresh_expired',
        });
      }

      const user = users.findById(existing.user_id);
      if (!user || !user.role) {
        refreshTokens.revokeFamily({ familyId: existing.family_id, now: iso(now()) });
        throw ApiError.unauthorized('This account is no longer available.', { code: 'user_missing' });
      }

      const refresh = issueRefreshToken({ userId: user.id, familyId: existing.family_id, req });
      refreshTokens.revoke({ tokenHash, replacedByHash: refresh.tokenHash, now: iso(now()) });

      return { user, session: buildSession({ user, refresh }) };
    },

    /** Logout — revokes the presented token's whole family (all devices stay put). */
    revokeSession: ({ token }) => {
      if (!token) return 0;
      const existing = refreshTokens.findByHash(hashToken(token));
      if (!existing) return 0;
      return refreshTokens.revokeFamily({ familyId: existing.family_id, now: iso(now()) });
    },

    signAccessToken,
  };
};

module.exports = { createSessionService };
