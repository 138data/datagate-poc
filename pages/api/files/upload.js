import formidable from 'formidable';
import { kv } from '@vercel/kv';
import crypto from 'crypto';
import { promisify } from 'util';
import fs from 'fs';
import { sendOTPEmail } from '../../../lib/email-service.js';

const readFile = promisify(fs.readFile);

// Vercel設定: bodyParserを無効化（formidableを使用）
export const config = {
  api: {
    bodyParser: false,
  },
};

// AES-256-GCM暗号化
function encryptFile(buffer, password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted: Buffer.concat([salt, iv, authTag, encrypted]),
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
  };
}

// OTP生成（6桁数字）
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONSリクエスト処理
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POSTメソッドのみ許可
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowed: ['POST', 'OPTIONS'] 
    });
  }

  try {
    // formidableでファイル解析
    const form = formidable({
      maxFileSize: 4.5 * 1024 * 1024, // 4.5MB制限
      keepExtensions: true,
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    // フィールド取得
    const recipientEmail = Array.isArray(fields.recipientEmail) 
      ? fields.recipientEmail[0] 
      : fields.recipientEmail;
    
    const file = Array.isArray(files.file) 
      ? files.file[0] 
      : files.file;

    // バリデーション
    if (!recipientEmail || !file) {
      return res.status(400).json({ 
        error: '受信者のメールアドレスとファイルを指定してください' 
      });
    }

    // メールアドレス検証
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      return res.status(400).json({ 
        error: '有効なメールアドレスを入力してください' 
      });
    }

    // ファイル読み込み
    const fileBuffer = await readFile(file.filepath);

    // ファイルID生成
    const fileId = crypto.randomBytes(16).toString('hex');
    
    // OTP生成
    const otp = generateOTP();
    
    // パスワード生成（暗号化用）
    const encryptionPassword = crypto.randomBytes(32).toString('hex');

    // ファイル暗号化
    const { encrypted } = encryptFile(fileBuffer, encryptionPassword);

    // KVに保存
    const metadata = {
      fileId,
      originalName: file.originalFilename || 'unknown',
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size,
      recipientEmail,
      otp,
      encryptionPassword,
      downloadCount: 0,
      maxDownloads: 3,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7日後
    };

    // KV保存（TTL: 7日）
    await kv.set(`file:${fileId}:meta`, metadata, { ex: 7 * 24 * 60 * 60 });
    await kv.set(`file:${fileId}:data`, encrypted.toString('base64'), { ex: 7 * 24 * 60 * 60 });

    // ダウンロードURL生成
    const downloadUrl = `${process.env.VERCEL_URL || 'https://datagate-poc.vercel.app'}/download?id=${fileId}`;

    // メール送信
    try {
      await sendOTPEmail(recipientEmail, {
        recipientEmail,
        fileName: file.originalFilename || 'unknown',
        fileSize: file.size,
        downloadUrl,
        otp,
        expiresAt: metadata.expiresAt,
      });

      console.log(`✅ Email sent successfully to ${recipientEmail} via SES`);
    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError);
      
      // メール送信失敗時はKVデータを削除
      await kv.del(`file:${fileId}:meta`);
      await kv.del(`file:${fileId}:data`);
      
      return res.status(500).json({ 
        error: 'メール送信に失敗しました。もう一度お試しください。' 
      });
    }

    // 監査ログ記録
    const auditLog = {
      event: 'file_upload',
      fileId,
      fileName: file.originalFilename,
      fileSize: file.size,
      recipientEmail,
      timestamp: new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    };

    await kv.lpush('audit:logs', JSON.stringify(auditLog));

    // 成功レスポンス
    return res.status(200).json({
      success: true,
      message: 'ファイルが正常にアップロードされました',
      fileId,
      recipientEmail,
      expiresAt: metadata.expiresAt,
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    return res.status(500).json({ 
      error: 'ファイルのアップロードに失敗しました',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}