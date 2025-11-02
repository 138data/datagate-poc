// api/upload.js - 完全版（Phase 41 ドリフト是正）

import multer from 'multer';
import { kv } from '@vercel/kv';
import crypto from 'crypto';
import { encryptFile } from '../lib/encryption.js';
import { sendMailSecure } from '../service/email/send.js';

// multer 2.x: memoryStorage 使用
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  // CORS & Cache-Control
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return new Promise((resolve) => {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        console.error('[api/upload] Multer error:', err);
        res.status(400).json({ error: err.message });
        return resolve();
      }

      try {
        const { file } = req;
        const { recipientEmail } = req.body;

        // バリデーション
        if (!file) {
          res.status(400).json({ error: 'No file uploaded' });
          return resolve();
        }

        if (!recipientEmail) {
          res.status(400).json({ error: 'Recipient email is required' });
          return resolve();
        }

        // ファイルID生成（crypto.randomUUID - Node.js組み込み）
        const fileId = crypto.randomUUID();
        const originalFileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const fileSize = file.size;

        console.log('[api/upload] Processing file:', {
          fileId,
          fileName: originalFileName,
          size: fileSize,
          recipient: recipientEmail
        });

        // OTP生成（6桁数値）
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // 暗号化（AES-256-GCM + PBKDF2）
        const encryptedData = encryptFile(file.buffer, otp);

        // TTL: 7日間
        const ttlSeconds = 7 * 24 * 60 * 60;

        // メタデータ保存
        const metadata = {
          fileName: originalFileName,
          fileSize,
          uploadedAt: new Date().toISOString(),
          recipientEmail,
          iv: encryptedData.iv,
          salt: encryptedData.salt,
          authTag: encryptedData.authTag,
          downloadCount: 0,
          maxDownloads: 3
        };

        await kv.set(`file:${fileId}:meta`, JSON.stringify(metadata), { ex: ttlSeconds });

        // 暗号化データ保存（Base64エンコード）
        await kv.set(
          `file:${fileId}:data`,
          encryptedData.encryptedBuffer.toString('base64'),
          { ex: ttlSeconds }
        );

        console.log('[api/upload] File encrypted and stored:', fileId);

        // ダウンロードURL生成
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';
        const downloadUrl = `${baseUrl}/download?id=${fileId}`;

        // メール送信（★ decryptedBuffer を注入）
        const emailResult = await sendMailSecure({
          to: recipientEmail,
          subject: '【138DataGate】セキュアファイル送信',
          fileId,
          fileName: originalFileName,
          fileSize,
          decryptedBuffer: file.buffer, // ★ P0修正: 直送判定に必須
          downloadUrl,
          otp
        });

        console.log('[api/upload] Email sent:', emailResult);

        // 監査ログ保存（Phase 42準備）
        const auditLog = {
          fileId,
          timestamp: new Date().toISOString(),
          recipientDomain: recipientEmail.substring(recipientEmail.indexOf('@')),
          recipientEmail, // 詳細分析用
          mode: emailResult.mode,
          reason: emailResult.reason,
          fileSize,
          fileName: originalFileName,
          // Phase 42 で追加予定の診断情報
          details: {
            hasBuffer: !!file.buffer,
            bufferLength: file.buffer?.length,
            enableDirectAttach: process.env.ENABLE_DIRECT_ATTACH,
            mailSandbox: process.env.MAIL_SANDBOX
          }
        };

        await kv.set(
          `audit:${Date.now()}:${fileId}`,
          JSON.stringify(auditLog),
          { ex: ttlSeconds }
        );

        // 成功レスポンス
        res.status(200).json({
          success: true,
          fileId,
          fileName: originalFileName,
          fileSize,
          downloadLink: `/download.html?id=${fileId}`,
          mode: emailResult.mode,
          reason: emailResult.reason,
          expiresIn: '7 days'
        });

      } catch (error) {
        console.error('[api/upload] Error:', error);
        res.status(500).json({
          error: 'Upload failed',
          details: error.message
        });
      }

      resolve();
    });
  });
}