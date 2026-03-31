const router = require('express').Router();
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuid } = require('uuid');
const { upload } = require('../middleware/upload');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// POST /api/files/upload — receives encrypted file blob + metadata
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { encryptedFileKey, iv, fileKeyIv } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const fileId  = uuid();
    const s3Key   = `uploads/${req.user._id}/${fileId}`;

    await s3.send(new PutObjectCommand({
      Bucket:      process.env.AWS_BUCKET,
      Key:         s3Key,
      Body:        file.buffer,      // already encrypted by client
      ContentType: 'application/octet-stream',
      Metadata: {
        originalName:     file.originalname,
        uploadedBy:       req.user._id.toString(),
        encryptedFileKey,
        iv,
        fileKeyIv,
      },
    }));

    // Generate a short-lived presigned download URL (1 hour)
    const url = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key:    s3Key,
    }), { expiresIn: 3600 });

    res.json({ fileId, url, s3Key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/files/:fileId — refresh presigned download URL
router.get('/:fileId', async (req, res) => {
  try {
    const s3Key = `uploads/${req.user._id}/${req.params.fileId}`;
    const url   = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key:    s3Key,
    }), { expiresIn: 3600 });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;