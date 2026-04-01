/**
 * rest/auth.routes.js
 */

import { Router   } from 'express';
import rateLimit    from 'express-rate-limit';
import jwt          from 'jsonwebtoken';
import { registerUser, loginUser, getUserById } from '../services/userService.js';
import { signAccessToken, signRefreshToken }    from '../middleware/auth.js';
import { verifyToken }                          from '../middleware/auth.js';
import { asyncHandler }                         from '../middleware/errorHandler.js';
import { validate, RegisterSchema, LoginSchema } from '../lib/validators.js';
import { REFRESH_TOKEN_COOKIE, JWT }             from '../lib/constants.js';
import { AuthenticationError }                   from '../lib/errors.js';
import User                                      from '../models/User.js';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many attempts. Please try again later.' },
});

authRouter.use(authLimiter);

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_TOKEN_COOKIE.NAME, token, REFRESH_TOKEN_COOKIE.OPTIONS);
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const input = validate(RegisterSchema, req.body);
    const user  = await registerUser(input);
    setRefreshCookie(res, signRefreshToken(user._id));
    return res.status(201).json({
      accessToken: signAccessToken(user._id),
      user:        user.toSafeObject(),
    });
  })
);

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = validate(LoginSchema, req.body);
    const user  = await loginUser(input);
    setRefreshCookie(res, signRefreshToken(user._id));
    return res.status(200).json({
      accessToken: signAccessToken(user._id),
      user:        user.toSafeObject(),
    });
  })
);

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE.NAME];
    if (!token) throw new AuthenticationError('Refresh token is missing.');

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET, { issuer: JWT.ISSUER });
    } catch {
      res.clearCookie(REFRESH_TOKEN_COOKIE.NAME, REFRESH_TOKEN_COOKIE.OPTIONS);
      throw new AuthenticationError('Refresh token is invalid or expired.');
    }

    const user = await getUserById(payload.sub);
    setRefreshCookie(res, signRefreshToken(user._id));
    return res.status(200).json({ accessToken: signAccessToken(user._id) });
  })
);

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(REFRESH_TOKEN_COOKIE.NAME, REFRESH_TOKEN_COOKIE.OPTIONS);
  return res.status(200).json({ message: 'Logged out.' });
});

// ─── PUT /api/auth/publicKey ──────────────────────────────────────────────────


authRouter.put(
  '/publicKey',
  verifyToken,
  asyncHandler(async (req, res) => {
    const { publicKey } = req.body;
    if (!publicKey || typeof publicKey !== 'string') {
      return res.status(400).json({ error: 'publicKey is required.' });
    }
    await User.findByIdAndUpdate(req.user._id, { publicKey });
    return res.status(200).json({ ok: true });
  })
);