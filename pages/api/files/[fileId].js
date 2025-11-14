import { kv } from '@vercel/kv';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import pako from 'pako';

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

function decryptFile(encryptedBuffer, password, salt) {
  try {
    return decryptWithIVLength(encryptedBuffer, password, salt, 12);
  } catch (error) {
    try {
      return decryptWithIVLength(encryptedBuffer, password, salt, 16);
    } catch (legacyError) {
      throw new Error('復号化に失敗しました（IVサイズ不一致）');
    }
  }
}

function decryptWithIVLength(encryptedBuffer, password, salt, ivLength) {
  const iv = encryptedBuffer.subarray(0, ivLength);
  const authTag = encryptedBuffer.subarray(ivLength, ivLength + 16);
  const encryptedData = encryptedBuffer.subarray(ivLength + 16);

  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  
  return decrypted;
}

// メイン処理
export default async function handler(req, res) {
  const { fileId } = req.query;

  // GET: メタデータ取得 (変更なし)
  if (req.method === 'GET') {
    try {
      if (!metadataStr) {
        return res.status(404).json({ error: 'ファイルが見つかりません' });
      }
      const metadata = JSON.parse(metadataStr);
      if (metadata.otpLocked) {
        const lockExpiry = new Date(metadata.otpLockedUntil);
        if (lockExpiry > new Date()) {
          return res.status(403).json({
            error: 'OTP試行回数超過',
            lockedUntil: metadata.otpLockedUntil,
          });
        } else {
          metadata.otpLocked = false;
          metadata.otpAttempts = 0;
          delete metadata.otpLockedUntil;
          await kv.set(`file:${fileId}`, JSON.stringify(metadata));
        }
      }
      return res.status(200).json({
        filename: metadata.filename,
        size: metadata.size,
        uploadedAt: metadata.uploadedAt,
        expiresAt: metadata.expiresAt,
        from: metadata.from,
        subject: metadata.subject,
        message: metadata.message,
        otpRequired: true,
        otpAttempts: metadata.otpAttempts,
        scanStatus: metadata.scanStatus || 'unknown',
        sha256: metadata.sha256 || null,
      });
    } catch (error) {
      console.error('[Download GET] Error:', error);
      return res.status(500).json({ error: 'メタデータ取得エラー' });
    }
  }

  // POST: OTP検証 + ダウンロード
  if (req.method === 'POST') {
    try {
      const { otp } = req.body;
      if (!otp) {
        return res.status(400).json({ error: 'OTPが必要です' });
      }

      // 1. メタデータ取得
      const metadataStr = await kv.get(`file:${fileId}`);
      if (!metadataStr) {
        return res.status(404).json({ error: 'ファイルが見つかりません' });
      }
      const metadata = JSON.parse(metadataStr);

      // 2. OTPロック確認 (変更なし)
      if (metadata.otpLocked) {
        const lockExpiry = new Date(metadata.otpLockedUntil);
        if (lockExpiry > new Date()) {
          return res.status(403).json({
            error: 'OTP試行回数超過',
            lockedUntil: metadata.otpLockedUntil,
          });
        } else {
          metadata.otpLocked = false;
          metadata.otpAttempts = 0;
          delete metadata.otpLockedUntil;
        }
      }

      // 3. OTP検証 (変更なし)
      if (otp !== metadata.otp) {
        metadata.otpAttempts = (metadata.otpAttempts || 0) + 1;
        if (metadata.otpAttempts >= 5) {
          metadata.otpLocked = true;
          metadata.otpLockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
          await kv.set(`file:${fileId}`, JSON.stringify(metadata));
          return res.status(403).json({
            error: 'OTP試行回数超過（5回）',
            lockedUntil: metadata.otpLockedUntil,
          });
        }
        await kv.set(`file:${fileId}`, JSON.stringify(metadata));
        return res.status(401).json({
          error: 'OTPが正しくありません',
          attemptsRemaining: 5 - metadata.otpAttempts,
        });
      }

      // 4. S3からファイル取得
      const s3Key = metadata.s3Key || `files/${fileId}`;
      const getCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      });
      const s3Response = await s3Client.send(getCommand);
      const encryptedBuffer = await streamToBuffer(s3Response.Body);

      // 5. 復号化 (saltを使用)
      const salt = Buffer.from(metadata.salt, 'base64');
      const decrypted = decryptFile(encryptedBuffer, metadata.otp, salt);

      // 6. 解凍
      const decompressed = pako.ungzip(decrypted);

      // 7. ダウンロード状態更新
      if (!metadata.downloaded) {
        metadata.downloaded = true;
        metadata.downloadedAt = new Date().toISOString();
        await kv.set(`file:${fileId}`, JSON.stringify(metadata));
        try {
          await kv.incr('stats:totalDownloads');
        } catch (statsError) {
          console.error('[Download] Stats update failed:', statsError);
        }
      }

      // 8. ファイル送信
      const filename = metadata.filename;
      const encodedFilename = encodeURIComponent(filename);
      const fallbackFilename = filename.replace(/[^\x00-\x7F]/g, '_');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`
      );
      res.setHeader('Content-Length', decompressed.length);
      
      return res.status(200).send(Buffer.from(decompressed));

    } catch (error) {
      if (error.message.includes('復号化に失敗')) {
        return res.status(400).json({ error: '復号化エラー（OTP不一致）' });
      }
      return res.status(500).json({
        error: 'ダウンロード処理エラー',
        details: error.message,
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ヘルパー: Stream → Buffer変換
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}