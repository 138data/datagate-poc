// api/files/download.js - Phase 35a-v2: 短寿命URL返却版
const { kv } = require('@vercel/kv');
const { decryptFile, verifyOTP } = require('../../lib/encryption');
const { saveAuditLog } = require('../../lib/audit-log');
const { downloadFromBlob, uploadTemporaryBlob, deleteTemporaryBlob } = require('../../lib/blob-storage');

const maskEmail = (mail) => {
  if (!mail || !mail.includes('@')) return '';
  const [l, d] = mail.split('@');
  const lm = l.length <= 2 ? l[0] + '*' : l[0] + '***' + l.slice(-1);
  const [d1, ...rest] = d.split('.');
  const dm = (d1.length <= 2 ? d1[0] + '*' : d1[0] + '***') + (rest.length ? '.' + rest.join('.') : '');
  return lm + '@' + dm;
};

const safeParseMeta = (metaVal) => {
  if (!metaVal) return null;
  if (typeof metaVal === 'string') {
    try { return JSON.parse(metaVal); } catch { return null; }
  }
  if (typeof metaVal === 'object') return metaVal;
  return null;
};

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GET: ファイル情報取得
    if (req.method === 'GET') {
      const id = req.query.id;

      if (!id) {
        return res.status(400).json({ error: 'Missing file ID' });
      }

      const metadataJson = await kv.get('file:' + id + ':meta');
      const metadata = safeParseMeta(metadataJson);

      if (!metadata) {
        return res.status(404).json({ error: 'File not found' });
      }

      if (metadata.revokedAt) {
        return res.status(403).json({ error: 'File has been revoked' });
      }

      return res.status(200).json({
        success: true,
        fileName: metadata.fileName,
        fileSize: metadata.fileSize,
        uploadedAt: metadata.uploadedAt,
        expiresAt: metadata.expiresAt,
        downloadCount: metadata.downloadCount || 0,
        maxDownloads: metadata.maxDownloads || 3,
        maskedEmail: maskEmail(metadata.recipient)
      });
    }

    // POST: OTP検証 + 一時Blob生成 + downloadUrl返却
    if (req.method === 'POST') {
      let body;
      if (typeof req.body === 'string') {
        body = JSON.parse(req.body);
      } else {
        body = req.body;
      }

      const fileId = body.fileId;
      const otp = body.otp;

      if (!fileId || !otp) {
        return res.status(400).json({ error: 'Missing fileId or otp' });
      }

      const metadataJson = await kv.get('file:' + fileId + ':meta');
      const metadata = safeParseMeta(metadataJson);

      if (!metadata) {
        return res.status(404).json({ error: 'File not found' });
      }

      if (metadata.revokedAt) {
        await saveAuditLog({
          event: 'download_blocked',
          actor: metadata.recipient,
          fileId: fileId,
          fileName: metadata.fileName,
          reason: 'revoked'
        });
        return res.status(403).json({ error: 'File has been revoked' });
      }

      if (!verifyOTP(otp, metadata.otp)) {
        await saveAuditLog({
          event: 'download_failed',
          actor: metadata.recipient,
          fileId: fileId,
          fileName: metadata.fileName,
          reason: 'invalid_otp'
        });
        return res.status(401).json({ error: 'Invalid OTP' });
      }

      const downloadCount = metadata.downloadCount || 0;
      const maxDownloads = metadata.maxDownloads || 3;

      if (downloadCount >= maxDownloads) {
        await saveAuditLog({
          event: 'download_blocked',
          actor: metadata.recipient,
          fileId: fileId,
          fileName: metadata.fileName,
          reason: 'max_downloads_exceeded'
        });
        return res.status(403).json({ error: 'Maximum download limit reached' });
      }

      // ========================================
      // Phase 35a-v2: 短寿命URL生成方式
      // ========================================

      // 1. 暗号化ファイルをBlobからダウンロード
      console.log('[INFO] Downloading encrypted file from Blob:', metadata.blobUrl);
      const encryptedBuffer = await downloadFromBlob(metadata.blobUrl);
      console.log('[INFO] Downloaded encrypted file:', encryptedBuffer.length, 'bytes');

      // 2. 復号化
      const decryptedBuffer = decryptFile(
        encryptedBuffer,
        metadata.salt,
        metadata.iv,
        metadata.authTag
      );
      console.log('[INFO] Decrypted file size:', decryptedBuffer.length, 'bytes');

      // 3. 復号化済みファイルを一時Blobにアップロード（TTL: 5分）
      const tempBlob = await uploadTemporaryBlob(
        fileId,
        decryptedBuffer,
        metadata.fileName,
        300  // 5分間有効
      );
      console.log('[INFO] Temporary blob created:', tempBlob.downloadUrl);

      // 4. ダウンロード回数更新
      metadata.downloadCount = downloadCount + 1;
      metadata.lastDownloadAt = new Date().toISOString();
      await kv.set('file:' + fileId + ':meta', JSON.stringify(metadata), {
        ex: 7 * 24 * 60 * 60
      });

      // 5. 監査ログ記録（URL発行）
      await saveAuditLog({
        event: 'download_url_issued',
        actor: metadata.recipient,
        fileId: fileId,
        fileName: metadata.fileName,
        size: metadata.fileSize,
        downloadCount: metadata.downloadCount,
        tempBlobKey: tempBlob.blobKey,
        expiresInSec: 300
      });

      // 6. JSONレスポンス返却（バイナリは返さない）
      return res.status(200).json({
        success: true,
        fileId: fileId,
        fileName: metadata.fileName,
        fileSize: metadata.fileSize,
        downloadUrl: tempBlob.downloadUrl,
        expiresInSec: 300,
        remainingDownloads: maxDownloads - metadata.downloadCount
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[ERROR]', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};
