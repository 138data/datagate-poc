// api/upload.js - multer 2.x 対応版 (Phase 36)
const { kv } = require('@vercel/kv');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { encryptFile, generateOTP } = require('../lib/encryption');
const { sendEmail } = require('../lib/email-service');
const { canUseDirectAttach } = require('../lib/environment');
const { uploadToBlob } = require('../lib/blob-storage');

// multer 2.x の設定: メモリストレージ
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// multer ミドルウェアを Promise でラップ
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // multer でファイル解析
    await runMiddleware(req, res, upload.single('file'));

    if (!req.file) {
      return res.status(400).json({ error: 'ファイルが選択されていません' });
    }

    const recipient = req.body.recipientEmail;
    if (!recipient) {
      return res.status(400).json({ error: '受信者のメールアドレスが指定されていません' });
    }

    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    const fileId = uuidv4();
    const otp = generateOTP();

    console.log('[INFO] File received:', fileName, fileBuffer.length, 'bytes');
    console.log('[INFO] Encrypting file:', fileName);

    const encryptedData = encryptFile(fileBuffer, fileName);

    console.log('[INFO] Uploading to Blob:', fileName);
    console.log('[DEBUG] uploadToBlob args:', {
      fileId,
      bufferSize: encryptedData.encryptedBuffer.length,
      fileName
    });

    const blobResult = await uploadToBlob(fileId, encryptedData.encryptedBuffer, fileName);

    const metadata = {
      fileId,
      fileName,
      fileSize: fileBuffer.length,
      recipient,
      otp,
      salt: encryptedData.salt,
      iv: encryptedData.iv,
      blobUrl: blobResult.url,
      blobDownloadUrl: blobResult.downloadUrl,
      uploadedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      downloadCount: 0,
      maxDownloads: 3
    };

    console.log('[INFO] Saving metadata to KV:', fileId);
    await kv.set(`file:${fileId}:meta`, JSON.stringify(metadata), { ex: 7 * 24 * 60 * 60 });

    // ベースURLを動的に取得
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${protocol}://${host}`;
    const downloadUrl = `${baseUrl}/d?id=${fileId}`;

    console.log('[INFO] Sending email to:', recipient);
    const directAttach = canUseDirectAttach(recipient, fileBuffer.length);

    await sendEmail({
      to: recipient,
      fileName,
      fileSize: fileBuffer.length,
      downloadUrl,
      otp,
      mode: directAttach ? 'attach' : 'link',
      attachment: directAttach ? { buffer: fileBuffer, filename: fileName } : null
    });

    console.log('[INFO] Upload complete:', fileId);
    res.status(200).json({
      success: true,
      fileId,
      fileName,
      downloadUrl,
      expiresAt: metadata.expiresAt,
      mode: directAttach ? 'attach' : 'link'
    });

  } catch (error) {
    console.error('[ERROR] Upload failed:', error);
    res.status(500).json({
      error: 'アップロード処理中にエラーが発生しました',
      details: error.message
    });
  }
};