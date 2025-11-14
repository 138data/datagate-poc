const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Readable } = require('stream');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multiparty = require('multiparty');
const { kv } = require('@vercel/kv');
const sendEmail = require('../../lib/email-service.js');

// S3クライアントの初期化
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.S3_BUCKET || 'datagate-poc-138data';

// AES-256-GCM暗号化関数
function encryptBuffer(buffer) {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key-change-in-production', 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  return Buffer.concat([iv, authTag, encrypted]);
}

// OTP生成
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// メタデータ保存
async function storeMetadata(fileId, metadata) {
  const key = `file:${fileId}`;
  await kv.set(key, JSON.stringify(metadata), { ex: 7 * 24 * 60 * 60 });
}

// リクエストボディのパース（multipart/form-data）
function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const form = new multiparty.Form();
    const fields = {};
    const files = {};

    form.on('field', (name, value) => {
      fields[name] = value;
    });

    form.on('part', (part) => {
      if (part.filename) {
        const chunks = [];
        part.on('data', (chunk) => chunks.push(chunk));
        part.on('end', () => {
          files[part.name] = {
            filename: part.filename,
            contentType: part.headers['content-type'],
            buffer: Buffer.concat(chunks),
          };
        });
      } else {
        part.resume();
      }
    });

    form.on('close', () => resolve({ fields, files }));
    form.on('error', reject);
    form.parse(req);
  });
}

// S3アップロード
async function uploadToS3(fileId, encryptedBuffer, metadata) {
  const s3Key = `files/${fileId}`;
  
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: encryptedBuffer,
    ContentType: 'application/octet-stream',
    ServerSideEncryption: 'AES256',
    Metadata: {
      'original-filename': metadata.originalName,
      'uploaded-at': new Date().toISOString(),
    },
  });

  await s3Client.send(command);
  return s3Key;
}

// メイン処理
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[upload] Starting file upload process');

    // リクエストボディをパース
    const { fields, files } = await parseMultipartForm(req);

    const file = files.file;
    const recipientEmail = fields.recipientEmail;

    if (!file || !file.buffer) {
      console.error('[upload] No file provided');
      return res.status(400).json({ error: 'No file provided' });
    }

    if (!recipientEmail) {
      console.error('[upload] No recipient email provided');
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    console.log('[upload] File received:', {
      originalName: file.filename,
      size: file.buffer.length,
      type: file.contentType,
    });

    // ファイルID生成
    const fileId = crypto.randomBytes(16).toString('hex');
    console.log('[upload] Generated fileId:', fileId);

    // 暗号化
    const encryptedBuffer = encryptBuffer(file.buffer);
    console.log('[upload] File encrypted, size:', encryptedBuffer.length);

    // OTP生成
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // メタデータ作成
    const metadata = {
      fileId,
      originalName: file.filename,
      size: file.buffer.length,
      mimeType: file.contentType,
      recipientEmail,
      otp,
      verified: false,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      storage: 's3',
    };

    // S3にアップロード
    console.log('[upload] Uploading to S3...');
    const s3Key = await uploadToS3(fileId, encryptedBuffer, metadata);
    metadata.s3Key = s3Key;
    console.log('[upload] S3 upload complete:', s3Key);

    // KVにメタデータ保存
    await storeMetadata(fileId, metadata);
    console.log('[upload] Metadata stored in KV');

    // メール送信
    const emailSent = await sendEmail({
      to: recipientEmail,
      fileId,
      fileName: file.filename,
      fileSize: file.buffer.length,
      otp,
      expiresAt,
    });

    if (!emailSent) {
      console.warn('[upload] Email sending failed');
    }

    console.log('[upload] Upload process completed successfully');

    return res.status(200).json({
      success: true,
      fileId,
      recipientEmail,
      expiresAt: expiresAt.toISOString(),
      emailSent,
      storage: 's3',
    });
  } catch (error) {
    console.error('[upload] Error:', error);
    return res.status(500).json({
      error: 'Upload failed',
      details: error.message,
    });
  }
}

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};