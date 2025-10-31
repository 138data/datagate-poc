// lib/blob-storage.js - Blob操作関数
const { put, del } = require('@vercel/blob');

/**
 * ファイルをBlobにアップロード
 * Phase 36契約: 完全なURL（blobUrl）を返す
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
  
  // Phase 36契約: 完全なURLを返す（head()で使用可能）
  return blob.url;
}

/**
 * Blobからファイルをダウンロード
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
 * 復号化済みファイルを一時Blobにアップロード
 */
async function uploadTemporaryBlob(fileId, decryptedBuffer, fileName, expiresInSec = 300) {
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
 * 一時Blobを削除
 */
async function deleteTemporaryBlob(blobUrl) {
  try {
    console.log('[INFO] Deleting temporary blob:', blobUrl);
    await del(blobUrl);
    console.log('[INFO] Temporary blob deleted successfully');
  } catch (error) {
    console.warn('[WARN] Failed to delete temporary blob:', error.message);
  }
}

module.exports = {
  uploadToBlob,
  downloadFromBlob,
  uploadTemporaryBlob,
  deleteTemporaryBlob
};