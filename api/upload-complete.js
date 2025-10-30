// api/upload-complete.js
// Phase 35b: ファイルデータ受信、暗号化、最終Blob保存

import crypto from 'crypto';
import { put } from '@vercel/blob';
import { kv } from '@vercel/kv';
import { encryptFile } from '../../lib/crypto/encryption.js';
import { sendDownloadLinkEmail } from '../../lib/emails/sendgrid.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb' // ファイルデータ受信用
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let uploadId = null;
  let tempBlobKey = null;

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

    tempBlobKey = tempMeta.tempBlobKey;
    const { fileName, recipientEmail } = tempMeta;

    // Base64 デコード
    const fileBuffer = Buffer.from(fileData, 'base64');

    // ファイルサイズ検証
    if (fileBuffer.length !== tempMeta.fileSize) {
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
    
    const blob = await put(blobKey, encrypted.data, {
      access: 'public',
      addRandomSuffix: false
    });

    // OTP生成
    const otp = String(crypto.randomInt(100000, 999999));

    // KV にメタデータ保存（7日TTL）
    const fileMeta = {
      fileId,
      fileName,
      blobKey, // blobUrl は保存しない
      salt: encrypted.salt.toString('base64'),
      iv: encrypted.iv.toString('base64'),
      tag: encrypted.tag.toString('base64'),
      otp,
      password, // 内部管理用（復号に必要）
      recipientEmail,
      maxDownloads: 3,
      downloadCount: 0,
      failedAttempts: 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7日後
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

    await kv.lpush('audit:log', JSON.stringify({
      event: 'temp_meta_deleted',
      uploadId,
      timestamp: new Date().toISOString()
    }));

    // 短寿命トークン生成（60秒TTL）
    const oneTimeToken = crypto.randomBytes(32).toString('hex');
    await kv.set(`token:${oneTimeToken}`, {
      fileId,
      createdAt: Date.now()
    }, { ex: 60 });

    // ダウンロードURL
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const downloadUrl = `${baseUrl}/d?t=${oneTimeToken}`;

    // メール送信
    await sendDownloadLinkEmail({
      to: recipientEmail,
      fileName,
      downloadUrl,
      otpCode: otp
    });

    // 監査ログ（メール送信）
    await kv.lpush('audit:log', JSON.stringify({
      event: 'email_sent',
      fileId,
      recipientEmail,
      downloadUrl,
      timestamp: new Date().toISOString()
    }));

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

    // エラー時の監査ログ
    if (uploadId) {
      await kv.lpush('audit:log', JSON.stringify({
        event: 'upload_failed',
        uploadId,
        error: error.message,
        timestamp: new Date().toISOString()
      })).catch(() => {});
    }

    res.status(500).json({ error: 'Failed to complete upload' });
  }
}
