/**
 * server/index.js
 *
 * Application entry point.
 *
 * Bootstraps three layers in a single HTTP server:
 *   1. Express  → REST (auth + file uploads)
 *   2. Apollo   → GraphQL (data fetching)
 *   3. Socket.io → Real-time messaging
 *
 * Strict separation:
 *   - Auth    → REST only
 *   - Uploads → REST only
 *   - Data    → GraphQL only
 *   - Events  → Socket.io only
 */

import 'dotenv/config';
import http       from 'http';
import express    from 'express';
import cors       from 'cors';
import helmet     from 'helmet';
import rateLimit  from 'express-rate-limit';
import mongoose   from 'mongoose';
import cookieParser from 'cookie-parser';

import { ApolloServer }          from '@apollo/server';
import { expressMiddleware }     from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { makeExecutableSchema }  from '@graphql-tools/schema';
import { Server as SocketIOServer } from 'socket.io';

import { typeDefs }          from './graphql/schema.js';
import { userResolvers }     from './graphql/resolvers/userResolver.js';
import { roomResolvers }     from './graphql/resolvers/roomResolver.js';
import { messageResolvers }  from './graphql/resolvers/messageResolver.js';

import { authRouter }        from './rest/auth.routes.js';
import { fileRouter }        from './rest/file.routes.js';

import { registerChatSocket } from './sockets/chat.socket.js';
import { getUserFromToken, extractBearerToken } from './middleware/auth.js';

const PORT = process.env.PORT ?? 4000;

// ─── 1. Express app ───────────────────────────────────────────────────────────

const app = express();

app.use(helmet({
  // Apollo Studio / GraphQL playground needs this relaxed in dev
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
}));

app.use(cors({
  origin:      process.env.CLIENT_URL ?? 'http://localhost:3000',
  credentials: true,                // allow cookies (refresh token)
}));

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

// Global rate limit for all non-auth routes
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ─── 2. REST routes ───────────────────────────────────────────────────────────

app.use('/api/auth',  authRouter);
app.use('/api/files', fileRouter);

// ─── 3. HTTP server (shared with Socket.io) ───────────────────────────────────

const httpServer = http.createServer(app);

// ─── 4. Socket.io ────────────────────────────────────────────────────────────

const io = new SocketIOServer(httpServer, {
  cors: {
    origin:      process.env.CLIENT_URL ?? 'http://localhost:3000',
    credentials: true,
  },
  // Automatic reconnection with exponential backoff is handled client-side
});

registerChatSocket(io);

// ─── 5. Apollo Server (GraphQL) ───────────────────────────────────────────────

// Merge all resolvers; later keys override earlier ones for same type
const schema = makeExecutableSchema({
  typeDefs,
  resolvers: [userResolvers, roomResolvers, messageResolvers],
});

const apollo = new ApolloServer({
  schema,
  plugins: [
    // Graceful shutdown: drain HTTP server before closing Apollo
    ApolloServerPluginDrainHttpServer({ httpServer }),
  ],
  // Disable introspection and playground in production
  introspection: process.env.NODE_ENV !== 'production',
});

await apollo.start();

/**
 * Apollo context builder.
 * Runs on every GraphQL request.
 * Extracts the JWT from Authorization header and attaches the user.
 *
 * Resolvers check ctx.user and throw if authentication is required.
 */
app.use(
  '/graphql',
  expressMiddleware(apollo, {
    context: async ({ req }) => {
      const token = extractBearerToken(req.headers.authorization);
      const user  = await getUserFromToken(token);
      return { user }; // ctx.user is null for unauthenticated requests
    },
  })
);

// ─── 6. MongoDB ───────────────────────────────────────────────────────────────

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in environment.');

  await mongoose.connect(uri);
  console.log(`[db] Connected to MongoDB`);
}

// ─── 7. Boot ──────────────────────────────────────────────────────────────────

async function start() {
  await connectDB();

  httpServer.listen(PORT, () => {
    console.log(`[server] REST    → http://localhost:${PORT}/api`);
    console.log(`[server] GraphQL → http://localhost:${PORT}/graphql`);
    console.log(`[server] WS      → ws://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[boot] Fatal error:', err);
  process.exit(1);
});