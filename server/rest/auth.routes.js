/**
 * rest/auth.routes.js
 *
 * REST-only authentication endpoints. No GraphQL — never.
 *
 * These handlers are intentionally thin: input arrives, userService is called,
 * response is sent. All business logic and DB access lives in userService.
 */

import { Router   } from 'express';
import rateLimit    from 'express-rate-limit';
import jwt          from 'jsonwebtoken';
import { registerUser, loginUser, getUserById } from '../services/userService.js';
import { signAccessToken, signRefreshToken }    from '../middleware/auth.js';
import { asyncHandler }                         from '../middleware/errorHandler.js';
import { validate, RegisterSchema, LoginSchema } from '../lib/validators.js';
import { REFRESH_TOKEN_COOKIE, JWT }             from '../lib/constants.js';
import { AuthenticationError }                   from '../lib/errors.js';

export const authRouter = Router();

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Auth endpoints are the highest-value brute-force targets

const authLimiter = rateLimit({
  windowMs:       15 * 60 * 1000, // 15 minutes
  max:            20,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many attempts. Please try again later.' },
});

authRouter.use(authLimiter);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setRefreshCookie(res, token) {
  res.cookie(
    REFRESH_TOKEN_COOKIE.NAME,
    token,
    REFRESH_TOKEN_COOKIE.OPTIONS
  );
}

// ─── POST /api/auth/register ─────────────────────────────────────────────────

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    // Zod validation at the boundary — throws ValidationError (→ 400) on failure
    const input = validate(RegisterSchema, req.body);

    const user = await registerUser(input);

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

    const user = await loginUser(input);

    setRefreshCookie(res, signRefreshToken(user._id));

    return res.status(200).json({
      accessToken: signAccessToken(user._id),
      user:        user.toSafeObject(),
    });
  })
);

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
/**
 * Exchanges a valid refresh token (HTTP-only cookie) for a new access token.
 * Implements token rotation: old refresh token is replaced with a new one.
 *
 * This is the only way clients obtain a new access token after the 15-min
 * access token expires — no credentials needed, just the cookie.
 */
authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE.NAME];

    if (!token) {
      throw new AuthenticationError('Refresh token is missing.');
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
        issuer: JWT.ISSUER,
      });
    } catch {
      // Clear the invalid cookie so the client is forced to log in again
      res.clearCookie(REFRESH_TOKEN_COOKIE.NAME, REFRESH_TOKEN_COOKIE.OPTIONS);
      throw new AuthenticationError('Refresh token is invalid or expired.');
    }

    // Verify the user still exists (handles deleted/suspended accounts)
    const user = await getUserById(payload.sub);

    // Token rotation: issue a fresh refresh token on every use
    setRefreshCookie(res, signRefreshToken(user._id));

    return res.status(200).json({
      accessToken: signAccessToken(user._id),
    });
  })
);

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
/**
 * Clears the refresh token cookie.
 * Access tokens are short-lived (15 min) and self-expire — no server-side
 * revocation needed at this scale.
 */
authRouter.post('/logout', (_req, res) => {
  res.clearCookie(REFRESH_TOKEN_COOKIE.NAME, REFRESH_TOKEN_COOKIE.OPTIONS);
  return res.status(200).json({ message: 'Logged out.' });
});