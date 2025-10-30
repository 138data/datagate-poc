// lib/blob-storage.js - Vercel Blob Storage wrapper
const { put, del, list } = require('@vercel/blob');

/**
 * Blob にファイルをアップロード
 * @param {string} fileId - ファイルID
 * @param {Buffer} fileBuffer - ファイルデータ
 * @param {string} fileName - ファイル名
 * @returns {Promise<string>} Blob URL
 */
async function uploadToBlob(fileId, fileBuffer, fileName) {
  try {
    const blob = await put('file:' + fileId + ':data', fileBuffer, {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/octet-stream'
    });
    
    console.log('[INFO] Uploaded to Blob:', blob.url);
    return blob.url;
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

module.exports = {
  uploadToBlob,
  deleteFromBlob,
  downloadFromBlob
};
