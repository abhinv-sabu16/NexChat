/**
 * lib/constants.js
 *
 * Application-wide constants. Single source of truth for:
 *   - Mongoose populate projections (kept consistent across services)
 *   - Pagination limits
 *   - Cookie configuration
 *   - Timing constants
 *
 * Import what you need; never hardcode these values inline.
 */

// ─── Mongoose populate field selections ───────────────────────────────────────
// Kept here so adding/removing a field requires one change, not a grep.

export const POPULATE = {
  USER_PUBLIC:  'username publicKey presence',
  USER_SAFE:    'username presence',
  USER_CREATED: 'username',
  FILE_META:    'originalName mimeType sizeBytes s3Key encryptedFileKey',
};

// ─── Pagination ───────────────────────────────────────────────────────────────

export const PAGINATION = {
  MESSAGES_DEFAULT: 20,
  MESSAGES_MAX:     100,
};

// ─── Cookie configuration ─────────────────────────────────────────────────────

const IS_PROD = process.env.NODE_ENV === 'production';

// sameSite: 'none' + secure: true is required whenever the frontend and backend
// are on different origins (e.g. Vercel + Render, or localhost:5173 + localhost:4000).
// 'strict' or 'lax' both block cross-origin POST requests, which breaks the
// silent token refresh on page reload — the cookie is never sent by the browser.
// In dev, secure must be false (no HTTPS), so we use sameSite: 'none' only in
// prod where HTTPS is guaranteed; dev falls back to sameSite: 'lax' which works
// when both origins share the same hostname (localhost), just different ports.
export const REFRESH_TOKEN_COOKIE = {
  NAME: 'refreshToken',
  OPTIONS: {
    httpOnly: true,
    secure:   IS_PROD,                        // HTTPS only in prod (required for sameSite:none)
    sameSite: IS_PROD ? 'none' : 'lax',       // 'none' allows cross-origin in prod
    maxAge:   7 * 24 * 60 * 60 * 1000,        // 7 days in ms
  },
};

// ─── Timing ───────────────────────────────────────────────────────────────────

export const TYPING_TIMEOUT_MS = 3_000;

// ─── JWT ─────────────────────────────────────────────────────────────────────

export const JWT = {
  ACCESS_EXPIRY:  '15m',
  REFRESH_EXPIRY: '7d',
  ISSUER:         'nexchat',
};