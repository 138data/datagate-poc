// api/download.js - Phase 37 完全版（復号化 + 一時Blob）
const { kv } = require('@vercel/kv');
const { downloadFromBlob, uploadTemporaryBlob } = require('../lib/blob-storage');
const { decryptFile } = require('../lib/encryption');

// JSONボディ読み取り
async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
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

  try {
    const { fileId, otp } = await readJson(req);

    if (!fileId || !otp) {
      return res.status(400).json({ error: 'fileId and otp are required' });
    }

    // メタデータ取得
    const metaKey = `file:${fileId}:meta`;
    const metaRaw = await kv.get(metaKey);

    if (!metaRaw) {
      return res.status(404).json({ error: 'File not found or expired' });
    }

    const meta = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : metaRaw;

    // 期限チェック
    if (meta.expiresAt && Date.now() > new Date(meta.expiresAt).getTime()) {
      return res.status(410).json({ error: 'File expired' });
    }

    // OTP検証
    if (otp !== meta.otp) {
      return res.status(401).json({ error: 'Invalid OTP' });
    }

    // ダウンロード回数制限
    const max = meta.maxDownloads || 3;
    const used = meta.downloadCount || 0;

    if (used >= max) {
      return res.status(403).json({ error: 'Download limit exceeded' });
    }

    // blobKey チェック
    if (!meta.blobKey) {
      return res.status(500).json({
        error: 'File metadata corrupted',
        hint: 'blobKey not found'
      });
    }

    // salt/iv/authTag チェック
    if (!meta.salt || !meta.iv || !meta.authTag) {
      return res.status(500).json({
        error: 'Encryption metadata missing',
        hint: 'salt/iv/authTag required for decryption'
      });
    }

    console.log('[download] Step 1: Downloading encrypted file from Blob:', meta.blobKey);

    // Step 1: Blob から暗号化ファイルをダウンロード
    let encryptedBuffer;
    try {
      encryptedBuffer = await downloadFromBlob(meta.blobKey);
      console.log('[download] Encrypted file downloaded, size:', encryptedBuffer.length);
    } catch (blobError) {
      console.error('[download] Blob download error:', blobError);
      return res.status(500).json({
        error: 'Failed to download encrypted file',
        details: blobError.message
      });
    }

    console.log('[download] Step 2: Decrypting file...');

    // Step 2: 復号化（salt/iv/authTag を使用）
    let decryptedBuffer;
    try {
      // decryptFile(encryptedData, salt, iv, authTag) の順番
      decryptedBuffer = decryptFile(
        encryptedBuffer,
        meta.salt,
        meta.iv,
        meta.authTag
      );
      console.log('[download] File decrypted, size:', decryptedBuffer.length);
    } catch (decryptError) {
      console.error('[download] Decryption error:', decryptError);
      return res.status(500).json({
        error: 'Failed to decrypt file',
        details: decryptError.message
      });
    }

    console.log('[download] Step 3: Uploading to temporary Blob (5min TTL)...');

    // Step 3: 復号化済みファイルを一時Blob（5分TTL）にアップロード
    let tempBlob;
    try {
      tempBlob = await uploadTemporaryBlob(fileId, decryptedBuffer, meta.fileName, 300);
      console.log('[download] Temporary Blob created:', tempBlob.downloadUrl || tempBlob.url);
    } catch (uploadError) {
      console.error('[download] Temporary Blob upload error:', uploadError);
      return res.status(500).json({
        error: 'Failed to create temporary download URL',
        details: uploadError.message
      });
    }

    // Step 4: ダウンロード回数を更新
    meta.downloadCount = used + 1;

    // TTL計算
    let ttlSec = 7 * 24 * 60 * 60;
    if (meta.expiresAt) {
      const expiresAt = new Date(meta.expiresAt).getTime();
      const now = Date.now();
      ttlSec = Math.max(1, Math.floor((expiresAt - now) / 1000));
    }

    // メタデータを更新保存
    await kv.set(metaKey, meta, { ex: ttlSec });

    console.log('[download] Success! Returning download URL');

    // JSON応答（一時Blobの短寿命URL）
    return res.status(200).json({
      downloadUrl: tempBlob.downloadUrl || tempBlob.url || tempBlob,
      fileName: meta.fileName || meta.originalName || 'download',
      size: decryptedBuffer.length,
      remainingDownloads: Math.max(0, max - meta.downloadCount),
      expiresInSec: 300
    });

  } catch (error) {
    console.error('[download] Fatal error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
};