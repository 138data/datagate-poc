// lib/blob-storage.js - Vercel Blob Storage ラッパー（Phase 35a対応）
const { put, del, head } = require('@vercel/blob');

/**
 * Blobにファイルをアップロード
 * @param {string} blobKey - Blobキー（例: "files/abc123-encrypted"）
 * @param {Buffer} data - アップロードするバイナリデータ
 * @returns {Promise<{blobKey: string, url: string}>} blobKeyとパブリックURL
 */
async function uploadToBlob(blobKey, data) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error('BLOB_READ_WRITE_TOKEN is not set');
    }

    // Blobにアップロード
    const blob = await put(blobKey, data, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    return {
      blobKey: blobKey,
      url: blob.url
    };
  } catch (error) {
    console.error('[uploadToBlob] Error:', error);
    throw error;
  }
}

/**
 * Blobからファイルをダウンロード
 * @param {string} blobUrl - BlobのURL
 * @returns {Promise<Buffer>} ダウンロードしたバイナリデータ
 */
async function downloadFromBlob(blobUrl) {
  try {
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error(\Failed to download from Blob: \\);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('[downloadFromBlob] Error:', error);
    throw error;
  }
}

/**
 * Blobからファイルを削除
 * @param {string} blobUrl - 削除するBlobのURL
 * @returns {Promise<void>}
 */
async function deleteFromBlob(blobUrl) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error('BLOB_READ_WRITE_TOKEN is not set');
    }

    await del(blobUrl, {
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    console.log('[deleteFromBlob] Successfully deleted:', blobUrl);
  } catch (error) {
    console.error('[deleteFromBlob] Error:', error);
    throw error;
  }
}

/**
 * 短寿命ダウンロードURL生成（Phase 35a新規追加）
 * 
 * ⚠️ Phase 35a: 現状は blobUrl をそのまま返すが、
 * 本番運用時は Vercel Blob の署名付きURL機能を使用すること
 * 
 * @param {string} blobUrl - BlobのパブリックURL
 * @param {number} expiresInSeconds - 有効期限（秒）デフォルト300秒=5分
 * @returns {Promise<{downloadUrl: string, expiresAt: string}>}
 */
async function generateDownloadUrl(blobUrl, expiresInSeconds = 300) {
  try {
    // Phase 35a: 簡易実装（blobUrlをそのまま返す）
    // TODO Phase 35b: Vercel Blob の署名付きURL実装
    
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    
    return {
      downloadUrl: blobUrl,
      expiresAt: expiresAt
    };
  } catch (error) {
    console.error('[generateDownloadUrl] Error:', error);
    throw error;
  }
}

/**
 * Blobの存在確認
 * @param {string} blobUrl - 確認するBlobのURL
 * @returns {Promise<boolean>}
 */
async function blobExists(blobUrl) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error('BLOB_READ_WRITE_TOKEN is not set');
    }

    await head(blobUrl, {
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    return true;
  } catch (error) {
    if (error.message && error.message.includes('404')) {
      return false;
    }
    console.error('[blobExists] Error:', error);
    throw error;
  }
}

module.exports = {
  uploadToBlob,
  downloadFromBlob,
  deleteFromBlob,
  generateDownloadUrl,  // Phase 35a 新規追加
  blobExists
};