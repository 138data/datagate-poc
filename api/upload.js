// api/upload.js - Phase 39 完全版（sendMailSecure 対応）
const { kv } = require('@vercel/kv');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { encryptFile, generateOTP } = require('../lib/encryption');
const { sendMailSecure } = require('../service/email/send');
const { canUseDirectAttach } = require('../lib/environment');
const { uploadToBlob } = require('../lib/blob-storage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
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
  console.log('=== Upload Handler Start ===');
  console.log('Method:', req.method);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const uploadPromise = new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        reject(err);
      } else {
        resolve();
      }
    });
  });

  try {
    await uploadPromise;
    console.log('Multer processing complete');

    if (!req.file) {
      console.log('No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const recipient = req.body.recipientEmail;
    if (!recipient) {
      console.log('No recipient email');
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    const fileId = randomUUID();
    const otp = generateOTP();
    const fileName = req.file.originalname;
    const fileBuffer = req.file.buffer;

    console.log('[INFO] File received:', fileName, fileBuffer.length, 'bytes');
    console.log('[INFO] File ID:', fileId);
    console.log('[INFO] OTP:', otp);

    // 暗号化
    console.log('[INFO] Encrypting file...');
    const encryptedData = encryptFile(fileBuffer, fileName);

    if (!encryptedData || !encryptedData.encryptedBuffer) {
      console.error('[ERROR] encryptFile returned invalid result:', encryptedData);
      return res.status(500).json({ error: 'Encryption failed' });
    }
    console.log('[INFO] Encryption complete, size:', encryptedData.encryptedBuffer.length);

    // Blob Storageにアップロード
    console.log('[INFO] Uploading to Blob...');
    let blobKey;
    try {
      blobKey = await uploadToBlob(fileId, encryptedData.encryptedBuffer, fileName);
      console.log('[INFO] Blob upload complete:', blobKey);
    } catch (blobError) {
      console.error('[ERROR] Blob upload failed:', blobError);
      return res.status(500).json({ error: 'Storage upload failed' });
    }

    // KVにメタデータ保存（Phase 37: salt/iv/authTag 追加）
    const metadata = {
      fileId,
      otp,
      fileName,
      originalName: fileName,
      size: fileBuffer.length,
      mimeType: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
      blobKey,
      downloadCount: 0,
      maxDownloads: 3,
      // 復号化に必要な情報
      salt: encryptedData.salt,
      iv: encryptedData.iv,
      authTag: encryptedData.authTag
    };

    const ttl = 7 * 24 * 60 * 60;

    console.log('[INFO] Saving to KV with salt/iv/authTag...');
    try {
      await kv.set(`file:${fileId}:meta`, metadata, { ex: ttl });
      console.log('[INFO] KV save complete');
    } catch (kvError) {
      console.error('[ERROR] KV save failed:', kvError);
      return res.status(500).json({ error: 'Metadata save failed' });
    }

    // downloadUrl を生成（Phase 39 追加）
    const downloadUrl = `https://${req.headers.host}/download.html?id=${fileId}`;
    console.log('[INFO] Download URL:', downloadUrl);

    // メール送信（Phase 39: sendMailSecure に変更）
    console.log('[INFO] Sending email via sendMailSecure...');
    const emailResult = await sendMailSecure({
      to: recipient,
      subject: 'セキュアファイルが送信されました',
      text: `ファイル名: ${fileName}`,
      fileId,
      fileName,
      fileSize: fileBuffer.length,
      decryptedBuffer: fileBuffer, // ⚠️ 暗号化前のバッファを渡す
      downloadUrl,
      otp
    });

    console.log('[INFO] Email result:', emailResult);

    return res.status(200).json({
      success: true,
      fileId,
      otp,
      email: emailResult
    });

  } catch (error) {
    console.error('[ERROR] Upload failed:', error);
    return res.status(500).json({
      error: 'Upload failed',
      details: error.message
    });
  }
};