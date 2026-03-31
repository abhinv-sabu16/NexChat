import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';
import { v4 as uuid } from 'uuid';
import path from 'path';

// ─── S3 Client ────────────────────────────────────────────────────────────────

export const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ─── Allowed MIME types ───────────────────────────────────────────────────────

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain',
  'application/zip',
  // Encrypted blobs are sent as application/octet-stream
  'application/octet-stream',
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// ─── Multer → S3 ─────────────────────────────────────────────────────────────

export const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_BUCKET,
    contentType: (_req, file, cb) => {
      // Always store as octet-stream — files arrive pre-encrypted from client
      cb(null, 'application/octet-stream');
    },
    key: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      // UUID key prevents enumeration; ext is kept for ops visibility only
      cb(null, `uploads/${uuid()}${ext}`);
    },
    // Server-side encryption at rest (defence-in-depth alongside client E2EE)
    serverSideEncryption: 'AES256',
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type "${file.mimetype}" is not allowed.`));
    }
  },
});