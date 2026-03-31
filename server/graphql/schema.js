/**
 * graphql/schema.js
 *
 * Single source for all GraphQL type definitions.
 * Auth and file uploads are intentionally absent — they live in REST.
 */

export const typeDefs = /* GraphQL */ `

  # ── Scalars ──────────────────────────────────────────────────────────────────

  scalar DateTime

  # ── Core types ───────────────────────────────────────────────────────────────

  type User {
    id:        ID!
    username:  String!
    publicKey: String     # ECDH P-256 public key (base64). Null until key pair generated.
    presence:  Presence!
  }

  enum Presence {
    online
    away
    offline
  }

  type Message {
    id:        ID!
    """
    AES-256-GCM ciphertext in "iv:ciphertext" base64 format.
    The server stores and relays this value — it cannot decrypt it.
    """
    content:   String!
    sender:    User!
    room:      Room!
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
      """Number of messages to return (default: 20, max: 100)"""
      limit: Int
      """Cursor: return messages older than this ISO date string"""
      before: String
    ): [Message!]!
    createdBy:   User!
    createdAt:   DateTime!
  }

  enum RoomType {
    public
    private
  }

  type File {
    id:               ID!
    originalName:     String!
    mimeType:         String!
    sizeBytes:        Int!
    s3Key:            String!
    """
    The per-file AES-256 key encrypted with the ECDH shared key.
    Only the two parties can decrypt this.
    """
    encryptedFileKey: String!
    uploadedBy:       User!
    createdAt:        DateTime!
  }

  # ── Queries ───────────────────────────────────────────────────────────────────

  type Query {
    """List all rooms the authenticated user is a member of (or all public rooms)."""
    rooms: [Room!]!

    """Fetch a single room by ID, including members and paginated messages."""
    room(id: ID!): Room

    """Fetch a user by ID (used to retrieve publicKey for key agreement)."""
    user(id: ID!): User

    """Fetch the currently authenticated user."""
    me: User
  }
`;