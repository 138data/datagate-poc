import formidable from 'formidable';
import crypto from 'crypto';
import { kv } from '@vercel/kv';
import emailService from '../../../lib/email-service.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

// 暗号化関数（keyとivを返すように修正）
function encryptFile(buffer, password) {
  const algorithm = 'aes-256-gcm';
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(buffer),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return {
    encrypted: Buffer.concat([authTag, encrypted]),
    key: key.toString('hex'),
    iv: iv.toString('hex'),
    salt: salt.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

// OTP生成（6桁の数字のみ）
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({
      maxFileSize: 4.5 * 1024 * 1024,
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);

    const recipientEmail = fields.recipientEmail?.[0];
    const file = files.file?.[0];

    if (!recipientEmail || !file) {
      return res.status(400).json({ error: '必須項目が不足しています' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      return res.status(400).json({ error: '有効なメールアドレスを入力してください' });
    }

    if (file.size > 4.5 * 1024 * 1024) {
      return res.status(400).json({ error: 'ファイルサイズは4.5MB以下にしてください' });
    }

    const fs = require('fs').promises;
    const fileBuffer = await fs.readFile(file.filepath);

    // 暗号化（keyとivも取得）
    const encryptionPassword = crypto.randomBytes(32).toString('hex');
    const { encrypted, key, iv } = encryptFile(fileBuffer, encryptionPassword);

    const otp = generateOTP();
    const fileId = crypto.randomBytes(16).toString('hex');

    // メタデータ作成（encryptionKeyとivを保存）
    const metadata = {
      fileId,
      fileName: file.originalFilename || 'unknown',
      fileSize: file.size,
      mimeType: file.mimetype || 'application/octet-stream',
      recipientEmail,
      otp,
      encryptionKey: key,
      iv: iv,
      downloadCount: 3,
      maxDownloads: 3,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    // KV保存（TTL: 7日）
    await kv.set(`file:${fileId}:meta`, metadata, { ex: 7 * 24 * 60 * 60 });
    await kv.set(`file:${fileId}:data`, encrypted.toString('base64'), { ex: 7 * 24 * 60 * 60 });

    // ダウンロードURL生成
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const downloadUrl = `${protocol}://${host}/download/${fileId}`;

    // OTPメール送信
    try {
      await emailService.sendOTPEmail(recipientEmail, otp, downloadUrl, {
        fileName: file.originalFilename || 'unknown',
        fileSize: file.size,
        expiresAt: metadata.expiresAt,
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      return res.status(200).json({
        success: true,
        fileId,
        recipientEmail,
        expiresAt: metadata.expiresAt,
        warning: 'ファイルはアップロードされましたが、メール送信に失敗しました',
      });
    }

    res.status(200).json({
      success: true,
      fileId,
      recipientEmail,
      expiresAt: metadata.expiresAt,
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'アップロード処理に失敗しました' });
  }
}