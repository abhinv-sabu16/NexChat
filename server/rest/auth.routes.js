/**
 * rest/auth.routes.js
 *
 * REST-only endpoints for authentication.
 * GraphQL handles NO auth — this is the single entry point for JWTs.
 */

import { Router } from 'express';
import rateLimit  from 'express-rate-limit';
import User       from '../models/User.js';
import {
  signAccessToken,
  signRefreshToken,
} from '../middleware/auth.js';

export const authRouter = Router();

// ─── Rate limiting (auth endpoints are high-value attack targets) ─────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // 20 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

authRouter.use(authLimiter);

// ─── POST /api/auth/register ─────────────────────────────────────────────────

authRouter.post('/register', async (req, res) => {
  try {
    const { username, email, password, publicKey } = req.body;

    // Basic input validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'username, email, and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    // Duplicate check
    const exists = await User.findOne({ $or: [{ email }, { username }] }).lean();
    if (exists) {
      return res.status(409).json({ error: 'Username or email already in use.' });
    }

    // Hash password and persist
    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      username,
      email,
      passwordHash,
      publicKey: publicKey ?? null, // ECDH public key uploaded at registration
    });

    const accessToken  = signAccessToken(user._id);
    const refreshToken = signRefreshToken(user._id);

    // Refresh token in HTTP-only cookie — never exposed to JS
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(201).json({
      accessToken,
      user: user.toSafeObject(),
    });
  } catch (err) {
    console.error('[auth/register]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Generic message — don't leak whether the email exists
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const valid = await user.verifyPassword(password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Update presence
    await User.findByIdAndUpdate(user._id, { presence: 'online' });

    const accessToken  = signAccessToken(user._id);
    const refreshToken = signRefreshToken(user._id);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      accessToken,
      user: user.toSafeObject(),
    });
  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});