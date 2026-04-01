/**
 * graphql/resolvers/userResolver.js
 */

import User from '../../models/User.js';

function requireAuth(ctx) {
  if (!ctx.user) throw new Error('Unauthorized: valid Bearer token required.');
}

export const userResolvers = {
  Query: {
    me: async (_parent, _args, ctx) => {
      requireAuth(ctx);
      return await User.findById(ctx.user._id).lean();
    },

    user: async (_parent, { id }, ctx) => {
      requireAuth(ctx);
      const user = await User.findById(id).lean();
      if (!user) throw new Error(`User ${id} not found.`);
      return user;
    },
  },

  User: {
    id: (parent) => parent._id?.toString() ?? parent.id,
  },
};