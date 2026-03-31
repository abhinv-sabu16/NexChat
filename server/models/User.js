const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true, trim: true },
  email:        { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },

  // ECDH P-256 public key (JWK) — shared with other users to derive shared secrets
  // Private key NEVER leaves the client (stored in IndexedDB only)
  publicKey: { type: Object },

  avatar:      String,
  displayName: String,
  bio:         String,

  status:   { type: String, enum: ['online', 'away', 'dnd', 'offline'], default: 'offline' },
  lastSeen: Date,

  rooms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Room' }],

  refreshTokens: [{
    token:     String,
    expiresAt: Date,
  }],

  isVerified:  { type: Boolean, default: false },
  isSuspended: { type: Boolean, default: false },
}, { timestamps: true });


module.exports = mongoose.model('User', UserSchema);