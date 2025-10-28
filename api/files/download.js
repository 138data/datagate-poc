// api/files/download.js
import { kv } from '@vercel/kv';
import { decryptFile } from '../../lib/encryption.js';
import { saveAuditLog } from '../../lib/audit-log.js';

/**
 * ダウンロードエンドポイント
 * GET: ファイル情報取得（OTP不要）
 * POST: OTP検証 + ファイルダウンロード（回数制限あり）
 */
export default async function handler(req, res) {
  try {
    console.log('=== Download Request Started ===');
    console.log('Method:', req.method);
    console.log('Query:', req.query);
    console.log('Body:', req.body);

    // GET: ファイル情報取得（OTP不要）
    if (req.method === 'GET') {
      return await handleGetFileInfo(req, res);
    }

    // POST: OTP検証 + ダウンロード
    if (req.method === 'POST') {
      return await handleDownloadFile(req, res);
    }

    // それ以外のメソッドは405
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed'
    });

  } catch (error) {
    console.error('=== Download Error ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    return res.status(500).json({
      success: false,
      error: 'ダウンロード処理中にエラーが発生しました',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * GET: ファイル情報取得（OTP不要）
 */
async function handleGetFileInfo(req, res) {
  const fileId = req.query.id;

  // fileId検証
  if (!fileId) {
    console.error('Error: fileId is missing');
    return res.status(400).json({
      success: false,
      error: 'ファイルIDが指定されていません'
    });
  }

  // Vercel KVからメタデータ取得
  console.log('Fetching metadata from KV:', `file:${fileId}:meta`);
  const metadataJson = await kv.get(`file:${fileId}:meta`);

  if (!metadataJson) {
    console.error('Error: File not found in KV');
    return res.status(404).json({
      success: false,
      error: 'ファイルが見つかりません'
    });
  }

  // メタデータをパース（JSON文字列の場合）
  const metadata = typeof metadataJson === 'string' 
    ? JSON.parse(metadataJson) 
    : metadataJson;

  console.log('Metadata found:', metadata);

  // 有効期限チェック
  const now = new Date();
  const expiresAt = new Date(metadata.expiresAt);

  if (now > expiresAt) {
    console.error('Error: File expired');
    return res.status(410).json({
      success: false,
      error: 'ファイルの有効期限が切れています'
    });
  }

  // ファイル情報を返す（OTPは含めない）
  return res.status(200).json({
    success: true,
    fileName: metadata.fileName,
    fileSize: metadata.size,
    uploadedAt: metadata.uploadedAt,
    expiresAt: metadata.expiresAt,
    downloadCount: metadata.downloadCount || 0,
    maxDownloads: metadata.maxDownloads || 3
  });
}

/**
 * POST: OTP検証 + ファイルダウンロード
 */
async function handleDownloadFile(req, res) {
  const body = req.body || {};
  const fileId = body.fileId || body.id || req.query.id;
  const otp = body.otp || req.query.otp;

  console.log('Parsed parameters:', { fileId, otp });

  // パラメータ検証
  if (!fileId) {
    console.error('Error: fileId is missing');
    return res.status(400).json({
      success: false,
      error: 'ファイルIDが指定されていません'
    });
  }

  if (!otp) {
    console.error('Error: OTP is missing');
    return res.status(400).json({
      success: false,
      error: 'OTPが指定されていません'
    });
  }

  // Vercel KVからメタデータ取得
  console.log('Fetching metadata from KV:', `file:${fileId}:meta`);
  const metadataJson = await kv.get(`file:${fileId}:meta`);

  if (!metadataJson) {
    console.error('Error: File not found in KV');
    
    // 監査ログ記録（失敗）
    await saveAuditLog({
      event: 'download_failed',
      fileId,
      reason: 'file_not_found',
      timestamp: new Date().toISOString()
    });

    return res.status(404).json({
      success: false,
      error: 'ファイルが見つかりません'
    });
  }

  // メタデータをパース
  const metadata = typeof metadataJson === 'string' 
    ? JSON.parse(metadataJson) 
    : metadataJson;

  console.log('Metadata found:', metadata);

  // 有効期限チェック
  const now = new Date();
  const expiresAt = new Date(metadata.expiresAt);

  if (now > expiresAt) {
    console.error('Error: File expired');
    
    // 監査ログ記録（失敗）
    await saveAuditLog({
      event: 'download_failed',
      fileId,
      fileName: metadata.fileName,
      reason: 'expired',
      timestamp: new Date().toISOString()
    });

    return res.status(410).json({
      success: false,
      error: 'ファイルの有効期限が切れています'
    });
  }

  // OTP検証
  if (otp !== metadata.otp) {
    console.error('Error: Invalid OTP');
    
    // 監査ログ記録（失敗）
    await saveAuditLog({
      event: 'download_failed',
      fileId,
      fileName: metadata.fileName,
      reason: 'invalid_otp',
      timestamp: new Date().toISOString()
    });

    return res.status(401).json({
      success: false,
      error: 'OTPが正しくありません'
    });
  }

  console.log('OTP verified successfully');

  // ダウンロード回数チェック
  const downloadCount = metadata.downloadCount || 0;
  const maxDownloads = metadata.maxDownloads || 3;

  if (downloadCount >= maxDownloads) {
    console.error('Error: Max downloads exceeded');
    
    // 監査ログ記録（失敗）
    await saveAuditLog({
      event: 'download_failed',
      fileId,
      fileName: metadata.fileName,
      reason: 'max_downloads_exceeded',
      downloadCount,
      maxDownloads,
      timestamp: new Date().toISOString()
    });

    return res.status(403).json({
      success: false,
      error: `ダウンロード回数の上限（${maxDownloads}回）に達しています`
    });
  }

  // Vercel KVから暗号化ファイルデータ取得
  console.log('Fetching encrypted file data from KV:', `file:${fileId}:data`);
  const encryptedData = await kv.get(`file:${fileId}:data`);

  if (!encryptedData) {
    console.error('Error: File data not found in KV');
    
    // 監査ログ記録（失敗）
    await saveAuditLog({
      event: 'download_failed',
      fileId,
      fileName: metadata.fileName,
      reason: 'data_not_found',
      timestamp: new Date().toISOString()
    });

    return res.status(404).json({
      success: false,
      error: 'ファイルデータが見つかりません'
    });
  }

  // 暗号化データをパース
  const encryptedDataObj = typeof encryptedData === 'string'
    ? JSON.parse(encryptedData)
    : encryptedData;

  console.log('Encrypted data found:', {
    hasIv: !!encryptedDataObj.iv,
    hasAuthTag: !!encryptedDataObj.authTag,
    dataLength: encryptedDataObj.data?.length
  });

  // ファイルを復号化
  let decryptedBuffer;
  try {
    decryptedBuffer = decryptFile(encryptedDataObj);
    console.log('File decrypted successfully, size:', decryptedBuffer.length);
  } catch (decryptError) {
    console.error('Decryption error:', decryptError.message);
    
    // 監査ログ記録（失敗）
    await saveAuditLog({
      event: 'download_failed',
      fileId,
      fileName: metadata.fileName,
      reason: 'decryption_error',
      error: decryptError.message,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({
      success: false,
      error: 'ファイルの復号化に失敗しました'
    });
  }

  // ダウンロード回数をインクリメント
  const newDownloadCount = downloadCount + 1;
  metadata.downloadCount = newDownloadCount;
  metadata.lastDownloadedAt = new Date().toISOString();

  // メタデータを更新（TTLは維持）
  const ttl = Math.floor((expiresAt - now) / 1000); // 残りのTTL（秒）
  if (ttl > 0) {
    await kv.set(
      `file:${fileId}:meta`,
      JSON.stringify(metadata),
      { ex: ttl }
    );
    console.log('Download count updated:', newDownloadCount);
  }

  // 監査ログ記録（成功）
  await saveAuditLog({
    event: 'download_success',
    fileId,
    fileName: metadata.fileName,
    fileSize: metadata.size,
    downloadCount: newDownloadCount,
    maxDownloads,
    timestamp: new Date().toISOString()
  });

  // レスポンス返却（RFC5987形式でファイル名エンコード）
  const encodedFileName = encodeRFC5987(metadata.fileName);
  
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="file.bin"; filename*=UTF-8''${encodedFileName}`);
  res.setHeader('Content-Length', decryptedBuffer.length);

  console.log('=== Download Response Sent ===');
  return res.status(200).send(decryptedBuffer);
}

/**
 * RFC5987形式のファイル名エンコード
 * 例: "日本語.txt" → "%E6%97%A5%E6%9C%AC%E8%AA%9E.txt"
 */
function encodeRFC5987(fileName) {
  return encodeURIComponent(fileName)
    .replace(/['()]/g, escape)
    .replace(/\*/g, '%2A')
    .replace(/%(?:7C|60|5E)/g, unescape);
}