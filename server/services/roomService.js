/**
 * services/roomService.js
 */

import Room from '../models/Room.js';
import User from '../models/User.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../lib/errors.js';
import { POPULATE } from '../lib/constants.js';

// ─── Shared populate helper ───────────────────────────────────────────────────

function populateRoom(query) {
  return query
    .populate('members',   POPULATE.USER_PUBLIC)
    .populate('createdBy', POPULATE.USER_CREATED);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getRoomsForUser(userId) {
  return populateRoom(
    Room.find({
      $or: [
        { type: 'public' },
        { type: 'private', members: userId },
      ],
    })
  ).lean();
}

export async function getRoomById(roomId, requestingUserId) {
  const room = await populateRoom(Room.findById(roomId)).lean();

  if (!room) throw new NotFoundError('Room');

  if (room.type === 'private') {
    const isMember = room.members.some(
      (m) => m._id.toString() === requestingUserId.toString()
    );
    if (!isMember) throw new ForbiddenError('You are not a member of this room.');
  }

  return room;
}

export async function assertMembership(roomId, userId) {
  const room = await Room.findById(roomId).lean();
  if (!room) throw new NotFoundError('Room');

  if (room.type !== 'public') {
    const isMember = room.members.some(
      (m) => m.toString() === userId.toString()
    );
    if (!isMember) throw new ForbiddenError('You are not a member of this room.');
  }

  return room;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Create a new room. Creator is automatically added as first member.
 */
export async function createRoom({ name, description = '', type = 'public' }, creatorId) {
  const trimmed = name?.trim();
  if (!trimmed) throw new Error('Room name is required.');
  if (trimmed.length > 64) throw new Error('Room name must be 64 characters or fewer.');

  const room = await Room.create({
    name:      trimmed,
    description,
    type,
    members:   [creatorId],
    createdBy: creatorId,
  });

  return populateRoom(Room.findById(room._id)).lean();
}

/**
 * Add a member to a room. Requester must already be a member.
 */
export async function addMember(roomId, userId, requestingUserId) {
  const room = await Room.findById(roomId);
  if (!room) throw new NotFoundError('Room');

  const requesterIsMember = room.members.some(
    (m) => m.toString() === requestingUserId.toString()
  );
  if (!requesterIsMember) throw new ForbiddenError('Only room members can add others.');

  const userExists = await User.findById(userId).lean();
  if (!userExists) throw new NotFoundError('User');

  const alreadyMember = room.members.some(
    (m) => m.toString() === userId.toString()
  );
  if (alreadyMember) throw new ConflictError('User is already a member of this room.');

  room.members.push(userId);
  await room.save();

  return populateRoom(Room.findById(roomId)).lean();
}

/**
 * Remove a member from a room. Requester must be a member.
 */
export async function removeMember(roomId, userId, requestingUserId) {
  const room = await Room.findById(roomId);
  if (!room) throw new NotFoundError('Room');

  const requesterIsMember = room.members.some(
    (m) => m.toString() === requestingUserId.toString()
  );
  if (!requesterIsMember) throw new ForbiddenError('You are not a member of this room.');

  room.members = room.members.filter(
    (m) => m.toString() !== userId.toString()
  );
  await room.save();

  return populateRoom(Room.findById(roomId)).lean();
}

/**
 * User leaves a room (removes themselves).
 */
export async function leaveRoom(roomId, userId) {
  const room = await Room.findById(roomId);
  if (!room) throw new NotFoundError('Room');

  room.members = room.members.filter(
    (m) => m.toString() !== userId.toString()
  );
  await room.save();
  return true;
}

/**
 * Search users by username prefix (case-insensitive). Excludes the requester.
 */
export async function searchUsers(query, excludeUserId) {
  if (!query?.trim()) return [];
  return User.find({
    username: { $regex: `^${query.trim()}`, $options: 'i' },
    _id:      { $ne: excludeUserId },
  })
    .select(POPULATE.USER_PUBLIC)
    .limit(10)
    .lean();
}