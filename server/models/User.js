import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const BCRYPT_COST = 12;

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 2,
      maxlength: 32,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    /**
     * ECDH P-256 public key (base64-encoded).
     * Used by other clients to derive a shared AES-256-GCM key.
     * The private key NEVER leaves the browser (stored in IndexedDB only).
     */
    publicKey: {
      type: String,
      default: null,
    },
    presence: {
      type: String,
      enum: ['online', 'away', 'offline'],
      default: 'offline',
    },
  },
  { timestamps: true }
);

// Never expose passwordHash over the wire
userSchema.methods.toSafeObject = function () {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    publicKey: this.publicKey,
    presence: this.presence,
  };
};

userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_COST);
userSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

export default mongoose.model('User', userSchema);