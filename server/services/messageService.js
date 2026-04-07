/**
 * services/messageService.js
 *
 * Single source of truth for all message database operations.
 *
 * Both GraphQL resolvers and Socket.io handlers import from here.
 * No Message or Room model is imported anywhere else for business logic.
 */

import Message from '../models/Message.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { POPULATE, PAGINATION } from '../lib/constants.js';
import { assertMembership } from './roomService.js';

// ─── Shared populate config ───────────────────────────────────────────────────
// Defined once here; both createMessage and getMessages use the same shape.

const MESSAGE_POPULATE = [
  { path: 'sender', select: POPULATE.USER_PUBLIC  },
  { path: 'file',   select: POPULATE.FILE_META    },
  // 'room' is populated so the GraphQL Room field resolver has a proper object.
  // 'readBy' is populated so User field resolvers can resolve id correctly.
  { path: 'room',   select: 'id name type'        },
  { path: 'readBy', select: 'id username'         },
];

// ─── createMessage ────────────────────────────────────────────────────────────

/**
 * Validates, persists, and returns a new message.
 *
 * E2EE contract: `content` is opaque ciphertext. This function stores and
 * returns it unchanged — the server never decrypts it.
 *
 * @param {object} params
 * @param {string}      params.content   - AES-256-GCM ciphertext ("iv:ct" base64)
 * @param {string}      params.senderId  - Sender's ObjectId
 * @param {string}      params.roomId    - Target room's ObjectId
 * @param {string|null} [params.fileId]  - Optional attached File ObjectId
 *
 * @returns {Promise<object>} Populated message document
 * @throws {ValidationError} If content or roomId are missing
 * @throws {NotFoundError}   If room does not exist
 * @throws {ForbiddenError}  If sender is not a room member
 */
export async function createMessage({ content, senderId, roomId, fileId = null }) {
  if (!content?.trim()) throw new ValidationError('Message content cannot be empty.');
  if (!roomId)          throw new ValidationError('roomId is required.');

  // Validates room exists + sender is a member (throws typed errors on failure)
  await assertMembership(roomId, senderId);

  const message = await Message.create({
    content,
    sender: senderId,
    room:   roomId,
    file:   fileId,
  });

  return message.populate(MESSAGE_POPULATE);
}

// ─── getMessages ──────────────────────────────────────────────────────────────

/**
 * Retrieves cursor-paginated message history for a room.
 *
 * @param {object} params
 * @param {string}      params.roomId  - Target room's ObjectId
 * @param {number}      [params.limit] - Max messages (default 20, max 100)
 * @param {string|null} [params.before]- ISO date cursor (return messages older than this)
 *
 * @returns {Promise<object[]>} Messages in ascending chronological order (oldest first)
 */
export async function getMessages({ roomId, limit = PAGINATION.MESSAGES_DEFAULT, before = null }) {
  const safeLimit = Math.min(Math.max(1, limit), PAGINATION.MESSAGES_MAX);

  const filter = { room: roomId };
  if (before) {
    const cursor = new Date(before);
    if (isNaN(cursor.getTime())) throw new ValidationError('`before` must be a valid ISO date string.');
    filter.createdAt = { $lt: cursor };
  }

  const messages = await Message.find(filter)
    .sort({ createdAt: -1 })  // newest first — we reverse below for display order
    .limit(safeLimit)
    .populate(MESSAGE_POPULATE)
    .lean();

  // Return oldest → newest for correct chat UI rendering
  return messages.reverse();
}

// ─── markRoomAsRead ───────────────────────────────────────────────────────────

/**
 * Marks all unread messages in a room as read by a user.
 * Uses $addToSet to avoid duplicate entries.
 *
 * @param {string} roomId
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function markRoomAsRead(roomId, userId) {
  await Message.updateMany(
    { room: roomId, readBy: { $ne: userId } },
    { $addToSet: { readBy: userId } }
  );
}