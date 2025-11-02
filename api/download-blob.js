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

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ success: false, error: 'トークンが指定されていません' });
  }

  try {
    // トークン検証
    const tokenData = await kv.get(`download-token:${token}`);

    if (!tokenData) {
      return res.status(404).json({ success: false, error: 'トークンが無効または期限切れです' });
    }

    if (Date.now() > tokenData.exp) {
      await kv.del(`download-token:${token}`);
      return res.status(410).json({ success: false, error: 'トークンの有効期限が切れました' });
    }

    const { fileId } = tokenData;

    // メタデータとデータ取得
    const metadata = await kv.get(`file:${fileId}:meta`);
    const encryptedBase64 = await kv.get(`file:${fileId}:data`);

    if (!metadata || !encryptedBase64) {
      return res.status(404).json({ success: false, error: 'ファイルが見つかりませんでした' });
    }

    // 復号化
    const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');
    const decryptedData = decryptFile(encryptedBuffer, metadata.otp);

    // ファイル名のエンコード（RFC 5987）
    const encodedFileName = encodeURIComponent(metadata.fileName).replace(/['()]/g, escape).replace(/\*/g, '%2A');

    // バイナリ配信
    res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="file"; filename*=UTF-8''${encodedFileName}`);
    res.setHeader('Content-Length', decryptedData.length);

    // トークン削除（ワンタイム）
    await kv.del(`download-token:${token}`);

    return res.status(200).send(decryptedData);
  } catch (error) {
    console.error('Download blob error:', error);
    return res.status(500).json({ success: false, error: 'ダウンロード処理に失敗しました' });
  }
}