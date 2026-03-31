import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const { JWT_SECRET } = process.env;

/**
 * Verifies a Bearer token and returns the user document.
 * Throws with a descriptive message on any failure.
 *
 * Used in two places:
 *   1. verifyToken(req, res, next)  → Express middleware for REST routes
 *   2. getUserFromToken(token)      → Apollo context builder for GraphQL
 */

// ─── Shared token extractor ──────────────────────────────────────────────────

export function extractBearerToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

// ─── Core verification (framework-agnostic) ───────────────────────────────────

export async function getUserFromToken(token) {
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return null; // expired or tampered — GraphQL resolvers check ctx.user
  }

  const user = await User.findById(payload.sub).lean();
  return user ?? null;
}

// ─── Express middleware ───────────────────────────────────────────────────────

/**
 * Protects REST routes.
 * Attaches req.user on success; responds 401 on failure.
 */
export async function verifyToken(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }

  const user = await getUserFromToken(token);

  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  req.user = user;
  next();
}

// ─── Token issuance helpers ───────────────────────────────────────────────────

/**
 * Issues a short-lived access token (15 min).
 */
export function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, {
    expiresIn: '15m',
    issuer: 'nexchat',
  });
}

/**
 * Issues a long-lived refresh token (7 days).
 * Should be stored in an HTTP-only cookie — handled in the auth route.
 */
export function signRefreshToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
    issuer: 'nexchat',
  });
}