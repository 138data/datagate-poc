// api/download.js - ノーコストAV仕込み版
// Phase 22準備：将来のマルウェアスキャン導入用の仕込み（現状は挙動変更なし）

const { kv } = require('@vercel/kv');

// 環境変数
const AV_ENABLED = process.env.AV_ENABLED === 'true';

module.exports = async (req, res) => {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // ファイルIDを取得
    const fileId = req.query.id || req.body?.id;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: 'ファイルIDが指定されていません'
      });
    }

    // メタデータを取得
    const metaKey = `file:${fileId}:meta`;
    const fileInfo = await kv.get(metaKey);

    // GETリクエスト：ファイル情報の取得
    if (req.method === 'GET') {
      if (!fileInfo) {
        return res.status(404).json({
          success: false,
          exists: false,
          error: 'ファイルが見つかりません。期限切れの可能性があります。'
        });
      }

      // 有効期限チェック
      const now = new Date();
      const expiryDate = new Date(fileInfo.expiryTime);
      if (now > expiryDate) {
        // 期限切れファイルを削除
        await kv.del(metaKey);
        await kv.del(`file:${fileId}:data`);

        return res.status(404).json({
          success: false,
          exists: false,
          error: 'ファイルの有効期限が切れています'
        });
      }

      // ファイル情報を返す（scanStatusを含む）
      return res.status(200).json({
        success: true,
        exists: true,
        fileName: fileInfo.fileName,
        fileSize: fileInfo.fileSize,
        uploadTime: fileInfo.uploadTime,
        remainingDownloads: fileInfo.maxDownloads - fileInfo.downloadCount,
        requiresOTP: true,
        storageType: 'KV Storage',
        scanStatus: fileInfo.scanStatus || 'not_scanned'  // 将来用
      });
    }

    // POSTリクエスト：ファイルのダウンロード
    if (req.method === 'POST') {
      if (!fileInfo) {
        return res.status(404).json({
          success: false,
          error: 'ファイルが見つかりません'
        });
      }

      // 有効期限チェック
      const now = new Date();
      const expiryDate = new Date(fileInfo.expiryTime);
      if (now > expiryDate) {
        await kv.del(metaKey);
        await kv.del(`file:${fileId}:data`);

        return res.status(404).json({
          success: false,
          error: 'ファイルの有効期限が切れています'
        });
      }

      // ダウンロード回数チェック
      if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
        // 上限到達時は削除
        await kv.del(metaKey);
        await kv.del(`file:${fileId}:data`);

        return res.status(403).json({
          success: false,
          error: 'ダウンロード回数の上限に達しました'
        });
      }

      // OTP検証
      const providedOTP = req.body?.otp;
      if (!providedOTP) {
        return res.status(400).json({
          success: false,
          error: 'OTPが入力されていません'
        });
      }

      if (providedOTP.toLowerCase() !== fileInfo.otp.toLowerCase()) {
        return res.status(401).json({
          success: false,
          error: 'OTPが正しくありません'
        });
      }

      // 【将来用のAVゲート】AV有効 かつ scanStatusがclean以外なら配布停止
      if (AV_ENABLED && fileInfo.scanStatus !== 'clean') {
        console.warn('[Download] AV gate blocked:', {
          fileId,
          scanStatus: fileInfo.scanStatus
        });

        return res.status(403).json({
          success: false,
          error: 'セキュリティ検査が未完了またはNGのため、ダウンロードできません',
          scanStatus: fileInfo.scanStatus
        });
      }

      // ファイルデータを取得
      const dataKey = `file:${fileId}:data`;
      const base64Data = await kv.get(dataKey);

      if (!base64Data) {
        return res.status(404).json({
          success: false,
          error: 'ファイルデータが見つかりません'
        });
      }

      // Base64デコード
      const buffer = Buffer.from(base64Data, 'base64');

      // ダウンロード回数を更新
      fileInfo.downloadCount += 1;

      if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
        // 上限到達時は削除
        await kv.del(metaKey);
        await kv.del(dataKey);
        console.log('[Download] Max downloads reached, deleted:', fileId);
      } else {
        // メタデータを更新
        const ttlSeconds = Math.floor((expiryDate - now) / 1000);
        await kv.set(metaKey, fileInfo, { ex: ttlSeconds });
        console.log('[Download] Updated download count:', {
          fileId,
          downloadCount: fileInfo.downloadCount,
          maxDownloads: fileInfo.maxDownloads
        });
      }

      // ファイルを配信
      res.setHeader('Content-Type', fileInfo.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileInfo.fileName)}"`);
      res.setHeader('Content-Length', buffer.length);
      
      return res.status(200).send(buffer);
    }

    // その他のメソッドは405
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed'
    });

  } catch (error) {
    console.error('[Download] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'ファイルのダウンロードに失敗しました',
      details: error.message
    });
  }
};
