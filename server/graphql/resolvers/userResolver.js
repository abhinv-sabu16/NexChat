/**
 * graphql/resolvers/userResolver.js
 *
 * Resolvers for User-related queries.
 * Auth is enforced via context.user (set by Apollo context builder in index.js).
 */

import User from '../../models/User.js';

// ─── Helper ───────────────────────────────────────────────────────────────────

function requireAuth(ctx) {
  if (!ctx.user) throw new Error('Unauthorized: valid Bearer token required.');
}

// ─── Resolvers ────────────────────────────────────────────────────────────────

export const userResolvers = {
  Query: {
    /**
     * me → returns the currently authenticated user.
     */
    me: (_parent, _args, ctx) => {
      requireAuth(ctx);
      return User.findById(ctx.user._id).lean();
    },

    /**
     * user(id) → fetch any user by ID.
     * Primary use-case: retrieve publicKey before deriving the ECDH shared key.
     */
    user: async (_parent, { id }, ctx) => {
      requireAuth(ctx);
      const user = await User.findById(id).lean();
      if (!user) throw new Error(`User ${id} not found.`);
      return user;
    },
  },

  // ─── Field resolvers (id normalisation) ─────────────────────────────────────
  User: {
    id: (parent) => parent._id?.toString() ?? parent.id,
  },
};