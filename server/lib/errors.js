/**
 * lib/errors.js
 *
 * Typed application errors with HTTP status codes baked in.
 *
 * Why: plain `new Error()` throws give the error handler no information
 * about what HTTP status to use, which forces scattered if/else logic.
 * Using typed subclasses lets the central handler map cleanly:
 *
 *   catch (err) {
 *     if (err instanceof AppError) res.status(err.statusCode).json(...)
 *     else res.status(500).json(...)
 *   }
 *
 * GraphQL resolvers throw the same errors — Apollo formats them automatically.
 * Socket handlers catch them and ack with { ok: false, error: err.message }.
 */

export class AppError extends Error {
  /**
   * @param {string} message   - Human-readable description
   * @param {number} statusCode - HTTP status code (used by REST error handler)
   * @param {string} [code]    - Machine-readable error code for clients
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name       = this.constructor.name;
    this.statusCode = statusCode;
    this.code       = code;
    // Preserve stack trace in V8 environments
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── 400 Bad Request ──────────────────────────────────────────────────────────

export class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

// ─── 401 Unauthorized ─────────────────────────────────────────────────────────

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required.') {
    super(message, 401, 'UNAUTHENTICATED');
  }
}

// ─── 403 Forbidden ────────────────────────────────────────────────────────────

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message, 403, 'FORBIDDEN');
  }
}

// ─── 404 Not Found ────────────────────────────────────────────────────────────

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found.`, 404, 'NOT_FOUND');
  }
}

// ─── 409 Conflict ────────────────────────────────────────────────────────────

export class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}