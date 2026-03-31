const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Verifies a JWT and returns the user document.
 * Used by both REST routes (as Express middleware) and Socket.io.
 */
async function verifyToken(token) {
  if (!token || typeof token !== 'string') throw new Error('No token provided');
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.userId).select('-passwordHash -refreshTokens');
  if (!user || user.isSuspended) throw new Error('User not found or suspended');
  return user;
}

/** Express middleware wrapper */
async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    req.user = await verifyToken(header.slice(7));
    next();
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
}

module.exports = { verifyToken, authMiddleware };