/**
 * graphql/resolvers/roomResolver.js
 *
 * Resolvers for Room queries and nested field resolution.
 * Message history is delegated to messageService to avoid duplicate logic.
 */

import Room from '../../models/Room.js';
import { getMessages } from '../../services/messageService.js';

// ─── Helper ───────────────────────────────────────────────────────────────────

function requireAuth(ctx) {
  if (!ctx.user) throw new Error('Unauthorized: valid Bearer token required.');
}

// ─── Resolvers ────────────────────────────────────────────────────────────────

export const roomResolvers = {
  Query: {
    /**
     * rooms → all public rooms + private rooms the user belongs to.
     */
    rooms: async (_parent, _args, ctx) => {
      requireAuth(ctx);

      return Room.find({
        $or: [
          { type: 'public' },
          { type: 'private', members: ctx.user._id },
        ],
      })
        .populate('members',   'username publicKey presence')
        .populate('createdBy', 'username')
        .lean();
    },

    /**
     * room(id) → single room by ID.
     * Members are populated; messages are resolved by the Room.messages field resolver below.
     */
    room: async (_parent, { id }, ctx) => {
      requireAuth(ctx);

      const room = await Room.findById(id)
        .populate('members',   'username publicKey presence')
        .populate('createdBy', 'username')
        .lean();

      if (!room) throw new Error(`Room ${id} not found.`);

      // Access check: private rooms require membership
      if (
        room.type === 'private' &&
        !room.members.some((m) => m._id.toString() === ctx.user._id.toString())
      ) {
        throw new Error('Forbidden: you are not a member of this room.');
      }

      return room;
    },
  },

  // ─── Field resolvers ─────────────────────────────────────────────────────────

  Room: {
    id: (parent) => parent._id?.toString() ?? parent.id,

    /**
     * messages field resolver — delegates to messageService.
     * Accepts `limit` and `before` args for pagination.
     */
    messages: (parent, { limit = 20, before = null }) =>
      getMessages({ roomId: parent._id, limit, before }),
  },
};