const multer = require('multer');
const { kv } = require('@vercel/kv');
const { encryptFile } = require('../lib/encryption.js');
const { sendMailSecure } = require('../service/email/send.js');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
}).single('file');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  upload(req, res, async (err) => {
    try {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File size exceeds 10MB limit' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(500).json({ error: 'Internal server error during upload' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const recipientEmail = req.body.recipientEmail;
      if (!recipientEmail || !recipientEmail.includes('@')) {
        return res.status(400).json({ error: 'Valid recipient email is required' });
      }

      const fileId = uuidv4();
      const originalFileName = req.file.originalname;
      const fileSize = req.file.size;
      const decryptedBuffer = req.file.buffer;

      const otp = crypto.randomInt(100000, 999999).toString();

      const encryptedData = await encryptFile(decryptedBuffer, otp);

      const metadata = {
        fileId,
        fileName: originalFileName,
        fileSize,
        otp,
        createdAt: new Date().toISOString(),
        downloadCount: 0,
        maxDownloads: 3,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };

      const ttlSeconds = 7 * 24 * 60 * 60;
      await kv.set(`file:${fileId}:meta`, JSON.stringify(metadata), { ex: ttlSeconds });
      await kv.set(`file:${fileId}:data`, encryptedData.encrypted, { ex: ttlSeconds });

      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000';
      const downloadUrl = `${baseUrl}/download?id=${fileId}`;

      const emailResult = await sendMailSecure({
        to: recipientEmail,
        subject: '【138DataGate】セキュアファイル送信',
        fileId,
        fileName: originalFileName,
        fileSize,
        decryptedBuffer: decryptedBuffer,
        downloadUrl,
        otp
      });

      return res.status(200).json({
        fileId,
        downloadUrl,
        otp,
        expiresAt: metadata.expiresAt,
        mode: emailResult.mode,
        reason: emailResult.reason,
        fileSize: fileSize
      });

    } catch (error) {
      console.error('[upload.js] Error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
};
