// api/upload.js
// ファイルアップロードAPI - メール送信機能統合版

const formidable = require('formidable');
const crypto = require('crypto');
const { kv } = require('@vercel/kv');
const { isProduction, isPreview, isDevelopment, isEmailEnabled, isSandboxMode, getEnvironmentInfo } = require('../lib/environment');
const { sendDownloadLinkEmail } = require('../lib/email-service');

// 定数定義
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const FILE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7日間
const OTP_LENGTH = 6;
const MAX_DOWNLOAD_ATTEMPTS = 3;

// 暗号化設定
const ALGORITHM = 'aes-256-gcm';
const KEY_DERIVATION_ITERATIONS = 100000;
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// OTP生成（6桁の数字）
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ファイルID生成
function generateFileId() {
  return crypto.randomBytes(16).toString('hex');
}

// PBKDF2によるキー導出
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, KEY_DERIVATION_ITERATIONS, 32, 'sha256');
}

// AES-256-GCMによるファイル暗号化
function encryptFile(buffer, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted: Buffer.concat([salt, iv, authTag, encrypted]).toString('base64'),
    salt: salt.toString('hex'),
    iv: iv.toString('hex')
  };
}

// ダウンロードURL生成
function generateDownloadUrl(fileId, baseUrl) {
  // 環境に応じたベースURL
  const url = baseUrl || process.env.BASE_URL || 'https://datagate-qbcypvice-138datas-projects.vercel.app';
  return `${url}/download.html?id=${fileId}`;
}

// メール送信処理（環境判定付き）
async function sendEmailNotification(recipientEmail, downloadLink, otp) {
  const envInfo = getEnvironmentInfo();
  
  // メール送信が無効な環境の場合はスキップ
  if (!isEmailEnabled()) {
    console.log('[Email] Email sending is disabled in this environment');
    return {
      success: false,
      skipped: true,
      reason: 'Email sending disabled',
      environment: envInfo.environment
    };
  }
  
  // Sandboxモードの場合はシミュレート
  if (isSandboxMode()) {
    console.log('[Email] SANDBOX MODE - Simulating email send');
    console.log(`[Email] To: ${recipientEmail}`);
    console.log(`[Email] Link: ${downloadLink}`);
    console.log(`[Email] OTP: ${otp}`);
    
    return {
      success: true,
      simulated: true,
      environment: envInfo.environment
    };
  }
  
  // 実際にメール送信
  try {
    console.log(`[Email] Sending email to ${recipientEmail}`);
    const result = await sendDownloadLinkEmail(recipientEmail, downloadLink, otp);
    
    if (result.success) {
      console.log('[Email] Email sent successfully');
    } else {
      console.error('[Email] Email send failed:', result.error);
    }
    
    return {
      ...result,
      environment: envInfo.environment
    };
    
  } catch (error) {
    console.error('[Email] Email send error:', error);
    return {
      success: false,
      error: error.message,
      environment: envInfo.environment
    };
  }
}

// メインハンドラー
export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const envInfo = getEnvironmentInfo();
  console.log(`[Upload] Environment: ${envInfo.environment}`);
  console.log(`[Upload] Email Enabled: ${envInfo.emailEnabled}`);
  console.log(`[Upload] Sandbox Mode: ${envInfo.sandboxMode}`);
  
  try {
    // Formidableでファイルパース
    const form = formidable({
      maxFileSize: MAX_FILE_SIZE,
      keepExtensions: true,
      multiples: false
    });
    
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });
    
    // ファイル取得
    const fileArray = files.file;
    if (!fileArray || fileArray.length === 0) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const file = fileArray[0];
    const fs = require('fs');
    const fileBuffer = fs.readFileSync(file.filepath);
    
    // ファイル情報
    const fileName = file.originalFilename || 'unknown';
    const fileSize = file.size;
    const mimeType = file.mimetype || 'application/octet-stream';
    
    console.log(`[Upload] File: ${fileName}, Size: ${fileSize} bytes`);
    
    // 受信者メールアドレス取得
    const recipientArray = fields.recipient;
    const recipientEmail = recipientArray ? recipientArray[0] : null;
    
    if (!recipientEmail) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }
    
    console.log(`[Upload] Recipient: ${recipientEmail}`);
    
    // ファイルID生成
    const fileId = generateFileId();
    
    // OTP生成
    const otp = generateOTP();
    
    console.log(`[Upload] File ID: ${fileId}, OTP: ${otp}`);
    
    // ファイル暗号化
    const { encrypted } = encryptFile(fileBuffer, otp);
    
    // メタデータ作成
    const metadata = {
      fileId,
      fileName,
      fileSize,
      mimeType,
      recipientEmail,
      uploadedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + FILE_TTL_SECONDS * 1000).toISOString(),
      downloadAttempts: 0,
      maxDownloadAttempts: MAX_DOWNLOAD_ATTEMPTS,
      otpAttempts: 0,
      maxOtpAttempts: 5,
      lastOtpAttemptAt: null,
      otpLocked: false,
      otpLockedUntil: null
    };
    
    // KVに保存
    const metaKey = `file:${fileId}:meta`;
    const dataKey = `file:${fileId}:data`;
    
    await kv.set(metaKey, JSON.stringify(metadata), { ex: FILE_TTL_SECONDS });
    await kv.set(dataKey, encrypted, { ex: FILE_TTL_SECONDS });
    
    console.log(`[Upload] File stored in KV with TTL: ${FILE_TTL_SECONDS}s`);
    
    // ダウンロードURL生成
    const downloadLink = generateDownloadUrl(fileId);
    
    // メール送信
    const emailResult = await sendEmailNotification(recipientEmail, downloadLink, otp);
    
    // レスポンス作成
    const response = {
      success: true,
      fileId,
      fileName,
      fileSize,
      downloadLink,
      expiresIn: `${FILE_TTL_SECONDS / 86400} days`,
      email: {
        sent: emailResult.success && !emailResult.skipped,
        recipient: recipientEmail,
        ...emailResult
      }
    };
    
    // 非本番環境の場合はデバッグ情報を追加
    if (!isProduction()) {
      response._debug = {
        environment: envInfo,
        otp,
        fileId,
        metadata: {
          ...metadata,
          // パスワード関連は除外
        }
      };
    }
    
    console.log(`[Upload] Upload completed successfully`);
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('[Upload] Error:', error);
    
    return res.status(500).json({
      error: 'File upload failed',
      message: error.message,
      environment: envInfo.environment
    });
  }
}