import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    description: {
      type: String,
      default: '',
      maxlength: 256,
    },
    /**
     * 'public'  → visible and joinable by any authenticated user
     * 'private' → invite-only (DMs, private group chats)
     */
    type: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    pinnedMessages: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model('Room', roomSchema);