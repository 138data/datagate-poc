import { kv } from '@vercel/kv';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import pako from 'pako';
import formidable from 'formidable';
import fs from 'fs';

// S3クライアント初期化
const s3Client = new S3Client({
  region: 'us-east-1', // ★ハードコード済み
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ★バケット名もハードコード
const BUCKET_NAME = 'datagate-poc-138data';

// Vercel設定
export const config = {
//... (以下、変更なし) ...
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

// ヘルパー: OTP生成
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ヘルパー: ランダムsalt生成 (32バイト)
function generateSalt() {
  return crypto.randomBytes(32);
}

// ヘルパー: SHA256ハッシュ計算
function calculateSHA256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ヘルパー: 暗号化 (AES-256-GCM, 12バイトIV, ランダムsalt)
function encryptFile(buffer, password, salt) {
  const iv = crypto.randomBytes(12); // AES-GCM推奨: 12バイト
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // 形式: [IV(12) + authTag(16) + 暗号化データ]
  return Buffer.concat([iv, authTag, encrypted]);
}

// メイン処理
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let fileId = null;
  let tempPath = null;

  try {
    // 1. フォームデータ解析
    const form = formidable({
      maxFileSize: 50 * 1024 * 1024, // 50MB
      keepExtensions: true,
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const file = files.file?.[0];
    const to = fields.to?.[0];
    const from = fields.from?.[0];
    const subject = fields.subject?.[0] || '安全なファイル転送';
    const message = fields.message?.[0] || '';

    // バリデーション
    if (!file || !to || !from) {
      return res.status(400).json({
        error: 'ファイル、送信先、送信元は必須です',
      });
    }

    // 2. ファイル読み込み
    tempPath = file.filepath;
    const originalBuffer = fs.readFileSync(tempPath);
    const originalSize = originalBuffer.length;

    console.log(`[Upload] File: ${file.originalFilename}, Size: ${originalSize} bytes`);

    // 3. SHA256ハッシュ計算
    const sha256 = calculateSHA256(originalBuffer);
    console.log(`[Upload] SHA256: ${sha256}`);

    // 4. 圧縮
    const compressed = pako.gzip(originalBuffer, { level: 9 });
    const compressedSize = compressed.length;
    const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

    console.log(`[Upload] Compressed: ${compressedSize} bytes (${compressionRatio}% reduction)`);

    // 5. 暗号化準備
    fileId = crypto.randomBytes(16).toString('hex');
    const otp = generateOTP();
    const salt = generateSalt(); // ランダムsalt生成

    // 6. 暗号化
    const encryptedData = encryptFile(compressed, otp, salt);
    const encryptedSize = encryptedData.length;

    console.log(`[Upload] Encrypted: ${encryptedSize} bytes, FileID: ${fileId}`);

    // 7. S3アップロード
    const s3Key = `files/${fileId}`;
    const uploadCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: encryptedData,
      ContentType: 'application/octet-stream',
      Metadata: {
        'original-filename': Buffer.from(file.originalFilename).toString('base64'),
        'file-id': fileId,
      },
    });

    await s3Client.send(uploadCommand);
    console.log(`[Upload] S3 upload successful: ${s3Key}`);

    // 8. メタデータ保存 (KV)
    const metadata = {
      id: fileId,
      filename: file.originalFilename,
      size: originalSize,
      compressedSize,
      encryptedSize,
      compressionRatio: parseFloat(compressionRatio),
      mimeType: file.mimetype || 'application/octet-stream',
      to,
      from,
      subject,
      message,
      otp,
      salt: salt.toString('base64'), // Base64エンコードして保存
      sha256, // SHA256ハッシュ
      scanStatus: 'pending', // マルウェアスキャン状態
      otpAttempts: 0,
      otpLocked: false,
      downloaded: false,
      uploadedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7日後
      storageType: 's3',
      s3Key,
    };

    await kv.set(`file:${fileId}`, JSON.stringify(metadata));
    await kv.expire(`file:${fileId}`, 7 * 24 * 60 * 60); // 7日TTL

    console.log(`[Upload] Metadata saved to KV: file:${fileId}`);

    // 9. 統計更新
    try {
      await kv.incr('stats:totalFiles');
      await kv.incrby('stats:totalSize', originalSize);
    } catch (statsError) {
      console.error('[Upload] Stats update failed:', statsError);
    }

    // 10. メール送信
    const downloadUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://datagate-poc.vercel.app'}/download/${fileId}`;
    
    try {
      const emailService = await import('../../../lib/email-service.js');
      await emailService.sendFileNotification({
        to,
        from,
        subject,
        message,
        filename: file.originalFilename,
        fileSize: originalSize,
        downloadUrl,
        expiresAt: metadata.expiresAt,
      });
      console.log(`[Upload] Email sent to: ${to}`);
    } catch (emailError) {
      console.error('[Upload] Email failed:', emailError);
      // メール失敗時もファイルは保存済みなので処理続行
    }

    // 11. 成功レスポンス
    return res.status(200).json({
      success: true,
      fileId,
      downloadUrl,
      expiresAt: metadata.expiresAt,
      size: originalSize,
      compressed: compressedSize,
      compressionRatio: parseFloat(compressionRatio),
      sha256,
    });

  } catch (error) {
    console.error('[Upload] Error:', error);

    // クリーンアップ
    if (fileId) {
      try {
        await kv.del(`file:${fileId}`);
      } catch (cleanupError) {
        console.error('[Upload] Cleanup failed:', cleanupError);
      }
    }

    return res.status(500).json({
      error: 'ファイルアップロード中にエラーが発生しました',
      details: error.message,
    });
  } finally {
    // 一時ファイル削除
    if (tempPath) {
      try {
        fs.unlinkSync(tempPath);
      } catch (unlinkError) {
        console.error('[Upload] Temp file cleanup failed:', unlinkError);
      }
    }
  }
}