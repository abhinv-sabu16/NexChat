/**
 * middleware/errorHandler.js
 *
 * Central Express error-handling middleware.
 * Must be registered LAST (after all routes) in index.js.
 *
 * Catches every error passed to next(err) or thrown in async routes
 * (when wrapped with asyncHandler). Maps AppError subclasses to their
 * correct HTTP status codes; unknown errors default to 500.
 *
 * GraphQL errors are NOT handled here — Apollo formats them independently.
 */

import { AppError } from '../lib/errors.js';

const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * Wraps an async Express route handler so it calls next(err) automatically.
 * Eliminates try/catch boilerplate in every route.
 *
 * Usage:
 *   router.post('/login', asyncHandler(async (req, res) => { ... }))
 *
 * @param {Function} fn - Async route handler
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Express error handler — 4-argument signature is required by Express.
 *
 * @param {Error}                     err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  // Log every error server-side with method + path for traceability
  const label = `[${req.method} ${req.path}]`;

  if (err instanceof AppError) {
    // Known application error — log at warn level, respond with its status
    console.warn(`${label} ${err.name}: ${err.message}`);
    return res.status(err.statusCode).json({
      error: err.message,
      code:  err.code,
    });
  }

  // Unknown / unexpected error — always 500, log full stack
  console.error(`${label} Unhandled error:`, err);
  return res.status(500).json({
    error: IS_DEV ? err.message : 'Internal server error.',
    code:  'INTERNAL_ERROR',
    // Only include stack traces in development
    ...(IS_DEV && { stack: err.stack }),
  });
}