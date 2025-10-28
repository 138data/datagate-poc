// api/download.js - Phase 22対応版（KV完全対応）

// --- KVクライアントの安全取得 ---
let kvClient = null;
try {
  const mod = require('@vercel/kv');
  if (mod && mod.kv && typeof mod.kv.get === 'function') {
    kvClient = mod.kv;
  }
} catch (e) {
  console.warn('[download] @vercel/kv not available, using memory fallback');
}

module.exports = async (req, res) => {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET or POST.'
    });
  }

  // パラメータ取得
  let fileId, otp, action;

  if (req.method === 'GET') {
    fileId = req.query.id;
    otp = req.query.otp;
    action = req.query.action;
  } else {
    const body = req.body || {};
    fileId = body.fileId;
    otp = body.otp;
    action = body.action;
  }

  console.log('[download] Request:', { fileId, otp, action, method: req.method });

  // パラメータチェック
  if (!fileId) {
    return res.status(400).json({
      success: false,
      error: 'ファイルIDが必要です'
    });
  }

  // メタデータ取得
  let fileInfo;

  try {
    if (kvClient && typeof kvClient.get === 'function') {
      const metaStr = await kvClient.get(`file:${fileId}:meta`);
      
      if (!metaStr) {
        console.log('[download] File not found in KV:', fileId);
        return res.status(404).json({
          success: false,
          error: 'ファイルが見つかりません（期限切れまたは削除済み）'
        });
      }

      fileInfo = JSON.parse(metaStr);
      console.log('[download] Retrieved from KV:', {
        fileName: fileInfo.fileName,
        otp: fileInfo.otp,
        downloadCount: fileInfo.downloadCount,
        maxDownloads: fileInfo.maxDownloads
      });
    } else {
      // メモリフォールバック
      fileInfo = global.fileStorage?.get(fileId);
      
      if (!fileInfo) {
        console.log('[download] File not found in memory:', fileId);
        return res.status(404).json({
          success: false,
          error: 'ファイルが見つかりません（メモリストレージ）'
        });
      }
      
      console.log('[download] Retrieved from memory');
    }
  } catch (e) {
    console.error('[download] Error retrieving file metadata:', e);
    return res.status(500).json({
      success: false,
      error: 'ファイル情報の取得に失敗しました',
      details: e.message
    });
  }

  // 期限チェック
  if (new Date() > new Date(fileInfo.expiryTime)) {
    return res.status(410).json({
      success: false,
      error: 'ファイルの有効期限が切れています'
    });
  }

  // action=infoの場合はメタデータのみ返す
  if (action === 'info') {
    return res.status(200).json({
      success: true,
      fileName: fileInfo.fileName,
      fileSize: fileInfo.fileSize,
      mimeType: fileInfo.mimeType,
      uploadTime: fileInfo.uploadTime,
      expiryTime: fileInfo.expiryTime,
      downloadCount: fileInfo.downloadCount,
      maxDownloads: fileInfo.maxDownloads,
      requiresOTP: true
    });
  }

  // OTPチェック
  if (!otp) {
    return res.status(400).json({
      success: false,
      error: 'OTPが必要です'
    });
  }

  if (otp !== fileInfo.otp) {
    return res.status(403).json({
      success: false,
      error: 'OTPが正しくありません'
    });
  }

  // ダウンロード回数チェック
  if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
    return res.status(403).json({
      success: false,
      error: `ダウンロード回数の上限（${fileInfo.maxDownloads}回）に達しました`
    });
  }

  // ファイルデータ取得
  let fileBuffer;

  try {
    if (kvClient && typeof kvClient.get === 'function') {
      const base64Data = await kvClient.get(`file:${fileId}:data`);
      
      if (!base64Data) {
        return res.status(404).json({
          success: false,
          error: 'ファイルデータが見つかりません'
        });
      }

      fileBuffer = Buffer.from(base64Data, 'base64');
      console.log('[download] File data retrieved from KV');
    } else {
      // メモリフォールバック
      fileBuffer = fileInfo.fileData;
      
      if (!fileBuffer) {
        return res.status(404).json({
          success: false,
          error: 'ファイルデータが見つかりません（メモリ）'
        });
      }
      
      console.log('[download] File data retrieved from memory');
    }
  } catch (e) {
    console.error('[download] Error retrieving file data:', e);
    return res.status(500).json({
      success: false,
      error: 'ファイルデータの取得に失敗しました',
      details: e.message
    });
  }

  // ダウンロード回数を更新
  fileInfo.downloadCount += 1;

  try {
    if (kvClient && typeof kvClient.set === 'function') {
      const ttl = Math.floor((new Date(fileInfo.expiryTime) - new Date()) / 1000);
      await kvClient.set(`file:${fileId}:meta`, JSON.stringify(fileInfo), { ex: ttl });
      console.log('[download] Download count updated in KV:', fileInfo.downloadCount);
    } else {
      global.fileStorage?.set(fileId, fileInfo);
      console.log('[download] Download count updated in memory:', fileInfo.downloadCount);
    }
  } catch (e) {
    console.error('[download] Failed to update download count:', e);
  }

  // ファイル送信
  res.setHeader('Content-Type', fileInfo.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileInfo.fileName)}"`);
  res.setHeader('Content-Length', fileBuffer.length);

  console.log('[download] Sending file:', {
    fileName: fileInfo.fileName,
    size: fileBuffer.length,
    downloadCount: fileInfo.downloadCount
  });

  return res.status(200).send(fileBuffer);
};