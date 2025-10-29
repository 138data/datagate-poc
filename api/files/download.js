// api/files/download.js - Node (req, res) handler format
import { kv } from '@vercel/kv';
import { decryptFile, verifyOTP } from '../../lib/encryption.js';
import { saveAuditLog } from '../../lib/audit-log.js';

const maskEmail = (mail) => {
  if (!mail || !mail.includes('@')) return '';
  const [l, d] = mail.split('@');
  const lm = l.length <= 2 ? l[0] + '*' : l[0] + '***' + l.slice(-1);
  const [d1, ...rest] = d.split('.');
  const dm = (d1.length <= 2 ? d1[0] + '*' : d1[0] + '***') + (rest.length ? '.' + rest.join('.') : '');
  return `${lm}@${dm}`;
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
  // CORS headers
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS
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

      const metadataJson = await kv.get(`file:${id}:meta`);
      const metadata = safeParseMeta(metadataJson);

      if (!metadata) {
        return res.status(404).json({ error: 'File not found' });
      }

      // 失効チェック
      if (metadata.revokedAt) {
        return res.status(403).json({ error: 'File has been revoked' });
      }

      // レスポンス
      return res.status(200).json({
        fileName: metadata.fileName,
        fileSize: metadata.fileSize,
        uploadedAt: metadata.uploadedAt,
        expiresAt: metadata.expiresAt,
        downloadCount: metadata.downloadCount || 0,
        maxDownloads: metadata.maxDownloads || 3,
        maskedEmail: maskEmail(metadata.recipient)
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

      const { fileId, otp } = body;

      if (!fileId || !otp) {
        return res.status(400).json({ error: 'Missing fileId or otp' });
      }

      const metadataJson = await kv.get(`file:${fileId}:meta`);
      const metadata = safeParseMeta(metadataJson);

      if (!metadata) {
        return res.status(404).json({ error: 'File not found' });
      }

      // 失効チェック
      if (metadata.revokedAt) {
        await saveAuditLog({
          event: 'download_blocked',
          actor: metadata.recipient,
          fileId,
          fileName: metadata.fileName,
          reason: 'revoked'
        });
        return res.status(403).json({ error: 'File has been revoked' });
      }

      // OTP検証
      if (!verifyOTP(otp, metadata.otp)) {
        await saveAuditLog({
          event: 'download_failed',
          actor: metadata.recipient,
          fileId,
          fileName: metadata.fileName,
          reason: 'invalid_otp'
        });
        return res.status(401).json({ error: 'Invalid OTP' });
      }

      // ダウンロード回数チェック
      const downloadCount = metadata.downloadCount || 0;
      const maxDownloads = metadata.maxDownloads || 3;

      if (downloadCount >= maxDownloads) {
        await saveAuditLog({
          event: 'download_blocked',
          actor: metadata.recipient,
          fileId,
          fileName: metadata.fileName,
          reason: 'max_downloads_exceeded'
        });
        return res.status(403).json({ error: 'Maximum download limit reached' });
      }

      // 暗号化データ取得
      const encryptedDataJson = await kv.get(`file:${fileId}:data`);
      
      if (!encryptedDataJson) {
        return res.status(404).json({ error: 'File data not found' });
      }

      let encryptedDataObj;
      if (typeof encryptedDataJson === 'string') {
        encryptedDataObj = JSON.parse(encryptedDataJson);
      } else {
        encryptedDataObj = encryptedDataJson;
      }

      // 復号化
      const encryptedBuffer = Buffer.from(encryptedDataObj.data, 'base64');
      const decryptedBuffer = decryptFile(
        encryptedBuffer,
        encryptedDataObj.salt,
        encryptedDataObj.iv,
        encryptedDataObj.authTag
      );

      // ダウンロード回数更新
      metadata.downloadCount = downloadCount + 1;
      await kv.set(`file:${fileId}:meta`, JSON.stringify(metadata), {
        ex: 7 * 24 * 60 * 60
      });

      // 監査ログ
      await saveAuditLog({
        event: 'download_success',
        actor: metadata.recipient,
        fileId,
        fileName: metadata.fileName,
        size: metadata.fileSize,
        downloadCount: metadata.downloadCount
      });

      // ファイル送信
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${metadata.fileName}"; filename*=UTF-8''${encodeURIComponent(metadata.fileName)}`);
      res.setHeader('Content-Length', decryptedBuffer.length);
      return res.status(200).end(decryptedBuffer);
    }

    // その他のメソッド
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[ERROR]', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};