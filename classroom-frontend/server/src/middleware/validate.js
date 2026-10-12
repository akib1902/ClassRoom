'use strict';

/**
 * Zod request validation. Invalid input becomes a 422 with field-level errors,
 * matching the `{ statusCode, message, errors? }` response contract.
 */

const { ApiError } = require('../errors');

const formatIssues = (issues) => {
  const errors = {};
  for (const issue of issues) {
    const key = issue.path.join('.') || '_';
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
};

const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    return next(
      ApiError.badRequest('Please correct the highlighted fields.', {
        code: 'validation_error',
        errors: formatIssues(result.error.issues),
      })
    );
  }
  req.body = result.data;
  return next();
};

const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query ?? {});
  if (!result.success) {
    return next(
      ApiError.badRequest('Invalid query parameters.', {
        code: 'validation_error',
        errors: formatIssues(result.error.issues),
      })
    );
  }
  req.validatedQuery = result.data;
  return next();
};

module.exports = { validateBody, validateQuery };
