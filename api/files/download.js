// api/files/download.js - Vercel Blob対応版（OTP試行回数制限追加）
const { kv } = require('@vercel/kv');
const { decryptFile, verifyOTP } = require('../../lib/encryption');
const { saveAuditLog } = require('../../lib/audit-log');
const { downloadFromBlob } = require('../../lib/blob-storage');

const MAX_OTP_ATTEMPTS = 5;

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
        return res.status(403).json({ 
          success: false,
          error: 'File has been revoked',
          message: 'このファイルは無効化されています'
        });
      }

      const otpAttempts = metadata.otpAttempts || 0;
      const remainingAttempts = Math.max(0, MAX_OTP_ATTEMPTS - otpAttempts);

      return res.status(200).json({
        success: true,
        fileName: metadata.fileName,
        fileSize: metadata.fileSize,
        uploadedAt: metadata.uploadedAt,
        expiresAt: metadata.expiresAt,
        downloadCount: metadata.downloadCount || 0,
        maxDownloads: metadata.maxDownloads || 3,
        recipientMasked: maskEmail(metadata.recipient),
        otpAttempts: otpAttempts,
        maxOtpAttempts: MAX_OTP_ATTEMPTS,
        remainingAttempts: remainingAttempts
      });
    }

    // POST: OTP検証 + ダウンロード
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
        return res.status(404).json({ 
          error: 'File not found',
          message: 'ファイルが見つかりません'
        });
      }

      if (metadata.revokedAt) {
        await saveAuditLog({
          event: 'download_blocked',
          actor: metadata.recipient,
          fileId: fileId,
          fileName: metadata.fileName,
          reason: 'revoked'
        });
        return res.status(403).json({ 
          error: 'File has been revoked',
          message: 'このファイルは無効化されています'
        });
      }

      // OTP試行回数チェック
      const otpAttempts = metadata.otpAttempts || 0;
      if (otpAttempts >= MAX_OTP_ATTEMPTS) {
        await saveAuditLog({
          event: 'download_blocked',
          actor: metadata.recipient,
          fileId: fileId,
          fileName: metadata.fileName,
          reason: 'max_otp_attempts_exceeded',
          otpAttempts: otpAttempts
        });
        return res.status(403).json({ 
          error: 'Maximum OTP attempts exceeded',
          message: 'OTP試行回数の上限に達しました。このファイルは無効化されています。',
          otpAttempts: otpAttempts,
          maxOtpAttempts: MAX_OTP_ATTEMPTS,
          locked: true
        });
      }

      // OTP検証
      if (!verifyOTP(otp, metadata.otp)) {
        // 試行回数をインクリメント
        metadata.otpAttempts = otpAttempts + 1;
        
        // 最大試行回数に達したらファイルを無効化
        if (metadata.otpAttempts >= MAX_OTP_ATTEMPTS) {
          metadata.revokedAt = new Date().toISOString();
          metadata.revokeReason = 'max_otp_attempts_exceeded';
        }
        
        // メタデータを更新
        await kv.set('file:' + fileId + ':meta', JSON.stringify(metadata), {
          ex: 7 * 24 * 60 * 60
        });
        
        const remainingAttempts = Math.max(0, MAX_OTP_ATTEMPTS - metadata.otpAttempts);
        
        await saveAuditLog({
          event: 'download_failed',
          actor: metadata.recipient,
          fileId: fileId,
          fileName: metadata.fileName,
          reason: 'invalid_otp',
          otpAttempts: metadata.otpAttempts,
          remainingAttempts: remainingAttempts
        });
        
        return res.status(401).json({ 
          error: 'Invalid OTP',
          message: 'OTP認証に失敗しました',
          otpAttempts: metadata.otpAttempts,
          remainingAttempts: remainingAttempts,
          maxOtpAttempts: MAX_OTP_ATTEMPTS,
          locked: metadata.otpAttempts >= MAX_OTP_ATTEMPTS
        });
      }

      // OTP検証成功 - ダウンロード回数チェック
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
        return res.status(403).json({ 
          error: 'Maximum download limit reached',
          message: 'ダウンロード回数の上限に達しました'
        });
      }

      // Blob からダウンロード
      console.log('[INFO] Downloading from Blob:', metadata.blobUrl);
      const encryptedBuffer = await downloadFromBlob(metadata.blobUrl);
      console.log('[INFO] Downloaded from Blob:', encryptedBuffer.length, 'bytes');

      // 復号化
      const decryptedBuffer = decryptFile(
        encryptedBuffer,
        metadata.salt,
        metadata.iv,
        metadata.authTag
      );

      console.log('[INFO] Decrypted file size:', decryptedBuffer.length, 'bytes');

      // ダウンロード回数更新 & OTP試行回数リセット
      metadata.downloadCount = downloadCount + 1;
      metadata.otpAttempts = 0;
      await kv.set('file:' + fileId + ':meta', JSON.stringify(metadata), {
        ex: 7 * 24 * 60 * 60
      });

      await saveAuditLog({
        event: 'download_success',
        actor: metadata.recipient,
        fileId: fileId,
        fileName: metadata.fileName,
        size: metadata.fileSize,
        downloadCount: metadata.downloadCount
      });

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="' + metadata.fileName + '"; filename*=UTF-8\'\'' + encodeURIComponent(metadata.fileName));
      res.setHeader('Content-Length', decryptedBuffer.length);
      return res.status(200).end(decryptedBuffer);
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
