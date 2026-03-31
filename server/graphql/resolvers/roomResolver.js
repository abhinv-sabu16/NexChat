/**
 * graphql/resolvers/roomResolver.js
 *
 * Room queries and Room field resolvers.
 *
 * Auth guard:   requireAuth(ctx)         — from middleware/auth
 * DB access:    getRoomsForUser,
 *               getRoomById              — from services/roomService
 * Messages:     getMessages              — from services/messageService
 * Validation:   validate + schemas       — from lib/validators
 *
 * No model imports. No duplicated requireAuth definition.
 */

import { requireAuth }                        from '../../middleware/auth.js';
import { getRoomsForUser, getRoomById }       from '../../services/roomService.js';
import { getMessages }                        from '../../services/messageService.js';
import { validate, IdArgSchema, RoomMessagesArgsSchema } from '../../lib/validators.js';

export const roomResolvers = {
  Query: {
    /**
     * rooms → all public rooms + private rooms the caller belongs to.
     *
     * Auth:    required
     * Source:  roomService.getRoomsForUser
     */
    rooms: (_p, _a, ctx) => {
      requireAuth(ctx);
      return getRoomsForUser(ctx.user._id);
    },

    /**
     * room(id) → single room.
     * Private rooms enforce membership; will throw ForbiddenError if not a member.
     *
     * Auth:    required
     * Source:  roomService.getRoomById
     */
    room: async (_p, args, ctx) => {
      requireAuth(ctx);
      const { id } = validate(IdArgSchema, args);
      return getRoomById(id, ctx.user._id);
    },
  },

  // ─── Room field resolvers ─────────────────────────────────────────────────

  Room: {
    id: (parent) => (parent._id ?? parent.id).toString(),

    /**
     * messages — paginated history for this room.
     *
     * Delegates entirely to messageService.getMessages.
     * GraphQL args are validated with Zod before being passed down.
     * No auth re-check needed: the parent Room resolver already required auth.
     */
    messages: (parent, args) => {
      const { limit, before } = validate(RoomMessagesArgsSchema, args);
      return getMessages({ roomId: parent._id, limit, before });
    },

    // Populated fields — pass through as-is
    members:   (parent) => parent.members   ?? [],
    createdBy: (parent) => parent.createdBy,
  },
};