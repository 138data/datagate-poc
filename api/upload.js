// api/upload.js - Phase 36 完全版
const { kv } = require('@vercel/kv');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { encryptFile, generateOTP } = require('../lib/encryption');
const { sendEmail } = require('../lib/email-service');
const { canUseDirectAttach } = require('../lib/environment');
const { uploadToBlob } = require('../lib/blob-storage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const prohibited = ['.exe', '.scr', '.vbs', '.js', '.com', '.bat'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    if (prohibited.includes(ext)) {
      return cb(new Error(`Prohibited file type: ${ext}`));
    }
    cb(null, true);
  }
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const uploadPromise = new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  try {
    await uploadPromise;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const recipient = req.body.recipientEmail;
    if (!recipient) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    const fileId = uuidv4();
    const otp = generateOTP();
    const fileName = req.file.originalname;
    const fileBuffer = req.file.buffer;
    
    console.log(`[INFO] Processing upload: ${fileName} for ${recipient}`);
    
    // Encrypt file
    const encrypted = await encryptFile(fileBuffer);
    
    // Upload to blob storage
    const blobKey = `file:${fileId}:data`;
    await uploadToBlob(blobKey, encrypted.encrypted, encrypted.authTag, encrypted.iv);
    
    // Save metadata
    const metadata = {
      fileName,
      fileSize: fileBuffer.length,
      mimeType: req.file.mimetype,
      recipientEmail: recipient,
      otp,
      uploadedAt: new Date().toISOString(),
      downloadCount: 0,
      maxDownloads: 3
    };
    
    await kv.hset(`file:${fileId}:meta`, metadata);
    await kv.expire(`file:${fileId}:meta`, 7 * 24 * 60 * 60);
    
    // Generate download URL
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    const downloadUrl = `${baseUrl}/d?id=${fileId}`;
    
    // Determine email mode
    const directAttach = canUseDirectAttach(recipient, fileBuffer.length);
    const mode = directAttach ? 'attach' : 'link';
    
    console.log(`[INFO] Sending email to ${recipient}, mode: ${mode}`);
    
    // Send email with correct parameters
    await sendEmail({
      to: recipient,
      downloadUrl: downloadUrl,  // 明示的に指定
      otp: otp,
      fileName: fileName,
      mode: mode,
      attachment: directAttach ? {
        buffer: fileBuffer,
        filename: fileName
      } : null
    });
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    res.json({
      success: true,
      fileId,
      fileName,
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
      mode
    });
    
  } catch (error) {
    console.error('[ERROR] Upload failed:', error);
    res.status(500).json({ 
      error: 'Failed to upload file',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
