/**
 * graphql/schema.js
 */

export const typeDefs = /* GraphQL */ `

  scalar DateTime

  type User {
    id:        ID!
    username:  String!
    publicKey: String
    presence:  Presence!
  }

  enum Presence {
    online
    away
    offline
  }

  type Message {
    id:        ID!
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
    messages(limit: Int, before: String): [Message!]!
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
    encryptedFileKey: String!
    uploadedBy:       User!
    createdAt:        DateTime!
  }

  # ── Queries ───────────────────────────────────────────────────────────────────

  type Query {
    rooms: [Room!]!
    room(id: ID!): Room
    user(id: ID!): User
    me: User
    """Search users by username prefix — for the Add Member picker."""
    searchUsers(query: String!): [User!]!
  }

  # ── Mutations ─────────────────────────────────────────────────────────────────

  type Mutation {
    """Create a new room. Creator is automatically added as the first member."""
    createRoom(name: String!, description: String, type: RoomType): Room!

    """Add a member to a room. Only existing members can invite."""
    addMember(roomId: ID!, userId: ID!): Room!

    """Remove a member from a room."""
    removeMember(roomId: ID!, userId: ID!): Room!

    """Leave a room (removes self)."""
    leaveRoom(roomId: ID!): Boolean!
  }
`;