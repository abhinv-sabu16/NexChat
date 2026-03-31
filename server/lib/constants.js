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

export const REFRESH_TOKEN_COOKIE = {
  NAME: 'refreshToken',
  OPTIONS: {
    httpOnly: true,
    secure:   IS_PROD,
    sameSite: IS_PROD ? 'strict' : 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms
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