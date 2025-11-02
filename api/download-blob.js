// api/download-blob.js - バイナリ返却（ワンタイムトークン）

import { kv } from '@vercel/kv';
import { decryptFile } from '../lib/encryption.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, otp } = req.body;

    if (!token || !otp) {
      return res.status(400).json({ error: 'Token and OTP are required' });
    }

    // トークン検証
    const fileId = await kv.get(`token:${token}`);
    if (!fileId) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // トークン削除（ワンタイム）
    await kv.del(`token:${token}`);

    // メタデータ取得
    const metaStr = await kv.get(`file:${fileId}:meta`);
    if (!metaStr) {
      return res.status(404).json({ error: 'File not found or expired' });
    }

    const metadata = JSON.parse(metaStr);

    // ダウンロード回数チェック
    if (metadata.downloadCount >= metadata.maxDownloads) {
      return res.status(403).json({ error: 'Download limit reached' });
    }

    // 暗号化データ取得
    const encryptedBase64 = await kv.get(`file:${fileId}:data`);
    if (!encryptedBase64) {
      return res.status(404).json({ error: 'File data not found' });
    }

    const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');

    // 復号化
    const decryptedBuffer = decryptFile(
      {
        encryptedBuffer,
        iv: metadata.iv,
        authTag: metadata.authTag,
        salt: metadata.salt
      },
      otp
    );

    // ダウンロード回数更新
    metadata.downloadCount += 1;
    await kv.set(`file:${fileId}:meta`, JSON.stringify(metadata), { keepTtl: true });

    console.log('[api/download-blob] File downloaded:', {
      fileId,
      fileName: metadata.fileName,
      downloadCount: metadata.downloadCount
    });

    // バイナリ返却
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(metadata.fileName)}"; filename*=UTF-8''${encodeURIComponent(metadata.fileName)}`
    );
    res.setHeader('Content-Length', decryptedBuffer.length);

    res.status(200).send(decryptedBuffer);

  } catch (error) {
    console.error('[api/download-blob] Error:', error);
    
    if (error.message.includes('Unsupported state or unable to authenticate data')) {
      return res.status(403).json({ error: 'Invalid OTP' });
    }

    res.status(500).json({
      error: 'Download failed',
      details: error.message
    });
  }
}