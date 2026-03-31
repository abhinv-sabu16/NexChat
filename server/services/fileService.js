/**
 * services/fileService.js
 *
 * All file-related database operations and S3 interactions.
 * REST file routes call this — no model or S3 imports in the route file.
 */

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl }     from '@aws-sdk/s3-request-presigner';
import { s3 }               from '../middleware/upload.js';
import File                 from '../models/File.js';
import { assertMembership } from './roomService.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../lib/errors.js';

// Pre-signed URL lifetime — short window to minimise exposure
const PRESIGNED_URL_TTL_SECONDS = 60;

// ─── saveFileMetadata ─────────────────────────────────────────────────────────

/**
 * Persists file metadata after multer-s3 has already uploaded the encrypted blob.
 *
 * @param {object} params
 * @param {object} params.multerFile      - req.file from multer-s3
 * @param {string} params.roomId
 * @param {string} params.uploaderId
 * @param {string} params.encryptedFileKey - Per-file AES key encrypted with ECDH shared key
 * @param {string} params.originalName
 * @param {string} params.mimeType
 *
 * @returns {Promise<object>} Lean file document
 * @throws {ValidationError} If required fields are missing
 * @throws {ForbiddenError}  If uploader is not a room member
 */
export async function saveFileMetadata({
  multerFile,
  roomId,
  uploaderId,
  encryptedFileKey,
  originalName,
  mimeType,
}) {
  // Guard defensively — route already checks this, but service must be self-contained
  if (!multerFile?.key || !multerFile?.size) {
    throw new ValidationError('Uploaded file data is missing or incomplete.');
  }
  if (!encryptedFileKey || !originalName || !mimeType) {
    throw new ValidationError('encryptedFileKey, originalName, and mimeType are required.');
  }

  // Membership check — throws ForbiddenError if not a member
  await assertMembership(roomId, uploaderId);

  const file = await File.create({
    originalName,
    mimeType,
    sizeBytes:        multerFile.size,
    s3Key:            multerFile.key,
    encryptedFileKey,
    uploadedBy:       uploaderId,
    room:             roomId,
  });

  return file.toObject();
}

// ─── getFileDownloadUrl ───────────────────────────────────────────────────────

/**
 * Generates a short-lived pre-signed S3 URL for a file.
 * The client downloads the encrypted blob and decrypts it in-browser.
 *
 * @param {string} fileId         - File document ObjectId
 * @param {string} requestingUserId
 *
 * @returns {Promise<{ url: string, encryptedFileKey: string, originalName: string, mimeType: string }>}
 * @throws {NotFoundError}  If file does not exist
 * @throws {ForbiddenError} If requester is not a room member
 */
export async function getFileDownloadUrl(fileId, requestingUserId) {
  const file = await File.findById(fileId).lean();
  if (!file) throw new NotFoundError('File');

  // Re-use room membership check
  await assertMembership(file.room, requestingUserId);

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET,
    Key:    file.s3Key,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: PRESIGNED_URL_TTL_SECONDS });

  return {
    url,
    encryptedFileKey: file.encryptedFileKey,
    originalName:     file.originalName,
    mimeType:         file.mimeType,
  };
}