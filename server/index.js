/**
 * server/index.js
 *
 * Application entry point — pure orchestration, nothing else.
 *
 * Each concern lives in its own module:
 *   Database     → config/db.js
 *   Apollo/GQL   → config/apollo.js
 *   Auth/JWT     → middleware/auth.js
 *   REST routes  → rest/*.routes.js
 *   Sockets      → sockets/chat.socket.js
 *   Errors       → middleware/errorHandler.js
 *
 * Three-layer architecture on one port:
 *   REST      →  /api/*
 *   GraphQL   →  /graphql
 *   Socket.io →  ws://  (same HTTP server, upgraded connection)
 */

import 'dotenv/config';
import http          from 'http';
import express       from 'express';
import cors          from 'cors';
import helmet        from 'helmet';
import rateLimit     from 'express-rate-limit';
import cookieParser  from 'cookie-parser';
import { Server as SocketIOServer } from 'socket.io';
import { expressMiddleware } from '@apollo/server/express4';

import { connectDB }            from './config/db.js';
import { createApolloServer, buildApolloContext } from './config/apollo.js';
import { authRouter }           from './rest/auth.routes.js';
import { fileRouter }           from './rest/file.routes.js';
import { registerChatSocket }   from './sockets/chat.socket.js';
import { errorHandler }         from './middleware/errorHandler.js';

const PORT   = process.env.PORT ?? 4000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── 1. Express ───────────────────────────────────────────────────────────────

const app = express();

app.use(helmet({
  // Relax CSP in development so Apollo Sandbox can load
  contentSecurityPolicy: IS_PROD,
}));

const ALLOWED_ORIGINS = new Set([
  process.env.CLIENT_URL,          // https://nex-chat-coral.vercel.app
  'http://localhost:5173',         // Vite dev server
  'http://localhost:3000',         // fallback
].filter(Boolean));

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin || ALLOWED_ORIGINS.has(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true, // Required for refresh-token cookie
}));

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

// Global rate limit — auth routes have their own stricter limiter on top
app.use(rateLimit({
  windowMs:        60 * 1_000,
  max:             300,
  standardHeaders: true,
  legacyHeaders:   false,
}));

// ─── 2. REST routes ───────────────────────────────────────────────────────────

app.use('/api/auth',  authRouter);
app.use('/api/files', fileRouter);

// ─── 3. HTTP + Socket.io server ───────────────────────────────────────────────

const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.has(origin)) callback(null, true);
      else callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  },
});

registerChatSocket(io);

// ─── 4. Apollo / GraphQL ──────────────────────────────────────────────────────
// Apollo must be started before registering the Express middleware.

const apollo = await createApolloServer(httpServer);

app.use(
  '/graphql',
  expressMiddleware(apollo, {
    // Injects { user } into GraphQL context on every request.
    // Resolvers call requireAuth(ctx) per-field — not enforced globally here.
    context: buildApolloContext,
  })
);

// ─── 5. Central error handler ─────────────────────────────────────────────────
// Must be registered AFTER all routes.

app.use(errorHandler);

// ─── 6. Boot ─────────────────────────────────────────────────────────────────

async function start() {
  await connectDB();

  httpServer.listen(PORT, () => {
    console.info(`[server] REST    → http://localhost:${PORT}/api`);
    console.info(`[server] GraphQL → http://localhost:${PORT}/graphql`);
    console.info(`[server] WS      → ws://localhost:${PORT}`);
    console.info(`[server] ENV     → ${process.env.NODE_ENV ?? 'development'}`);
  });
}

start().catch((err) => {
  console.error('[boot] Fatal error:', err);
  process.exit(1);
});