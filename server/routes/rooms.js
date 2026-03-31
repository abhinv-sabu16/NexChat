const router = require('express').Router();
const mongoose = require('mongoose');
const Room   = require('../models/Room');
const User   = require('../models/User');

// GET /api/rooms — list rooms the user belongs to
router.get('/', async (req, res) => {
  try {
    const rooms = await Room.find({ members: req.user._id, isArchived: false })
      .select('name slug type description avatar members lastActivity lastMessagePreview')
      .sort({ lastActivity: -1 });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rooms — create a channel or group
router.post('/', async (req, res) => {
  try {
    const { name, type = 'channel', description, isPrivate = false, memberIds = [] } = req.body;
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const members = [req.user._id, ...memberIds];
    const room = await Room.create({
      name, slug, type, description, isPrivate,
      members, admins: [req.user._id],
    });

    // Add room to each member's rooms list
    await User.updateMany(
      { _id: { $in: members } },
      { $addToSet: { rooms: room._id } }
    );

    res.status(201).json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rooms/:id — room detail + members
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = mongoose.Types.ObjectId.isValid(id) 
      ? { _id: id, members: req.user._id }
      : { slug: id, members: req.user._id };

    const room = await Room.findOne(query)
      .populate('members', 'username avatar status lastSeen publicKey');
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rooms/:id/members — lightweight member list for presence UI
router.get('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, members: req.user._id }
      : { slug: id, members: req.user._id };

    const room = await Room.findOne(query)
      .populate('members', 'username displayName avatar status lastSeen');
    if (!room) return res.status(404).json({ error: 'Not found' });
    res.json(room.members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rooms/:id/invite — add members
router.post('/:id/invite', async (req, res) => {
  try {
    const { userIds } = req.body;
    const { id } = req.params;
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, admins: req.user._id }
      : { slug: id, admins: req.user._id };

    const room = await Room.findOne(query);
    if (!room) return res.status(403).json({ error: 'Not an admin or room not found' });

    await Room.findByIdAndUpdate(room._id, { $addToSet: { members: { $each: userIds } } });
    await User.updateMany({ _id: { $in: userIds } }, { $addToSet: { rooms: room._id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/rooms/:id/leave
router.delete('/:id/leave', async (req, res) => {
  try {
    const { id } = req.params;
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, members: req.user._id }
      : { slug: id, members: req.user._id };

    const room = await Room.findOne(query);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    await Room.findByIdAndUpdate(room._id, { $pull: { members: req.user._id } });
    await User.findByIdAndUpdate(req.user._id, { $pull: { rooms: room._id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id/public-key — for ECDH key exchange
router.get('/users/:id/public-key', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('publicKey username');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ publicKey: user.publicKey, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;