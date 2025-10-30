// api/upload-complete.js
// Phase 35b: ファイルデータ受信、暗号化、最終Blob保存 (CommonJS)

const crypto = require('crypto');
const { put } = require('@vercel/blob');
const { kv } = require('@vercel/kv');
const { sendDownloadLinkEmail } = require('../lib/emails/sendgrid.js');

// 簡易暗号化関数（encryption.js の代替）
function encryptFile(buffer, password) {
  const algorithm = 'aes-256-gcm';
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  
  return {
    data: encrypted,
    salt,
    iv,
    tag
  };
}

module.exports = async function handler(req, res) {
  // CORSヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let uploadId = null;

  try {
    const { uploadId: reqUploadId, fileData } = req.body;

    if (!reqUploadId || !fileData) {
      return res.status(400).json({
        error: 'uploadId and fileData (base64) are required'
      });
    }

    uploadId = reqUploadId;

    // 一時メタデータ取得
    const tempMeta = await kv.get(`upload:${uploadId}:temp`);
    if (!tempMeta) {
      return res.status(404).json({
        error: 'Upload session not found or expired'
      });
    }

    const { fileName, recipientEmail, fileSize } = tempMeta;

    // Base64 デコード
    const fileBuffer = Buffer.from(fileData, 'base64');

    // ファイルサイズ検証
    if (fileBuffer.length !== fileSize) {
      return res.status(400).json({
        error: 'File size mismatch'
      });
    }

    // 暗号化
    const password = crypto.randomBytes(32).toString('hex');
    const encrypted = encryptFile(fileBuffer, password);

    // 最終Blob保存（暗号化済み）
    const fileId = crypto.randomBytes(16).toString('hex');
    const blobKey = `file-${fileId}`;

    await put(blobKey, encrypted.data, {
      access: 'public',
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    // OTP生成
    const otp = String(crypto.randomInt(100000, 999999));

    // KV にメタデータ保存（7日TTL）
    const fileMeta = {
      fileId,
      fileName,
      blobKey,
      salt: encrypted.salt.toString('base64'),
      iv: encrypted.iv.toString('base64'),
      tag: encrypted.tag.toString('base64'),
      otp,
      password,
      recipientEmail,
      maxDownloads: 3,
      downloadCount: 0,
      failedAttempts: 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
    };

    await kv.set(`file:${fileId}:meta`, fileMeta, { ex: 7 * 24 * 60 * 60 });

    // 一時メタデータ削除
    await kv.del(`upload:${uploadId}:temp`);

    // 監査ログ
    await kv.lpush('audit:log', JSON.stringify({
      event: 'upload_complete',
      uploadId,
      fileId,
      fileName,
      blobKey,
      recipientEmail,
      timestamp: new Date().toISOString()
    }));

    // 短寿命トークン生成（60秒TTL）
    const oneTimeToken = crypto.randomBytes(32).toString('hex');
    await kv.set(`token:${oneTimeToken}`, {
      fileId,
      createdAt: Date.now()
    }, { ex: 60 });

    // ダウンロードURL
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers['host'];
    const downloadUrl = `${protocol}://${host}/d?t=${oneTimeToken}`;

    // メール送信
    try {
      await sendDownloadLinkEmail({
        to: recipientEmail,
        fileName,
        downloadUrl,
        otpCode: otp
      });

      await kv.lpush('audit:log', JSON.stringify({
        event: 'email_sent',
        fileId,
        recipientEmail,
        downloadUrl,
        timestamp: new Date().toISOString()
      }));
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      // メール失敗でも続行
    }

    // クライアントに返す
    res.status(200).json({
      success: true,
      fileId,
      downloadUrl,
      otp,
      expiresAt: fileMeta.expiresAt
    });

  } catch (error) {
    console.error('Upload complete error:', error);

    if (uploadId) {
      await kv.lpush('audit:log', JSON.stringify({
        event: 'upload_failed',
        uploadId,
        error: error.message,
        timestamp: new Date().toISOString()
      })).catch(() => {});
    }

    res.status(500).json({ 
      error: 'Failed to complete upload',
      details: error.message 
    });
  }
};
