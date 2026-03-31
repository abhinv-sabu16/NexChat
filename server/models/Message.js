const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true,
  },
  sender: {
    _id:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    avatar:   String,
  },

  // ── Encrypted payload — server never sees plaintext ──
  encryptedContent: { type: String, required: true }, // AES-256-GCM ciphertext (Base64)
  iv:               { type: String, required: true }, // 96-bit IV (Base64)
  // GCM auth tag is embedded in the ciphertext by WebCrypto

  type:   { type: String, enum: ['text', 'file', 'image', 'system'], default: 'text' },
  status: { type: String, enum: ['sending', 'sent', 'delivered', 'read'], default: 'sent' },

  // File metadata — non-sensitive, stored plaintext for UI previews
  fileMetadata: {
    fileId:           String,
    name:             String,
    size:             Number,
    mimeType:         String,
    url:              String,    // CDN URL to the encrypted blob
    encryptedFileKey: String,    // AES file key encrypted with ECDH shared key
    fileKeyIv:        String,
  },

  // Reactions: { "👍": ["userId1", "userId2"], "🚀": ["userId3"] }
  reactions: { type: Map, of: [String], default: {} },

  readBy: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now },
  }],

  editedAt:  Date,
  deletedAt: Date, // soft delete
}, { timestamps: true });

MessageSchema.index({ roomId: 1, createdAt: -1 });
MessageSchema.index({ 'sender._id': 1, createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);