# NexChat — Real-Time Encrypted Chat

WebSocket-based chat application with rooms, file sharing, and end-to-end encryption.

**Stack:** React · Node.js · Socket.io · MongoDB

---

## Architecture

```
client/                         server/
├── hooks/                      ├── index.js          ← Express + Socket.io
│   └── useChat.js              ├── middleware/
├── utils/                      │   ├── auth.js       ← JWT verification
│   └── crypto.js  ← E2EE      │   └── upload.js     ← Multer + S3
├── components/                 ├── models/
│   ├── ChatWindow.jsx          │   ├── Message.js
│   ├── RoomList.jsx            │   ├── Room.js
│   ├── MessageBubble.jsx       │   └── User.js
│   └── FileUpload.jsx          ├── routes/
└── App.jsx                     │   ├── auth.js
                                │   ├── rooms.js
                                │   └── files.js
                                └── utils/
                                    └── crypto.js
```

---

## Key Features

### Real-Time Messaging
- Persistent WebSocket connections via **Socket.io**
- Automatic reconnection with exponential backoff (max 5 retries)
- Presence system (online / away / offline) via socket lifecycle events
- Typing indicators with 3-second debounce
- Message reactions with live sync
- Read receipts

### Chat Rooms
- Public channels (#general, #engineering, etc.)
- Private DMs and group chats
- Persistent message history (50 messages on join, paginated)
- Pinned messages, room descriptions, member management
- Live member list with online status

### Real-Time Broadcasting
Messages are persisted to MongoDB and immediately broadcast to connected clients in the corresponding Socket.io room without polling.

```
Client send → Socket.io → Server → MongoDB insert
                                         ↓
                         io.to(room).emit('message:new')
                                         ↓
                              All room clients receive
```

*(Note: A MongoDB replica set is still recommended for transactions and future change stream implementations.)*

### End-to-End Encryption (E2EE)

Every message is encrypted **before** it leaves the browser. The server stores and
transmits only ciphertext — it cannot read message content.

**Protocol:**
1. On registration, each user generates an **ECDH P-256 key pair** in the browser
2. The public key is uploaded to the server; the private key is stored in **IndexedDB only**
3. When A messages B, A derives a **shared AES-256-GCM key** from:  
   `ECDH(A.privateKey, B.publicKey)` = `ECDH(B.privateKey, A.publicKey)`
4. Messages are encrypted with AES-256-GCM using a fresh 96-bit IV per message
5. Ciphertext is sent to the server → stored in MongoDB → relayed to recipient
6. Recipient decrypts using the same derived shared key

**File Encryption:**
Files use a two-layer scheme:
- A fresh random AES-256 key encrypts the file bytes
- That file key is itself encrypted with the ECDH shared key
- Both the encrypted file (on S3/CDN) and the encrypted file key (in MongoDB) are useless without the private key

```
AES-256-GCM key (random, per file) → encrypts → file bytes
         ↓
   Encrypted with ECDH shared key → stored in DB
```

### File Sharing
- Files encrypted client-side before upload
- Stored on S3-compatible storage (encrypted blob)
- Download → decrypt in browser → serve to user
- Metadata (name, size, type) stored in MongoDB
- Multipart upload support for large files

---

## Setup

### Prerequisites
- Node.js 18+
- MongoDB 6+ with replica set enabled
- Redis (optional, for scaling Socket.io across multiple nodes)

### Environment Variables

```bash
# server/.env
PORT=4000
MONGODB_URI=mongodb://localhost:27017/nexchat?replicaSet=rs0
JWT_SECRET=your-256-bit-secret
JWT_REFRESH_SECRET=your-refresh-secret
CLIENT_URL=http://localhost:3000
AWS_BUCKET=nexchat-files
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# client/.env
REACT_APP_SERVER_URL=http://localhost:4000
```

### Run locally

```bash
# Start MongoDB replica set (single node for dev)
mongod --replSet rs0 --dbpath ./data
# In mongo shell: rs.initiate()

# Install and start server
cd server && npm install && npm run dev

# Install and start client
cd client && npm install && npm start
```

### Docker Compose

```yaml
version: '3.9'
services:
  mongo:
    image: mongo:6
    command: --replSet rs0
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

  server:
    build: ./server
    ports:
      - "4000:4000"
    environment:
      - MONGODB_URI=mongodb://mongo:27017/nexchat?replicaSet=rs0
    depends_on:
      - mongo

  client:
    build: ./client
    ports:
      - "3000:3000"
    environment:
      - REACT_APP_SERVER_URL=http://localhost:4000

volumes:
  mongo_data:
```

---

## Scaling

For multi-node deployments, use **Socket.io Redis Adapter** to broadcast events
across server instances:

```js
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));
```

---

## Security Notes

- Passwords hashed with **bcrypt** (cost factor 12)
- JWT access tokens: 15-minute expiry
- JWT refresh tokens: 7-day expiry, stored in HTTP-only cookies
- Rate limiting on all REST endpoints
- Helmet.js HTTP security headers
- WebSocket connections require valid JWT in handshake auth
- File uploads validated by MIME type and capped at 50 MB
- Server-side: zero plaintext message storage — ciphertext only
