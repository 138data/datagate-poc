// lib/blob-storage.js - Vercel Blob Storage wrapper
const { put, del, list } = require('@vercel/blob');

/**
 * Blob にファイルをアップロード
 * @param {string} fileId - ファイルID
 * @param {Buffer} fileBuffer - ファイルデータ
 * @param {string} fileName - ファイル名
 * @returns {Promise<{url: string, downloadUrl: string}>} Blob URL と短寿命ダウンロードURL
 */
async function uploadToBlob(fileId, fileBuffer, fileName) {
  try {
    const blob = await put('file:' + fileId + ':data', fileBuffer, {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/octet-stream'
    });
    
    console.log('[INFO] Uploaded to Blob:', blob.url);
    
    // Vercel Blob の put() は url と downloadUrl の両方を返す
    return {
      url: blob.url,           // 永続的な公開URL
      downloadUrl: blob.downloadUrl  // 短寿命の署名付きURL（1時間有効）
    };
  } catch (error) {
    console.error('[ERROR] Blob upload failed:', error);
    throw error;
  }
}

/**
 * Blob からファイルを削除
 * @param {string} blobUrl - Blob URL
 */
async function deleteFromBlob(blobUrl) {
  try {
    await del(blobUrl);
    console.log('[INFO] Deleted from Blob:', blobUrl);
  } catch (error) {
    console.error('[ERROR] Blob delete failed:', error);
    throw error;
  }
}

/**
 * Blob からファイルを取得
 * @param {string} blobUrl - Blob URL
 * @returns {Promise<Buffer>} ファイルデータ
 */
async function downloadFromBlob(blobUrl) {
  try {
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error('Blob fetch failed: ' + response.status);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('[ERROR] Blob download failed:', error);
    throw error;
  }
}

/**
 * 既存の Blob URL から短寿命ダウンロード URL を生成
 * 注: Vercel Blob では、既存URLから短寿命URLを生成する公式APIは無い
 * アップロード時の downloadUrl を保存しておく必要がある
 * 
 * @param {string} blobUrl - 永続的な Blob URL
 * @returns {string} そのまま返す（公開URLなので直接アクセス可能）
 */
function generateDownloadUrl(blobUrl) {
  // Phase 35a: とりあえず公開URLをそのまま返す
  // 将来的には署名付きURLの再生成を実装する可能性
  console.log('[INFO] generateDownloadUrl called with:', blobUrl);
  return blobUrl;
}

module.exports = {
  uploadToBlob,
  deleteFromBlob,
  downloadFromBlob,
  generateDownloadUrl
};