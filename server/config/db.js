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
import { AppError } from '../lib/errors.js';

const MONGOOSE_OPTIONS = {
  serverSelectionTimeoutMS: 5_000,
  // Automatically retry failed operations once (covers transient network blips)
  retryWrites: true,
  retryReads:  true,
};

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new AppError('MONGODB_URI environment variable is not set.', 500, 'CONFIG_ERROR');

  mongoose.connection.on('disconnected', () =>
    console.warn('[db] MongoDB disconnected — waiting for reconnect')
  );
  mongoose.connection.on('reconnected', () =>
    console.info('[db] MongoDB reconnected')
  );
  mongoose.connection.on('error', (err) =>
    console.error('[db] MongoDB connection error:', err.message)
  );

  await mongoose.connect(uri, MONGOOSE_OPTIONS);
  console.info(`[db] Connected → ${mongoose.connection.host}/${mongoose.connection.name}`);
}