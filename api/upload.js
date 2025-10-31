// api/upload.js - uuid除去版（CJS形式）[完全版]
const { kv } = require('@vercel/kv');
const multer = require('multer');
const { randomUUID } = require('crypto'); // uuidの代わりにcryptoを使用
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

    // crypto.randomUUID()を使用（Node.js標準）
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
    
    // 暗号化結果の検証
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

    // KVにメタデータ保存
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
      maxDownloads: 3
    };

    const ttl = 7 * 24 * 60 * 60; // 7日間
    
    console.log('[INFO] Saving to KV...');
    try {
      await kv.set(`file:${fileId}`, metadata, { ex: ttl });
      console.log('[INFO] KV save complete');
    } catch (kvError) {
      console.error('[ERROR] KV save failed:', kvError);
      return res.status(500).json({ error: 'Metadata save failed' });
    }

    // ダウンロードURL生成
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : `https://${req.headers.host}`;
    const downloadUrl = `${baseUrl}/download.html?id=${fileId}`;
    console.log('[INFO] Download URL:', downloadUrl);

    // メール送信
    let mode = 'link';
    let emailSent = false;

    console.log('[INFO] Sending email to:', recipient);
    try {
      emailSent = await sendEmail(recipient, downloadUrl, otp, fileName, mode);
      console.log('[INFO] Email sent successfully');
    } catch (emailError) {
      console.error('[ERROR] Email send failed:', emailError);
      // メール送信失敗してもアップロード自体は成功とする
    }

    // 成功レスポンス
    const response = {
      success: true,
      fileId,
      downloadUrl,
      otp,
      mode,
      message: emailSent 
        ? `File uploaded. Email sent to ${recipient}` 
        : 'File uploaded. Email sending failed, but you can share the link manually.'
    };

    console.log('[INFO] Returning success response');
    return res.status(200).json(response);

  } catch (error) {
    console.error('[ERROR] Upload handler error:', error);
    console.error('[ERROR] Stack trace:', error.stack);
    return res.status(500).json({
      error: 'Upload failed',
      details: error.message
    });
  }
};