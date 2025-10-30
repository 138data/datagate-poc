// api/files/download.js - Phase 35a: 短寿命URL返却版
const { kv } = require('@vercel/kv');
const { decryptFile } = require('../../lib/encryption');
const { downloadFromBlob, generateDownloadUrl } = require('../../lib/blob-storage');
const { saveAuditLog } = require('../../lib/audit-log');

module.exports = async function handler(req, res) {
  try {
    const method = req.method;

    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (method === 'OPTIONS') {
      return res.status(200).end();
    }

    // ========================================
    // GET: ファイル情報取得
    // ========================================
    if (method === 'GET') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'File ID is required' });
      }

      // メタデータ取得
      const metaKey = 'file:' + id + ':meta';
      const metaStr = await kv.get(metaKey);

      if (!metaStr) {
        return res.status(404).json({ error: 'File not found' });
      }

      const metadata = typeof metaStr === 'string' ? JSON.parse(metaStr) : metaStr;

      // 基本情報のみ返却（OTP・blobKeyは含めない）
      return res.status(200).json({
        fileId: id,
        fileName: metadata.fileName,
        fileSize: metadata.fileSize,
        recipient: metadata.recipient,
        downloadCount: metadata.downloadCount || 0,
        maxDownloads: metadata.maxDownloads || 3,
        expiresAt: metadata.expiresAt
      });
    }

    // ========================================
    // POST: OTP検証 + 短寿命URL発行
    // ========================================
    if (method === 'POST') {
      const body = req.body;
      const fileId = body.fileId;
      const otp = body.otp;

      if (!fileId || !otp) {
        return res.status(400).json({ error: 'fileId and otp are required' });
      }

      // メタデータ取得
      const metaKey = 'file:' + fileId + ':meta';
      const metaStr = await kv.get(metaKey);

      if (!metaStr) {
        await saveAuditLog({
          event: 'download_failed',
          actor: 'unknown',
          fileId: fileId,
          reason: 'file_not_found'
        });
        return res.status(404).json({ error: 'File not found or expired' });
      }

      const metadata = typeof metaStr === 'string' ? JSON.parse(metaStr) : metaStr;

      // OTP検証
      if (metadata.otp !== otp) {
        await saveAuditLog({
          event: 'download_failed',
          actor: metadata.recipient,
          fileId: fileId,
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
          fileId: fileId,
          reason: 'max_downloads_reached'
        });
        return res.status(403).json({ error: 'Maximum download limit reached' });
      }

      // ========================================
      // Phase 35a: 短寿命URL発行（ファイル本体は返さない）
      // ========================================
      
      // ダウンロード回数更新
      metadata.downloadCount = downloadCount + 1;
      await kv.set(metaKey, JSON.stringify(metadata), {
        ex: 7 * 24 * 60 * 60
      });

      // blobKeyからblobUrlを取得
      // Phase 34では metadata.blobUrl が保存されているため、それを使用
      const blobUrl = metadata.blobUrl || metadata.blobKey;

      // 短寿命URL生成（5分間有効）
      const { downloadUrl, expiresAt } = await generateDownloadUrl(blobUrl, 300);

      // 監査ログ
      await saveAuditLog({
        event: 'download_url_issued',
        actor: metadata.recipient,
        fileId: fileId,
        fileName: metadata.fileName,
        size: metadata.fileSize,
        downloadCount: metadata.downloadCount,
        urlExpiresAt: expiresAt
      });

      // ✅ Phase 35a: JSON のみ返却（バイナリ返送なし）
      return res.status(200).json({
        success: true,
        downloadUrl: downloadUrl,
        fileName: metadata.fileName,
        fileSize: metadata.fileSize,
        downloadCount: metadata.downloadCount,
        maxDownloads: maxDownloads,
        expiresAt: expiresAt
      });
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