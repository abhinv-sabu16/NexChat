/**
 * config/db.js
 *
 * MongoDB connection setup.
 * Extracted from index.js so boot orchestration stays clean.
 *
 * Requires a replica set (even rs0 single-node) for change stream support.
 * See setup instructions in .env.example.
 */

import mongoose from 'mongoose';

const MONGOOSE_OPTIONS = {
  // Let the driver pick the best server — avoids deprecated topology warnings
  serverSelectionTimeoutMS: 5_000,
};

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is not set.');

  mongoose.connection.on('disconnected', () =>
    console.warn('[db] MongoDB disconnected')
  );
  mongoose.connection.on('reconnected', () =>
    console.info('[db] MongoDB reconnected')
  );
  mongoose.connection.on('error', (err) =>
    console.error('[db] MongoDB error:', err.message)
  );

  await mongoose.connect(uri, MONGOOSE_OPTIONS);
  console.info(`[db] Connected → ${mongoose.connection.host}/${mongoose.connection.name}`);
}