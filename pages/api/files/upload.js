const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Readable } = require('stream');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multiparty = require('multiparty');
const { kv } = require('@vercel/kv');
const sendEmail = require('../../lib/email-service');

// S3クライアントの初期化
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const S3_BUCKET = process.env.S3_BUCKET || 'datagate-poc-138data';

// Helper: multiparty form parsing
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new multiparty.Form();
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

// Helper: Read file stream into buffer
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Encryption function
function encryptData(buffer, password) {
  const algorithm = 'aes-256-gcm';
  const salt = crypto.randomBytes(32);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted: Buffer.concat([salt, iv, authTag, encrypted]),
    key: key.toString('hex')
  };
}

// Upload to S3
async function uploadToS3(key, buffer, metadata = {}) {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    Metadata: metadata,
    ServerSideEncryption: 'AES256',
  });

  await s3Client.send(command);
  return `s3://${S3_BUCKET}/${key}`;
}

// Check S3 object exists
async function checkS3Exists(key) {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

// Main handler
module.exports = async function handler(req, res) {
  console.log('[Upload] Request received:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse multipart form
    const { fields, files } = await parseForm(req);
    
    if (!files.file || !files.file[0]) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = files.file[0];
    const recipientEmail = fields.recipientEmail ? fields.recipientEmail[0] : null;
    const uploaderEmail = fields.uploaderEmail ? fields.uploaderEmail[0] : null;
    
    console.log('[Upload] Processing file:', {
      name: file.originalFilename,
      size: file.size,
      recipient: recipientEmail
    });

    // Read file into buffer
    const fs = require('fs');
    const fileBuffer = fs.readFileSync(file.path);

    // Generate IDs and password
    const fileId = crypto.randomBytes(16).toString('hex');
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const password = crypto.randomBytes(16).toString('hex');

    // Encrypt file
    const { encrypted } = encryptData(fileBuffer, password);
    
    // Upload to S3
    const s3Key = `encrypted/${fileId}`;
    await uploadToS3(s3Key, encrypted, {
      originalName: file.originalFilename,
      contentType: file.headers['content-type'] || 'application/octet-stream',
      uploadDate: new Date().toISOString(),
    });

    // Store metadata in KV (not the file itself)
    const metadata = {
      id: fileId,
      fileName: file.originalFilename,
      fileSize: file.size,
      mimeType: file.headers['content-type'] || 'application/octet-stream',
      uploadDate: new Date().toISOString(),
      uploaderEmail,
      recipientEmail,
      otp,
      password,
      otpAttempts: 0,
      downloaded: false,
      s3Bucket: S3_BUCKET,
      s3Key: s3Key,
      storageType: 's3',
    };

    await kv.set(`file:${fileId}`, metadata, { ex: 7 * 24 * 60 * 60 });

    // Send email if recipient provided
    if (recipientEmail) {
      const downloadUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://datagate-poc.vercel.app'}/download/${fileId}`;
      
      try {
        await sendEmail({
          to: recipientEmail,
          subject: `【DataGate】ファイル受信通知: ${file.originalFilename}`,
          text: `
ファイルが共有されました。

ファイル名: ${file.originalFilename}
ダウンロードURL: ${downloadUrl}
認証コード: ${otp}

このリンクは7日間有効です。
          `,
          html: `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #333;">ファイル受信通知</h2>
  <p>以下のファイルが共有されました。</p>
  <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
    <p><strong>ファイル名:</strong> ${file.originalFilename}</p>
    <p><strong>送信者:</strong> ${uploaderEmail || '不明'}</p>
    <p><strong>認証コード:</strong> <span style="font-size: 24px; color: #007bff; font-weight: bold;">${otp}</span></p>
  </div>
  <p>以下のリンクからダウンロードできます（7日間有効）：</p>
  <a href="${downloadUrl}" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px;">ファイルをダウンロード</a>
</div>
          `
        });
        console.log('[Upload] Email sent successfully');
      } catch (error) {
        console.error('[Upload] Email send error:', error);
      }
    }

    // Return response
    res.status(200).json({
      success: true,
      fileId,
      fileName: file.originalFilename,
      downloadUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://datagate-poc.vercel.app'}/download/${fileId}`,
      otp: recipientEmail ? undefined : otp, // Only show OTP if no email sent
      message: recipientEmail ? `認証コードを ${recipientEmail} に送信しました` : '認証コードを使用してダウンロードしてください'
    });

  } catch (error) {
    console.error('[Upload] Error:', error);
    res.status(500).json({ 
      error: 'アップロード処理に失敗しました',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports.config = {
  api: {
    bodyParser: false,
    sizeLimit: '100mb'
  }
};