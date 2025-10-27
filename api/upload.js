// ファイルアップロードAPI - メール送信機能統合版
import formidable from 'formidable';
import crypto from 'crypto';
import { kv } from '@vercel/kv';
import { sendDownloadLinkEmail } from './email-service.js';
import { getEnvironmentConfig } from './environment.js';

// 定数
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '52428800'); // 50MB
const FILE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7日間
const MAX_DOWNLOADS = 3;
const OTP_LENGTH = 6;

// 暗号化キー（環境変数から取得）
const ENCRYPTION_KEY = process.env.FILE_ENCRYPT_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  throw new Error('FILE_ENCRYPT_KEY must be a 64-character hex string');
}

/**
 * ファイルを暗号化（AES-256-GCM）
 */
function encryptFile(buffer, password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(buffer),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    data: encrypted.toString('base64')
  };
}

/**
 * 数値OTPを生成（6桁）
 */
function generateNumericOTP() {
  const otp = crypto.randomInt(0, 1000000).toString().padStart(OTP_LENGTH, '0');
  return otp;
}

export default async function handler(req, res) {
  // CORS対応
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
    // 環境設定取得
    const envConfig = getEnvironmentConfig();
    
    // Formidableでファイルパース
    const form = formidable({
      maxFileSize: MAX_FILE_SIZE,
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    
    const file = files.file?.[0];
    const recipient = fields.recipient?.[0];

    if (!file) {
      return res.status(400).json({ 
        error: 'No file uploaded',
        environment: envConfig.environment 
      });
    }

    // recipientが指定されている場合はバリデーション
    if (recipient && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return res.status(400).json({ 
        error: 'Invalid email address',
        environment: envConfig.environment 
      });
    }

    // ファイル読み込み
    const fs = await import('fs');
    const fileBuffer = await fs.promises.readFile(file.filepath);

    // ファイルID生成
    const fileId = crypto.randomBytes(16).toString('hex');
    
    // OTP生成（数値6桁）
    const otp = generateNumericOTP();

    // ファイル暗号化
    const encrypted = encryptFile(fileBuffer, ENCRYPTION_KEY);

    // メタデータ
    const metadata = {
      fileName: file.originalFilename || 'unnamed',
      fileSize: file.size,
      mimeType: file.mimetype || 'application/octet-stream',
      uploadedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + FILE_TTL_SECONDS * 1000).toISOString(),
      downloadCount: 0,
      maxDownloads: MAX_DOWNLOADS,
      otp: otp,
      salt: encrypted.salt,
      iv: encrypted.iv,
      authTag: encrypted.authTag
    };

    // KVに保存
    await kv.set(`file:${fileId}:meta`, metadata, { ex: FILE_TTL_SECONDS });
    await kv.set(`file:${fileId}:data`, encrypted.data, { ex: FILE_TTL_SECONDS });

    // ダウンロードURL生成
    const baseUrl = envConfig.baseUrl;
    const downloadUrl = `${baseUrl}/download.html?id=${fileId}`;

    // メール送信処理
    let emailResult = {
      sent: false,
      success: false,
      error: null,
      statusCode: null
    };

    // 🔍 デバッグログ追加
    console.log('[upload.js] Email sending check:', {
      hasRecipient: !!recipient,
      recipient: recipient,
      enableEmailSending: envConfig.enableEmailSending,
      hasSendgridApiKey: !!envConfig.sendgridApiKey,
      hasSendgridFromEmail: !!envConfig.sendgridFromEmail,
      sendgridFromEmail: envConfig.sendgridFromEmail,
      environment: envConfig.environment
    });

    if (recipient && envConfig.enableEmailSending) {
      console.log('[upload.js] ✅ Entering email sending block');
      try {
        const emailSendResult = await sendDownloadLinkEmail({
          to: recipient,
          downloadUrl: downloadUrl,
          otp: otp,
          expiresAt: metadata.expiresAt
        });
        
        console.log('[upload.js] Email send result:', emailSendResult);
        
        emailResult = {
          sent: true,
          success: emailSendResult.success,
          messageId: emailSendResult.messageId,
          statusCode: emailSendResult.statusCode,
          error: emailSendResult.error
        };
      } catch (emailError) {
        console.error('[upload.js] Email sending error:', emailError);
        emailResult = {
          sent: true,
          success: false,
          error: emailError.message,
          statusCode: null
        };
      }
    } else {
      console.log('[upload.js] ❌ Skipping email sending:', {
        hasRecipient: !!recipient,
        enableEmailSending: envConfig.enableEmailSending
      });
    }

    // 一時ファイル削除
    await fs.promises.unlink(file.filepath);

    // レスポンス
    return res.status(200).json({
      success: true,
      fileId,
      downloadUrl,
      otp,
      fileName: metadata.fileName,
      fileSize: metadata.fileSize,
      expiresAt: metadata.expiresAt,
      maxDownloads: MAX_DOWNLOADS,
      email: emailResult,
      _debug: {
        environment: envConfig.environment,
        emailSent: emailResult.sent,
        emailSuccess: emailResult.success,
        sandboxMode: envConfig.sandboxMode,
        vercelUrl: process.env.VERCEL_URL
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({
      error: 'File upload failed',
      message: error.message,
      environment: getEnvironmentConfig().environment
    });
  }
}