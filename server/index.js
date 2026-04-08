/**
 * server/index.js
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

const PORT    = process.env.PORT ?? 4000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── 1. Express ───────────────────────────────────────────────────────────────

const app = express();

// ── Trust proxy ───────────────────────────────────────────────────────────────
// Render sits behind a reverse proxy that injects X-Forwarded-For.
// Without this, express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// on every request. Apollo catches it and returns INTERNAL_SERVER_ERROR,
// which broke the `me` query and prevented auto-login on page reload.
// '1' = trust exactly one proxy hop (Render's load balancer).
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: IS_PROD,
}));

const ALLOWED_ORIGINS = new Set([
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.has(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

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
      if (!origin || ALLOWED_ORIGINS.has(origin) || origin.endsWith('.vercel.app')) callback(null, true);
      else callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  },
});

registerChatSocket(io);

// ─── 4. Apollo / GraphQL ──────────────────────────────────────────────────────

const apollo = await createApolloServer(httpServer);

app.use(
  '/graphql',
  expressMiddleware(apollo, {
    context: buildApolloContext,
  })
);

// ─── 5. Central error handler ─────────────────────────────────────────────────

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