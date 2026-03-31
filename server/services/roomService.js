/**
 * services/roomService.js
 *
 * All room-related database operations.
 *
 * Consumers: GraphQL resolvers, Socket.io handlers, file routes.
 * No Room model imports outside this file.
 */

import Room from '../models/Room.js';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';
import { POPULATE } from '../lib/constants.js';

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Returns all rooms visible to a user:
 *   - All public rooms
 *   - Private rooms where the user is a member
 *
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function getRoomsForUser(userId) {
  return Room.find({
    $or: [
      { type: 'public' },
      { type: 'private', members: userId },
    ],
  })
    .populate('members',   POPULATE.USER_PUBLIC)
    .populate('createdBy', POPULATE.USER_CREATED)
    .lean();
}

/**
 * Returns a single room by ID, with members and creator populated.
 * Enforces membership check for private rooms.
 *
 * @param {string} roomId
 * @param {string} requestingUserId - Used for private room access check
 * @returns {Promise<object>} Lean room document
 * @throws {NotFoundError}  If room does not exist
 * @throws {ForbiddenError} If room is private and user is not a member
 */
export async function getRoomById(roomId, requestingUserId) {
  const room = await Room.findById(roomId)
    .populate('members',   POPULATE.USER_PUBLIC)
    .populate('createdBy', POPULATE.USER_CREATED)
    .lean();

  if (!room) throw new NotFoundError('Room');

  if (room.type === 'private') {
    const isMember = room.members.some(
      (m) => m._id.toString() === requestingUserId.toString()
    );
    if (!isMember) throw new ForbiddenError('You are not a member of this room.');
  }

  return room;
}

// ─── Membership guard ─────────────────────────────────────────────────────────

/**
 * Verifies that a user is a member of a room.
 * Used by Socket.io handlers and file routes before any action is taken.
 *
 * Returns the lean room document on success so callers can avoid a
 * second query if they need the room data.
 *
 * @param {string} roomId
 * @param {string} userId
 * @returns {Promise<object>} Lean room document
 * @throws {NotFoundError}  If room does not exist
 * @throws {ForbiddenError} If user is not a member
 */
export async function assertMembership(roomId, userId) {
  const room = await Room.findById(roomId).lean();
  if (!room) throw new NotFoundError('Room');

  const isMember = room.members.some(
    (m) => m.toString() === userId.toString()
  );
  if (!isMember) throw new ForbiddenError('You are not a member of this room.');

  return room;
}