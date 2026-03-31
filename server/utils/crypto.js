// server/utils/crypto.js
// Server-side helpers only — hashing, token generation.
// Message encryption/decryption happens exclusively on the client.

const crypto = require('crypto');

/** Generate a cryptographically random hex string (e.g. for invite codes) */
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Constant-time string comparison to prevent timing attacks */
function safeCompare(a, b) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

module.exports = { randomToken, safeCompare };