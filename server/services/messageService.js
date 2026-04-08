/**
 * services/messageService.js
 *
 * Single source of truth for all message database operations.
 */

import Message from '../models/Message.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { POPULATE, PAGINATION } from '../lib/constants.js';
import { assertMembership } from './roomService.js';

// ─── Shared populate config ───────────────────────────────────────────────────
const MESSAGE_POPULATE = [
  { path: 'sender', select: 'id username publicKey presence' },
  { path: 'file',   select: 'id originalName mimeType sizeBytes s3Key encryptedFileKey uploadedBy createdAt' },
  { path: 'room',   select: 'id name type members' },
  { path: 'readBy', select: 'id username' },
];

// ─── createMessage ────────────────────────────────────────────────────────────

/**
 * Validates, persists, and returns a new message.
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
  // Validation
  if (!content?.trim()) {
    throw new ValidationError('Message content cannot be empty.');
  }
  if (!roomId) {
    throw new ValidationError('roomId is required.');
  }
  if (!senderId) {
    throw new ValidationError('senderId is required.');
  }

  // Verify membership (throws if not a member)
  await assertMembership(roomId, senderId);

  try {
    // Create the message
    const message = await Message.create({
      content: content.trim(),
      sender: senderId,
      room: roomId,
      file: fileId || null,
      readBy: [], // Initialize empty readBy array
    });

    // Populate all fields before returning
    return message.populate(MESSAGE_POPULATE);
  } catch (err) {
    console.error('[messageService] createMessage error:', err);
    throw err;
  }
}

// ─── getMessages ──────────────────────────────────────────────────────────────

/**
 * Retrieves cursor-paginated message history for a room.
 *
 * @param {object} params
 * @param {string}      params.roomId  - Target room's ObjectId
 * @param {number}      [params.limit] - Max messages (default 50, max 100)
 * @param {string|null} [params.before]- ISO date cursor (return messages older than this)
 *
 * @returns {Promise<object[]>} Messages in ascending chronological order (oldest first)
 */
export async function getMessages({ roomId, limit = 50, before = null }) {
  if (!roomId) {
    throw new ValidationError('roomId is required');
  }

  const safeLimit = Math.min(Math.max(1, limit), PAGINATION.MESSAGES_MAX || 100);

  const filter = { room: roomId };
  
  // Handle cursor-based pagination
  if (before) {
    const cursor = new Date(before);
    if (isNaN(cursor.getTime())) {
      throw new ValidationError('`before` must be a valid ISO date string.');
    }
    filter.createdAt = { $lt: cursor };
  }

  try {
    // Fetch messages newest first, then reverse for display
    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .populate(MESSAGE_POPULATE)
      .lean();

    // Return oldest → newest for correct chat UI rendering
    return messages.reverse();
  } catch (err) {
    console.error('[messageService] getMessages error:', err);
    throw err;
  }
}

// ─── getMessageById ───────────────────────────────────────────────────────────

/**
 * NEW: Get a single message by ID with full population
 * Useful for verifying message creation
 */
export async function getMessageById(messageId) {
  if (!messageId) {
    throw new ValidationError('messageId is required');
  }

  const message = await Message.findById(messageId)
    .populate(MESSAGE_POPULATE)
    .lean();

  if (!message) {
    throw new NotFoundError('Message not found');
  }

  return message;
}

// ─── markRoomAsRead ───────────────────────────────────────────────────────────

/**
 * Marks all unread messages in a room as read by a user.
 *
 * @param {string} roomId
 * @param {string} userId
 * @returns {Promise<number>} Number of messages marked as read
 */
export async function markRoomAsRead(roomId, userId) {
  if (!roomId || !userId) {
    throw new ValidationError('roomId and userId are required');
  }

  try {
    const result = await Message.updateMany(
      { 
        room: roomId,
        readBy: { $ne: userId },
        sender: { $ne: userId } // Don't mark own messages as "read"
      },
      { $addToSet: { readBy: userId } }
    );

    return result.modifiedCount;
  } catch (err) {
    console.error('[messageService] markRoomAsRead error:', err);
    throw err;
  }
}

// ─── getUnreadCount ───────────────────────────────────────────────────────────

/**
 * NEW: Get count of unread messages in a room for a user
 */
export async function getUnreadCount(roomId, userId) {
  if (!roomId || !userId) {
    throw new ValidationError('roomId and userId are required');
  }

  try {
    const count = await Message.countDocuments({
      room: roomId,
      sender: { $ne: userId }, // Exclude own messages
      readBy: { $ne: userId }
    });

    return count;
  } catch (err) {
    console.error('[messageService] getUnreadCount error:', err);
    return 0;
  }
}

// ─── deleteMessage ────────────────────────────────────────────────────────────

/**
 * NEW: Delete a message (soft delete could be implemented here)
 */
export async function deleteMessage(messageId, userId) {
  if (!messageId || !userId) {
    throw new ValidationError('messageId and userId are required');
  }

  const message = await Message.findById(messageId);
  
  if (!message) {
    throw new NotFoundError('Message not found');
  }

  // Only sender or room admin can delete
  if (message.sender.toString() !== userId.toString()) {
    throw new ValidationError('You can only delete your own messages');
  }

  await Message.findByIdAndDelete(messageId);
  
  return { success: true };
}