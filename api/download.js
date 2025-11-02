import crypto from 'crypto';
import { kv } from '@vercel/kv';

// KDF設定
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';

// 復号化関数
function decryptFile(encryptedBuffer, password) {
  const salt = encryptedBuffer.subarray(0, 16);
  const iv = encryptedBuffer.subarray(16, 28);
  const tag = encryptedBuffer.subarray(28, 44);
  const encrypted = encryptedBuffer.subarray(44);

  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export default async function handler(req, res) {
  // Cache-Control: no-store を追加
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    // GET: ダウンロードページ表示用の情報取得
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ success: false, error: 'ファイルIDが指定されていません' });
    }

    try {
      const metadata = await kv.get(`file:${id}:meta`);

      if (!metadata) {
        return res.status(404).json({ success: false, error: 'ファイルが見つかりませんでした' });
      }

      return res.status(200).json({
        success: true,
        fileName: metadata.fileName,
        fileSize: metadata.fileSize,
        uploadedAt: metadata.uploadedAt,
      });
    } catch (error) {
      console.error('Download GET error:', error);
      return res.status(500).json({ success: false, error: 'ファイル情報の取得に失敗しました' });
    }
  }

  if (req.method === 'POST') {
    // POST: OTP検証 → JSON で downloadUrl を返す
    const { fileId, otp } = req.body;

    if (!fileId || !otp) {
      return res.status(400).json({ success: false, error: 'ファイルIDまたはOTPが指定されていません' });
    }

    try {
      const metadata = await kv.get(`file:${fileId}:meta`);

      if (!metadata) {
        return res.status(404).json({ success: false, error: 'ファイルが見つかりませんでした' });
      }

      // 試行回数制限（5回）
      if (metadata.failedAttempts >= 5) {
        return res.status(403).json({ success: false, error: 'OTPの入力回数が上限に達しました（15分後に再試行してください）' });
      }

      // OTP検証
      if (metadata.otp !== otp) {
        metadata.failedAttempts += 1;
        await kv.set(`file:${fileId}:meta`, metadata, { keepTtl: true });
        return res.status(401).json({ success: false, error: 'OTPが正しくありません' });
      }

      // OTP正解 → 短TTLの署名付きトークンを生成
      const token = crypto.randomBytes(32).toString('hex');
      await kv.set(`download-token:${token}`, { fileId, exp: Date.now() + 5 * 60 * 1000 }, { ex: 300 }); // 5分

      // downloadUrl を返す（契約準拠）
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;
      const downloadUrl = `${baseUrl}/api/download-blob?token=${token}`;

      return res.status(200).json({
        success: true,
        downloadUrl: downloadUrl,
      });
    } catch (error) {
      console.error('Download POST error:', error);
      return res.status(500).json({ success: false, error: 'ダウンロード処理に失敗しました' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}