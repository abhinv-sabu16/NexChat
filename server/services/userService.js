/**
 * services/userService.js
 *
 * All user-related database operations.
 *
 * Consumers: REST auth routes, GraphQL resolvers, Socket.io handlers.
 * None of them import a User model directly — they call this service.
 */

import User from '../models/User.js';
import {
  ConflictError,
  NotFoundError,
  AuthenticationError,
  ValidationError,
} from '../lib/errors.js';
import { POPULATE } from '../lib/constants.js';

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Creates a new user account.
 *
 * @param {{ username: string, email: string, password: string, publicKey?: string }} params
 * @returns {Promise<import('mongoose').Document>} The newly created User document
 * @throws {ValidationError}  If required fields are missing or password is too short
 * @throws {ConflictError}    If username or email is already taken
 */
export async function registerUser({ username, email, password, publicKey = null }) {
  if (!username || !email || !password) {
    throw new ValidationError('username, email, and password are required.');
  }
  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters.');
  }

  const existing = await User.findOne({ $or: [{ email }, { username }] }).lean();
  if (existing) {
    throw new ConflictError('Username or email is already in use.');
  }

  const passwordHash = await User.hashPassword(password);

  return User.create({ username, email, passwordHash, publicKey, presence: 'online' });
}

// ─── Login ───────────────────────────────────────────────────────────────────

/**
 * Verifies credentials and returns the user document.
 * Generic error message on failure — avoids leaking whether the email exists.
 *
 * @param {{ email: string, password: string }} params
 * @returns {Promise<import('mongoose').Document>} Authenticated User document
 * @throws {ValidationError}      If required fields are missing
 * @throws {AuthenticationError}  If credentials are invalid
 */
export async function loginUser({ email, password }) {
  if (!email || !password) {
    throw new ValidationError('email and password are required.');
  }

  const user = await User.findOne({ email });
  if (!user) throw new AuthenticationError('Invalid credentials.');

  const valid = await user.verifyPassword(password);
  if (!valid) throw new AuthenticationError('Invalid credentials.');

  // Update presence on login
  await User.findByIdAndUpdate(user._id, { presence: 'online' });

  return user;
}

// ─── Presence ─────────────────────────────────────────────────────────────────

/**
 * Sets a user's presence status.
 *
 * @param {string} userId
 * @param {'online'|'away'|'offline'} presence
 */
export async function setPresence(userId, presence) {
  await User.findByIdAndUpdate(userId, { presence });
}

// ─── Lookups ──────────────────────────────────────────────────────────────────

/**
 * Fetches a user by ID. Throws NotFoundError if absent.
 *
 * @param {string} userId
 * @param {string} [fields] - Mongoose projection string (defaults to public fields)
 * @returns {Promise<object>} Lean user document
 */
export async function getUserById(userId, fields = POPULATE.USER_PUBLIC) {
  const user = await User.findById(userId).select(fields).lean();
  if (!user) throw new NotFoundError('User');
  return user;
}

/**
 * Returns whether a specific socket ID is the last active connection
 * for a given user. Used to decide whether to mark a user as offline
 * on disconnect without requiring Redis.
 *
 * @param {import('socket.io').Server} io
 * @param {string} disconnectingSocketId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function isLastSocketForUser(io, disconnectingSocketId, userId) {
  const sockets = await io.fetchSockets();
  return !sockets.some(
    (s) => s.id !== disconnectingSocketId && s.user?._id.toString() === userId.toString()
  );
}