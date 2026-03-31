import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
  {
    /**
     * Original filename (not sensitive, stored in plaintext for UX).
     */
    originalName: { type: String, required: true },
    mimeType:     { type: String, required: true },
    sizeBytes:    { type: Number, required: true },

    /**
     * S3 key of the encrypted blob.
     * The blob is the file bytes after AES-256-GCM encryption (client-side).
     * Without the encrypted file key below, this blob is useless.
     */
    s3Key: { type: String, required: true },

    /**
     * The per-file AES-256 key, itself encrypted with the ECDH shared key
     * of the sender and recipient. Stored as base64.
     * Only the two parties can decrypt this → two-layer scheme.
     */
    encryptedFileKey: { type: String, required: true },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model('File', fileSchema);