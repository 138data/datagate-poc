import { kv } from '@vercel/kv';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import pako from 'pako';

// S3クライアント初期化
const s3Client = new S3Client({
  region: 'us-east-1', // ★環境変数から変更
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

// ヘルパー: 復号化 (互換性対応 - 12/16バイトIV両対応)
function decryptFile(encryptedBuffer, password, salt) {
  // IVサイズ判定 (先頭バイトから推定)
  // 12バイトIV: [IV(12) + authTag(16) + data]
  // 16バイトIV: [IV(16) + authTag(16) + data] (旧形式)
  
  let ivLength = 12; // デフォルト: 新形式
  
  // 旧形式の可能性チェック (最小サイズ: 16 + 16 = 32)
  if (encryptedBuffer.length >= 32 + 16) {
    // 簡易判定: 新形式で復号試行 → 失敗したら旧形式で再試行
    // ここでは新形式優先、失敗時に旧形式フォールバック
  }

  try {
    // 新形式で試行 (12バイトIV)
    return decryptWithIVLength(encryptedBuffer, password, salt, 12);
  } catch (error) {
    console.log('[Decrypt] 12-byte IV failed, trying 16-byte IV (legacy)...');
    try {
      // 旧形式で再試行 (16バイトIV)
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

  return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
}

// メイン処理
export default async function handler(req, res) {
  const { fileId } = req.query;

  // GET: メタデータ取得
  if (req.method === 'GET') {
    try {
      const metadataStr = await kv.get(`file:${fileId}`);
      if (!metadataStr) {
        return res.status(404).json({ error: 'ファイルが見つかりません' });
      }

      const metadata = JSON.parse(metadataStr);

      // OTPロック確認
      if (metadata.otpLocked) {
        const lockExpiry = new Date(metadata.otpLockedUntil);
        if (lockExpiry > new Date()) {
          return res.status(403).json({
            error: 'OTP試行回数超過',
            lockedUntil: metadata.otpLockedUntil,
          });
        } else {
          // ロック期限切れ → リセット
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
        scanStatus: metadata.scanStatus || 'unknown', // スキャン状態
        sha256: metadata.sha256 || null, // ハッシュ
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

      // 2. OTPロック確認
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

      // 3. OTP検証
      if (otp !== metadata.otp) {
        metadata.otpAttempts = (metadata.otpAttempts || 0) + 1;

        // 5回失敗 → 15分ロック
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
      console.log(`[Download] Fetching from S3: ${s3Key}`);

      const getCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      });

      const s3Response = await s3Client.send(getCommand);
      const encryptedBuffer = await streamToBuffer(s3Response.Body);

      console.log(`[Download] S3 file fetched: ${encryptedBuffer.length} bytes`);

      // 5. 復号化 (saltを使用)
      const salt = Buffer.from(metadata.salt, 'base64');
      const decrypted = decryptFile(encryptedBuffer, metadata.otp, salt);

      console.log(`[Download] Decrypted: ${decrypted.length} bytes`);

      // 6. 解凍
      const decompressed = pako.ungzip(decrypted);

      console.log(`[Download] Decompressed: ${decompressed.length} bytes`);

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
      console.error('[Download POST] Error:', error);

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