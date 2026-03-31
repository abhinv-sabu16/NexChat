const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');

const SALT_ROUNDS = 12;

function signAccess(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' });
}

function signRefresh(userId) {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, publicKey } = req.body;
    if (!username || !email || !password || !publicKey)
      return res.status(400).json({ error: 'All fields required' });

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(409).json({ error: 'Username or email already taken' });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ username, email, passwordHash, publicKey });

    const accessToken  = signAccess(user._id);
    const refreshToken = signRefresh(user._id);
    const expiresAt    = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    user.refreshTokens.push({ token: refreshToken, expiresAt });
    await user.save();

    res.status(201).json({
      accessToken, refreshToken,
      user: { _id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.isSuspended) return res.status(403).json({ error: 'Account suspended' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const accessToken  = signAccess(user._id);
    const refreshToken = signRefresh(user._id);
    const expiresAt    = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Prune expired refresh tokens, add new one
    user.refreshTokens = user.refreshTokens
      .filter((t) => t.expiresAt > new Date())
      .concat({ token: refreshToken, expiresAt });
    user.status = 'online';
    await user.save();

    res.json({
      accessToken, refreshToken,
      user: { _id: user._id, username: user.username, publicKey: user.publicKey },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Token required' });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user    = await User.findById(decoded.userId);
    const stored  = user?.refreshTokens.find((t) => t.token === refreshToken);

    if (!stored || stored.expiresAt < new Date())
      return res.status(401).json({ error: 'Invalid or expired refresh token' });

    res.json({ accessToken: signAccess(user._id) });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      await User.findByIdAndUpdate(decoded.userId, {
        $pull: { refreshTokens: { token: refreshToken } },
        status: 'offline',
        lastSeen: new Date(),
      });
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: true }); // always succeed
  }
});

module.exports = router;