// lib/blob-storage.js - 一時Blob操作関数を追加

const { put, del } = require('@vercel/blob');

/**
 * ファイルをBlobにアップロード（既存関数）
 */
async function uploadToBlob(fileId, buffer, fileName) {
  const blobKey = `file:${fileId}:data`;
  
  const blob = await put(blobKey, buffer, {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/octet-stream'
  });

  console.log('[DEBUG] Blob uploaded:', {
    url: blob.url,
    downloadUrl: blob.downloadUrl
  });

  return {
    url: blob.url,
    downloadUrl: blob.downloadUrl || blob.url
  };
}

/**
 * Blobからファイルをダウンロード（既存関数）
 */
async function downloadFromBlob(blobUrl) {
  const response = await fetch(blobUrl);
  if (!response.ok) {
    throw new Error(`Failed to download from Blob: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * 復号化済みファイルを一時Blobにアップロード（新規）
 * @param {string} fileId - ファイルID
 * @param {Buffer} decryptedBuffer - 復号化済みバッファ
 * @param {string} fileName - ファイル名
 * @param {number} expiresInSec - TTL（秒）デフォルト300秒（5分）
 * @returns {Promise<{url: string, downloadUrl: string, blobKey: string}>}
 */
async function uploadTemporaryBlob(fileId, decryptedBuffer, fileName, expiresInSec = 300) {
  // 一時Blobのキー（タイムスタンプ付きで一意性確保）
  const timestamp = Date.now();
  const blobKey = `temp:${fileId}:${timestamp}`;
  
  console.log('[INFO] Uploading temporary blob:', {
    blobKey,
    size: decryptedBuffer.length,
    fileName,
    expiresInSec
  });

  const blob = await put(blobKey, decryptedBuffer, {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/octet-stream',
    // Vercel Blob は cacheControlMaxAge でTTL制御
    cacheControlMaxAge: expiresInSec
  });

  console.log('[INFO] Temporary blob uploaded:', {
    url: blob.url,
    downloadUrl: blob.downloadUrl
  });

  return {
    url: blob.url,
    downloadUrl: blob.downloadUrl || blob.url,
    blobKey: blobKey
  };
}

/**
 * 一時Blobを削除（新規）
 * @param {string} blobUrl - 削除するBlobのURL
 */
async function deleteTemporaryBlob(blobUrl) {
  try {
    console.log('[INFO] Deleting temporary blob:', blobUrl);
    await del(blobUrl);
    console.log('[INFO] Temporary blob deleted successfully');
  } catch (error) {
    // 削除失敗は致命的ではない（TTLで自然失効）
    console.warn('[WARN] Failed to delete temporary blob:', error.message);
  }
}

module.exports = {
  uploadToBlob,
  downloadFromBlob,
  uploadTemporaryBlob,    // 新規追加
  deleteTemporaryBlob     // 新規追加
};