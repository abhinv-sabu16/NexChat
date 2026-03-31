/**
 * rest/file.routes.js
 *
 * REST-only endpoint for file uploads.
 * Files arrive pre-encrypted from the browser (AES-256-GCM).
 * Server stores the encrypted blob on S3 and the encrypted file key in MongoDB.
 * No plaintext file content ever reaches the server.
 */

import { Router }      from 'express';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl }    from '@aws-sdk/s3-request-presigner';
import { upload, s3 }  from '../middleware/upload.js';
import { verifyToken } from '../middleware/auth.js';
import File            from '../models/Files.js';
import Room            from '../models/Room.js';

export const fileRouter = Router();

// All file routes require authentication
fileRouter.use(verifyToken);

// ─── POST /api/files/upload ───────────────────────────────────────────────────

/**
 * Expects multipart/form-data with:
 *   - file           : encrypted binary blob
 *   - roomId         : target room
 *   - encryptedFileKey: the per-file AES key, encrypted with ECDH shared key (base64)
 *   - originalName   : original filename (plaintext — for display only)
 *   - mimeType       : declared MIME type
 */
fileRouter.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { roomId, encryptedFileKey, originalName, mimeType } = req.body;

    // Input validation
    if (!roomId || !encryptedFileKey || !originalName || !mimeType) {
      return res.status(400).json({
        error: 'roomId, encryptedFileKey, originalName, and mimeType are required.',
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file received.' });
    }

    // Verify room exists and user is a member
    const room = await Room.findById(roomId).lean();
    if (!room) {
      return res.status(404).json({ error: 'Room not found.' });
    }
    const isMember = room.members.some(
      (m) => m.toString() === req.user._id.toString()
    );
    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this room.' });
    }

    // Persist file metadata (the encrypted blob is already on S3 via multer-s3)
    const file = await File.create({
      originalName,
      mimeType,
      sizeBytes:        req.file.size,
      s3Key:            req.file.key,       // set by multer-s3
      encryptedFileKey,
      uploadedBy:       req.user._id,
      room:             roomId,
    });

    return res.status(201).json({
      file: {
        id:               file._id,
        originalName:     file.originalName,
        mimeType:         file.mimeType,
        sizeBytes:        file.sizeBytes,
        s3Key:            file.s3Key,
        encryptedFileKey: file.encryptedFileKey,
      },
    });
  } catch (err) {
    console.error('[files/upload]', err);
    return res.status(500).json({ error: 'Upload failed.' });
  }
});

// ─── GET /api/files/:fileId/url ───────────────────────────────────────────────

/**
 * Returns a short-lived (60s) pre-signed S3 URL for downloading the encrypted blob.
 * The client fetches the blob, decrypts it in-browser, then serves it to the user.
 */
fileRouter.get('/:fileId/url', async (req, res) => {
  try {
    const file = await File.findById(req.params.fileId).lean();
    if (!file) return res.status(404).json({ error: 'File not found.' });

    // Only room members can download
    const room = await Room.findById(file.room).lean();
    const isMember = room?.members.some(
      (m) => m.toString() === req.user._id.toString()
    );
    if (!isMember) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key:    file.s3Key,
    });

    // Pre-signed URL expires in 60 seconds — tight window for download only
    const url = await getSignedUrl(s3, command, { expiresIn: 60 });

    return res.json({
      url,
      encryptedFileKey: file.encryptedFileKey, // client needs this to decrypt
      originalName:     file.originalName,
      mimeType:         file.mimeType,
    });
  } catch (err) {
    console.error('[files/url]', err);
    return res.status(500).json({ error: 'Could not generate download URL.' });
  }
});