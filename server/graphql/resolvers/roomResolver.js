/**
 * graphql/resolvers/roomResolver.js
 */

import { requireAuth } from '../../middleware/auth.js';
import {
  getRoomsForUser, getRoomById,
  createRoom, addMember, removeMember,
  leaveRoom, searchUsers,
} from '../../services/roomService.js';
import { getMessages } from '../../services/messageService.js';
import { validate, IdArgSchema, RoomMessagesArgsSchema } from '../../lib/validators.js';

export const roomResolvers = {
  Query: {
    rooms: (_p, _a, ctx) => {
      requireAuth(ctx.user); // ✅ FIXED
      return getRoomsForUser(ctx.user._id);
    },

    room: async (_p, args, ctx) => {
      requireAuth(ctx.user); // ✅ FIXED
      const { id } = validate(IdArgSchema, args);
      return getRoomById(id, ctx.user._id);
    },

    searchUsers: async (_p, { query }, ctx) => {
      requireAuth(ctx.user); // ✅ FIXED
      return searchUsers(query, ctx.user._id);
    },
  },

  Mutation: {
    createRoom: async (_p, args, ctx) => {
      requireAuth(ctx.user); // ✅ FIXED
      return createRoom(args, ctx.user._id);
    },

    addMember: async (_p, { roomId, userId }, ctx) => {
      requireAuth(ctx.user); // ✅ FIXED
      return addMember(roomId, userId, ctx.user._id);
    },

    removeMember: async (_p, { roomId, userId }, ctx) => {
      requireAuth(ctx.user); // ✅ FIXED
      return removeMember(roomId, userId, ctx.user._id);
    },

    leaveRoom: async (_p, { roomId }, ctx) => {
      requireAuth(ctx.user); // ✅ FIXED
      return leaveRoom(roomId, ctx.user._id);
    },
  },

  Room: {
    id: (parent) => (parent._id ?? parent.id).toString(),

    messages: (parent, args) => {
      const { limit, before } = validate(RoomMessagesArgsSchema, args);
      return getMessages({ roomId: parent._id, limit, before });
    },

    members: (parent) => parent.members ?? [],
    createdBy: (parent) => parent.createdBy,
  },
};