'use strict';

/**
 * HTTP error type + the single error handler every route funnels through.
 *
 * Response shape follows README §4 ("Reliability"): `{ statusCode, message, errors? }`.
 * Unknown errors never leak their message or stack to the client.
 */

class ApiError extends Error {
  constructor(statusCode, message, { code, errors, cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    if (errors) this.errors = errors;
    if (cause) this.cause = cause;
    this.expose = statusCode < 500;
  }

  static badRequest(message, options) {
    return new ApiError(400, message, options);
  }

  static unauthorized(message = 'Authentication required.', options) {
    return new ApiError(401, message, options);
  }

  static forbidden(message = 'Your role is not allowed to perform this action.', options) {
    return new ApiError(403, message, options);
  }

  static notFound(message = 'Resource not found.', options) {
    return new ApiError(404, message, options);
  }

  static conflict(message, options) {
    return new ApiError(409, message, options);
  }

  static unavailable(message, options) {
    return new ApiError(503, message, options);
  }
}

const notFoundHandler = (req, res) => {
  res.status(404).json({
    statusCode: 404,
    message: `No route matches ${req.method} ${req.path}.`,
  });
};

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
const errorHandler = (error, req, res, next) => {
  const statusCode = error instanceof ApiError ? error.statusCode : error.statusCode ?? 500;
  const expose = error instanceof ApiError ? error.expose : false;

  if (statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  }

  res.status(statusCode).json({
    statusCode,
    message: expose ? error.message : 'Something went wrong on our end.',
    ...(expose && error.code ? { code: error.code } : {}),
    ...(expose && error.errors ? { errors: error.errors } : {}),
  });
};

/** Wraps an async route so a rejected promise reaches the error handler. */
const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

module.exports = { ApiError, errorHandler, notFoundHandler, asyncRoute };
