const router = require('express').Router();
const User = require('../models/User');

// GET /api/users/:id/public-key — for ECDH key exchange
router.get('/:id/public-key', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'User not found (invalid ID)' });
    }
    const user = await User.findById(req.params.id).select('publicKey username');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ publicKeyJwk: user.publicKey, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
