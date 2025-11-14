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

// --- (ここからデバッグ版) ---
function decryptFile(encryptedBuffer, password, salt) {
  console.log('[DEBUG] decryptFile: CALLED');
  try {
    console.log('[DEBUG] decryptFile: Trying 12-byte IV (new)...');
    return decryptWithIVLength(encryptedBuffer, password, salt, 12);
  } catch (error) {
    console.log(`[DEBUG] 12-byte IV failed: ${error.message}. Trying 16-byte IV (legacy)...`);
    try {
      return decryptWithIVLength(encryptedBuffer, password, salt, 16);
    } catch (legacyError) {
      console.log(`[DEBUG] 16-byte IV failed: ${legacyError.message}`);
      throw new Error('復号化に失敗しました（IVサイズ不一致）');
    }
  }
}

function decryptWithIVLength(encryptedBuffer, password, salt, ivLength) {
  console.log(`[DEBUG] decryptWithIVLength: CALLED (ivLength: ${ivLength})`);
  
  console.log('[DEBUG] decryptWithIVLength: Slicing IV...');
  const iv = encryptedBuffer.subarray(0, ivLength);
  
  console.log('[DEBUG] decryptWithIVLength: Slicing AuthTag...');
  const authTag = encryptedBuffer.subarray(ivLength, ivLength + 16);
  
  console.log('[DEBUG] decryptWithIVLength: Slicing EncryptedData...');
  const encryptedData = encryptedBuffer.subarray(ivLength + 16);

  console.log('[DEBUG] decryptWithIVLength: Deriving key (pbkdf2Sync)...');
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  
  console.log('[DEBUG] decryptWithIVLength: Creating decipher...');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  
  console.log('[DEBUG] decryptWithIVLength: Setting AuthTag...');
  decipher.setAuthTag(authTag);

  console.log('[DEBUG] decryptWithIVLength: Decrypting (update/final)...');
  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  
  console.log('[DEBUG] decryptWithIVLength: SUCCESS');
  return decrypted;
}
// --- (デバッグ版ここまで) ---

// メイン処理
export default async function handler(req, res) {
  const { fileId } = req.query;

  // GET: メタデータ取得 (変更なし)
  if (req.method === 'GET') {
    try {
      const metadataStr = await kv.get(`file:${fileId}`);
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
    console.log(`[DEBUG] POST /api/files/download/${fileId}: HANDLER START`);
    try {
      const { otp } = req.body;
      if (!otp) {
        console.log('[DEBUG] POST: Error 400 - OTP required');
        return res.status(400).json({ error: 'OTPが必要です' });
      }

      // 1. メタデータ取得
      console.log('[DEBUG] POST: Getting metadata from KV...');
      const metadataStr = await kv.get(`file:${fileId}`);
      if (!metadataStr) {
        console.log('[DEBUG] POST: Error 404 - File not found in KV');
        return res.status(404).json({ error: 'ファイルが見つかりません' });
      }
      const metadata = JSON.parse(metadataStr);
      console.log('[DEBUG] POST: Metadata OK');

      // 2. OTPロック確認 (変更なし)
      if (metadata.otpLocked) {
        const lockExpiry = new Date(metadata.otpLockedUntil);
        if (lockExpiry > new Date()) {
          console.log('[DEBUG] POST: Error 403 - OTP locked');
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
          console.log('[DEBUG] POST: Error 403 - OTP 5 attempts failed');
          return res.status(403).json({
            error: 'OTP試行回数超過（5回）',
            lockedUntil: metadata.otpLockedUntil,
          });
        }
        await kv.set(`file:${fileId}`, JSON.stringify(metadata));
        console.log('[DEBUG] POST: Error 401 - Invalid OTP');
        return res.status(401).json({
          error: 'OTPが正しくありません',
          attemptsRemaining: 5 - metadata.otpAttempts,
        });
      }
      console.log('[DEBUG] POST: OTP OK');

      // 4. S3からファイル取得
      const s3Key = metadata.s3Key || `files/${fileId}`;
      console.log(`[DEBUG] POST: Fetching from S3: ${s3Key}`);
      const getCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      });
      const s3Response = await s3Client.send(getCommand);
      const encryptedBuffer = await streamToBuffer(s3Response.Body);
      console.log(`[DEBUG] POST: S3 file fetched: ${encryptedBuffer.length} bytes`);

      // 5. 復号化 (saltを使用)
      console.log('[DEBUG] POST: Decoding salt from base64...');
      const salt = Buffer.from(metadata.salt, 'base64');
      console.log('[DEBUG] POST: Calling decryptFile...');
      const decrypted = decryptFile(encryptedBuffer, metadata.otp, salt);
      console.log(`[DEBUG] POST: Decrypted: ${decrypted.length} bytes`);

      // 6. 解凍
      console.log('[DEBUG] POST: Ungzipping...');
      const decompressed = pako.ungzip(decrypted);
      console.log(`[DEBUG] POST: Decompressed: ${decompressed.length} bytes`);

      // 7. ダウンロード状態更新
      console.log('[DEBUG] POST: Updating KV status to downloaded...');
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
      console.log('[DEBUG] POST: Sending file buffer to response...');
      const filename = metadata.filename;
      const encodedFilename = encodeURIComponent(filename);
      const fallbackFilename = filename.replace(/[^\x00-\x7F]/g, '_');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`
      );
      res.setHeader('Content-Length', decompressed.length);
      
      console.log('[DEBUG] POST: HANDLER SUCCESS');
      return res.status(200).send(Buffer.from(decompressed));

    } catch (error) {
      console.error('[Download POST] CRITICAL ERROR:', error); // ★デバッグログ
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