/**
 * middleware/auth.js
 *
 * JWT verification layer shared across all three transport layers:
 *
 *   REST      → verifyToken(req, res, next)   — Express middleware
 *   GraphQL   → buildApolloContext({ req })   — Apollo context builder
 *   Socket.io → socketAuthMiddleware(socket)  — Socket.io middleware
 *
 * All three call the same getUserFromToken() core. Zero duplication.
 */

import jwt  from 'jsonwebtoken';
import User from '../models/User.js';
import { AuthenticationError } from '../lib/errors.js';
import { JWT } from '../lib/constants.js';

// ─── Token extraction ─────────────────────────────────────────────────────────

/**
 * Pulls the raw token string from an "Authorization: Bearer <token>" header.
 * Returns null if the header is absent or malformed.
 */
export function extractBearerToken(authHeader) {
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim() || null;
  }
  return null;
}

// ─── Core verification ────────────────────────────────────────────────────────

/**
 * Verifies a raw JWT string and returns the corresponding User document.
 *
 * Returns null (does NOT throw) so that:
 *   - GraphQL resolvers can decide per-field whether auth is required
 *   - REST middleware can produce a proper 401 response
 *   - Socket middleware can reject the connection
 *
 * @param {string|null} token
 * @returns {Promise<object|null>} Lean user document or null
 */
export async function getUserFromToken(token) {
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: JWT.ISSUER,
    });
  } catch {
    // Expired, malformed, or tampered — caller decides what to do
    return null;
  }

  const user = await User.findById(payload.sub).lean();
  return user ?? null;
}

// ─── REST middleware ──────────────────────────────────────────────────────────

/**
 * Express middleware for protected REST routes.
 * Attaches req.user on success; sends 401 JSON on failure.
 */
export async function verifyToken(req, res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization);
    const user  = await getUserFromToken(token);

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err); // pass unexpected errors to the central error handler
  }
}

// ─── GraphQL context builder ──────────────────────────────────────────────────

/**
 * Apollo Server context function.
 * Attaches ctx.user (or null for unauthenticated requests).
 * Individual resolvers call requireAuth(ctx) for protected fields.
 *
 * @param {{ req: import('express').Request }} param0
 * @returns {Promise<{ user: object|null }>}
 */
export async function buildApolloContext({ req }) {
  const token = extractBearerToken(req.headers.authorization);
  const user  = await getUserFromToken(token);
  return { user };
}

/**
 * Guard used inside GraphQL resolvers.
 * Throws AuthenticationError (which Apollo serialises correctly) if unauthenticated.
 *
 * Usage:
 *   me: (_p, _a, ctx) => { requireAuth(ctx); return ... }
 */
export function requireAuth(ctx) {
  if (!ctx.user) throw new AuthenticationError();
}

// ─── Socket.io middleware ─────────────────────────────────────────────────────

/**
 * Socket.io connection middleware.
 * Token is expected in socket.handshake.auth.token.
 * Rejects the connection with a descriptive error if invalid.
 *
 * Usage:
 *   io.use(socketAuthMiddleware);
 */
export async function socketAuthMiddleware(socket, next) {
  try {
    const token = socket.handshake.auth?.token ?? null;
    const user  = await getUserFromToken(token);

    if (!user) {
      return next(new AuthenticationError('Invalid or missing socket auth token.'));
    }

    socket.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// ─── Token issuance ───────────────────────────────────────────────────────────

export function signAccessToken(userId) {
  return jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET, {
    expiresIn: JWT.ACCESS_EXPIRY,
    issuer:    JWT.ISSUER,
  });
}

export function signRefreshToken(userId) {
  return jwt.sign({ sub: String(userId) }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: JWT.REFRESH_EXPIRY,
    issuer:    JWT.ISSUER,
  });
}