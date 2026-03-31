/**
 * graphql/resolvers/messageResolver.js
 *
 * Resolvers for Message field normalization.
 * No standalone Query resolvers here — messages are always fetched
 * through a Room (room.messages), keeping the schema clean.
 *
 * Direct DB access goes through messageService exclusively.
 */

import { GraphQLScalarType, Kind } from 'graphql';

// ─── DateTime scalar ──────────────────────────────────────────────────────────

const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'ISO-8601 date-time string',

  serialize: (value) => {
    // MongoDB Date → ISO string
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    throw new Error('DateTime must be a Date or ISO string.');
  },

  parseValue: (value) => {
    // Input variable → Date
    if (typeof value === 'string') return new Date(value);
    throw new Error('DateTime variable must be an ISO string.');
  },

  parseLiteral: (ast) => {
    if (ast.kind === Kind.STRING) return new Date(ast.value);
    throw new Error('DateTime literal must be a string.');
  },
});

// ─── Resolvers ────────────────────────────────────────────────────────────────

export const messageResolvers = {
  // Register the custom scalar
  DateTime: DateTimeScalar,

  Message: {
    id:        (parent) => parent._id?.toString() ?? parent.id,
    createdAt: (parent) => parent.createdAt,

    // sender and file are already populated by messageService — pass through
    sender: (parent) => parent.sender,
    file:   (parent) => parent.file ?? null,

    // readBy is an array of User refs; resolve ids safely
    readBy: (parent) => parent.readBy ?? [],
  },

  File: {
    id:         (parent) => parent._id?.toString() ?? parent.id,
    uploadedBy: (parent) => parent.uploadedBy,
    createdAt:  (parent) => parent.createdAt,
  },
};