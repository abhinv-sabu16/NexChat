/**
 * services/messageService.js
 *
 * Single source of truth for all message-related database operations.
 * Both GraphQL resolvers and Socket.io handlers import from here.
 * No business logic lives outside this file.
 */

import Message from '../models/Message.js';
import Room    from '../models/Room.js';

// ─── createMessage ────────────────────────────────────────────────────────────

/**
 * Persists a new message to MongoDB.
 *
 * @param {object} params
 * @param {string} params.content    - AES-256-GCM ciphertext (base64, "iv:ct" format)
 * @param {string} params.senderId   - ObjectId of the sending user
 * @param {string} params.roomId     - ObjectId of the target room
 * @param {string} [params.fileId]   - Optional ObjectId of an attached File document
 *
 * @returns {Promise<object>} Populated message document (sender + file fields)
 */
export async function createMessage({ content, senderId, roomId, fileId = null }) {
  // 1. Verify room exists before inserting
  const roomExists = await Room.exists({ _id: roomId });
  if (!roomExists) {
    throw new Error(`Room ${roomId} not found.`);
  }

  // 2. Persist the message (content is ciphertext — server never decrypts)
  const message = await Message.create({
    content,
    sender: senderId,
    room:   roomId,
    file:   fileId,
  });

  // 3. Return populated document so callers get sender details immediately
  return message.populate([
    { path: 'sender', select: 'username publicKey presence' },
    { path: 'file',   select: 'originalName mimeType sizeBytes s3Key encryptedFileKey' },
  ]);
}

// ─── getMessages ──────────────────────────────────────────────────────────────

/**
 * Retrieves paginated message history for a room.
 *
 * @param {object} params
 * @param {string} params.roomId  - ObjectId of the room
 * @param {number} [params.limit] - Max messages to return (default: 20, max: 100)
 * @param {string} [params.before]- ISO date string; return messages older than this (cursor)
 *
 * @returns {Promise<object[]>} Messages in ascending chronological order
 */
export async function getMessages({ roomId, limit = 20, before = null }) {
  const safeLimit = Math.min(Math.max(1, limit), 100);

  const query = { room: roomId };

  // Cursor-based pagination: fetch messages older than `before` timestamp
  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  const messages = await Message.find(query)
    .sort({ createdAt: -1 })       // newest first for slicing
    .limit(safeLimit)
    .populate('sender', 'username publicKey presence')
    .populate('file',   'originalName mimeType sizeBytes s3Key encryptedFileKey')
    .lean();

  // Return in ascending order (oldest → newest) for correct chat rendering
  return messages.reverse();
}

// ─── markAsRead ───────────────────────────────────────────────────────────────

/**
 * Marks all messages in a room as read by a user.
 * Used for read receipts — does not need to return updated docs.
 *
 * @param {string} roomId
 * @param {string} userId
 */
export async function markRoomAsRead(roomId, userId) {
  await Message.updateMany(
    { room: roomId, readBy: { $ne: userId } },
    { $addToSet: { readBy: userId } }
  );
}