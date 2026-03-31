import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    /**
     * Encrypted content (AES-256-GCM ciphertext, base64-encoded).
     * The server stores and relays this — it cannot decrypt it.
     * Format: "<iv_base64>:<ciphertext_base64>"
     */
    content: {
      type: String,
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    /**
     * Optional: if this message carries an encrypted file attachment,
     * the File document id is stored here.
     */
    file: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      default: null,
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { timestamps: true }
);

// Index for efficient paginated room history queries
messageSchema.index({ room: 1, createdAt: -1 });

export default mongoose.model('Message', messageSchema);