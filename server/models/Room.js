const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  slug:        { type: String, unique: true, lowercase: true },
  type:        { type: String, enum: ['channel', 'dm', 'group'], default: 'channel' },
  description: String,
  avatar:      String,

  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admins:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  encryptionVersion: { type: Number, default: 1 },

  isPrivate:  { type: Boolean, default: false },
  isArchived: { type: Boolean, default: false },

  lastActivity:       Date,
  lastMessagePreview: { type: String, default: '[Encrypted message]' },

  pinnedMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
}, { timestamps: true });

RoomSchema.index({ members: 1 });

module.exports = mongoose.model('Room', RoomSchema);