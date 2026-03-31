/**
 * graphql/resolvers/index.js
 *
 * Merges all resolver maps into a single array for makeExecutableSchema.
 *
 * Import order matters when resolver maps share the same type key:
 * later entries override earlier ones. Currently there is no overlap,
 * so order is alphabetical for readability.
 *
 * Usage in apollo config:
 *   import { resolvers } from './graphql/resolvers/index.js';
 *   makeExecutableSchema({ typeDefs, resolvers });
 */

import { messageResolvers } from './messageResolver.js';
import { roomResolvers    } from './roomResolver.js';
import { userResolvers    } from './userResolver.js';

export const resolvers = [
  messageResolvers, // registers DateTime scalar — must come before types that use it
  roomResolvers,
  userResolvers,
];