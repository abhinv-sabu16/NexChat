/**
 * graphql/resolvers/messageResolver.js
 *
 * Two responsibilities:
 *   1. Register the custom DateTime scalar (ISO-8601 ↔ JS Date)
 *   2. Normalise Message and File field shapes from Mongoose lean objects
 *
 * There are no Query resolvers here. Messages are always fetched through
 * a Room (room.messages field resolver in roomResolver) — not as top-level
 * queries. This keeps the schema clean and avoids unauthenticated access.
 *
 * No DB access. No model imports. No auth checks (parent Room already guarded).
 */

import { GraphQLScalarType, Kind } from 'graphql';

// ─── DateTime scalar ──────────────────────────────────────────────────────────

const DateTimeScalar = new GraphQLScalarType({
  name:        'DateTime',
  description: 'ISO-8601 date-time string (e.g. "2024-01-15T09:30:00.000Z")',

  // Outbound: Mongoose Date → ISO string sent to client
  serialize(value) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    throw new TypeError(`DateTime.serialize: expected Date or string, got ${typeof value}`);
  },

  // Inbound variable: ISO string from client → Date
  parseValue(value) {
    if (typeof value !== 'string') {
      throw new TypeError('DateTime.parseValue: expected a string');
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) throw new TypeError('DateTime.parseValue: invalid date string');
    return date;
  },

  // Inbound literal: date string in query document → Date
  parseLiteral(ast) {
    if (ast.kind !== Kind.STRING) {
      throw new TypeError(`DateTime.parseLiteral: expected StringValue, got ${ast.kind}`);
    }
    const date = new Date(ast.value);
    if (isNaN(date.getTime())) throw new TypeError('DateTime.parseLiteral: invalid date string');
    return date;
  },
});

// ─── Resolvers ────────────────────────────────────────────────────────────────

export const messageResolvers = {
  DateTime: DateTimeScalar,

  Message: {
    // Mongoose lean objects have _id; normalise to string id for GraphQL
    id:        (p) => (p._id ?? p.id).toString(),
    createdAt: (p) => p.createdAt,

    // Populated by messageService — pass through directly
    sender:    (p) => p.sender,
    room:      (p) => p.room,
    file:      (p) => p.file   ?? null,
    readBy:    (p) => p.readBy ?? [],
  },

  File: {
    id:         (p) => (p._id ?? p.id).toString(),
    uploadedBy: (p) => p.uploadedBy,
    createdAt:  (p) => p.createdAt,
  },
};