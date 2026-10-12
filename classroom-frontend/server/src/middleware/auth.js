'use strict';

/**
 * Authentication and authorization middleware.
 *
 * `requireAuth` re-reads the user on every request instead of trusting the JWT
 * claims alone, so a role change or a deleted account takes effect immediately
 * rather than when the access token happens to expire.
 */

const { ApiError, asyncRoute } = require('../errors');

const parseBearer = (req) => {
  const header = req.get?.('authorization') ?? '';
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!/^Bearer$/i.test(scheme ?? '') || !token) return null;
  return token.trim();
};

const createAuthMiddleware = ({ sessions, users }) => {
  const requireAuth = asyncRoute(async (req, res, next) => {
    const token = parseBearer(req);
    if (!token) throw ApiError.unauthorized();

    const claims = sessions.verifyAccessToken(token);
    const row = users.findById(Number(claims.sub));
    if (!row) throw ApiError.unauthorized('This account is no longer available.');

    req.user = users.toPublicUser(row);
    req.userRow = row;
    next();
  });

  const requireRole =
    (...roles) =>
    (req, res, next) => {
      if (!req.user) return next(ApiError.unauthorized());
      if (!roles.includes(req.user.role)) {
        return next(
          ApiError.forbidden(`Your role (${req.user.role}) is not allowed to perform this action.`)
        );
      }
      return next();
    };

  /**
   * CSRF defence for the cookie-authenticated endpoints (`/refresh`, `/logout`).
   * Browsers always attach `Origin` to cross-site requests, so a request whose
   * Origin is not allowlisted is rejected even though it carried a valid cookie.
   * (`SameSite` is the first line of defence; this is the second.)
   */
  const requireSameOrigin = (allowedOrigins) => (req, res, next) => {
    const origin = req.get?.('origin');
    if (!origin) return next(); // Non-browser clients do not send Origin.

    if (!allowedOrigins.has(origin)) {
      return next(ApiError.forbidden('This request did not come from an allowed origin.'));
    }
    return next();
  };

  return { requireAuth, requireRole, requireSameOrigin, parseBearer };
};

module.exports = { createAuthMiddleware, parseBearer };
