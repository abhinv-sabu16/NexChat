/**
 * graphql/schema.js
 *
 * All GraphQL type definitions.
 * Auth and file uploads are intentionally absent — they are REST-only.
 */

export const typeDefs = /* GraphQL */ `

  scalar DateTime

  # ── Enums ────────────────────────────────────────────────────────────────────

  enum Presence {
    online
    away
    offline
  }

  enum RoomType {
    public
    private
  }

  # ── Types ────────────────────────────────────────────────────────────────────

  type User {
    id:        ID!
    username:  String!
    """ECDH P-256 public key (base64). Null until key pair is generated client-side."""
    publicKey: String
    presence:  Presence!
  }

  type Message {
    id:      ID!
    """
    AES-256-GCM ciphertext in "iv:ciphertext" base64 format.
    The server stores and relays this opaque value — it cannot decrypt it.
    """
    content:   String!
    sender:    User!
    room:      Room
    file:      File
    readBy:    [User!]!
    createdAt: DateTime!
  }

  type Room {
    id:          ID!
    name:        String!
    description: String
    type:        RoomType!
    members:     [User!]!
    messages(
      """Number of messages to return. Default: 20. Max: 100."""
      limit: Int
      """Cursor-based pagination: return messages older than this ISO date."""
      before: String
    ): [Message!]!
    createdBy:   User!
    createdAt:   DateTime!
  }

  type File {
    id:           ID!
    originalName: String!
    mimeType:     String!
    sizeBytes:    Int!
    s3Key:        String!
    """Per-file AES-256 key encrypted with the ECDH shared key."""
    encryptedFileKey: String!
    uploadedBy:   User!
    createdAt:    DateTime!
  }

  # ── Queries ───────────────────────────────────────────────────────────────────

  type Query {
    """All public rooms, plus private rooms the caller belongs to."""
    rooms: [Room!]!

    """Single room by ID. Private rooms require membership."""
    room(id: ID!): Room

    """Fetch a user by ID. Primary use: retrieve publicKey for ECDH key agreement."""
    user(id: ID!): User

    """Search for users by username. Matches start of string, case-insensitive."""
    searchUsers(query: String!): [User!]!

    """The currently authenticated user."""
    me: User
  }

  type Mutation {
    """Create a new room. Defaults to public if not specified."""
    createRoom(name: String!, description: String, type: RoomType!): Room!

    """Add a user to a room. Requires admin (creator) privileges."""
    addMember(roomId: ID!, userId: ID!): Room!

    """Remove a user from a room. Requires admin (creator) privileges."""
    removeMember(roomId: ID!, userId: ID!): Room!

    """Leave a room."""
    leaveRoom(roomId: ID!): Room!
  }
`;