// api/download.js - Phase 36契約準拠版（JSON + 短寿命URL発行）
const { kv } = require('@vercel/kv');
const { head } = require('@vercel/blob');

// JSONボディ読み取り
async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { 
        resolve(JSON.parse(body || '{}')); 
      } catch (e) { 
        reject(new Error('Invalid JSON')); 
      }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { fileId, otp } = await readJson(req);
    
    if (!fileId || !otp) {
      return res.status(400).json({ error: 'fileId and otp are required' });
    }
    
    // メタデータ取得
    const metaKey = `file:${fileId}:meta`;
    const metaJson = await kv.get(metaKey);
    
    if (!metaJson) {
      return res.status(404).json({ error: 'File not found or expired' });
    }
    
    // KVの値をパース（stringの場合とobjectの場合に対応）
    const meta = typeof metaJson === 'string' ? JSON.parse(metaJson) : metaJson;
    
    // OTP検証
    if (otp !== meta.otp) {
      return res.status(401).json({ error: 'Invalid OTP' });
    }
    
    // ダウンロード回数制限
    const maxDownloads = meta.maxDownloads || 3;
    const downloadCount = meta.downloadCount || 0;
    
    if (downloadCount >= maxDownloads) {
      return res.status(403).json({ error: 'Download limit exceeded' });
    }
    
    // Phase 36契約: blobKey から短寿命URL発行
    if (!meta.blobKey) {
      return res.status(500).json({ 
        error: 'File metadata corrupted',
        hint: 'blobKey not found in metadata' 
      });
    }
    
    // @vercel/blob の head() で署名付きURL取得
    let downloadUrl;
    try {
      const blobInfo = await head(meta.blobKey);
      downloadUrl = blobInfo.url;
    } catch (blobError) {
      console.error('[download] Blob head() error:', blobError);
      return res.status(500).json({ 
        error: 'Failed to generate download URL',
        details: blobError.message 
      });
    }
    
    // ダウンロード回数を更新
    meta.downloadCount = downloadCount + 1;
    
    // TTL計算（7日またはexpiresAtまで）
    let ttlSec = 7 * 24 * 60 * 60; // デフォルト7日
    if (meta.expiresAt) {
      const expiresAt = new Date(meta.expiresAt).getTime();
      const now = Date.now();
      ttlSec = Math.max(1, Math.floor((expiresAt - now) / 1000));
    }
    
    // メタデータを更新保存
    await kv.set(metaKey, meta, { ex: ttlSec });
    
    // JSON応答（APIはバイナリを返さない）
    return res.status(200).json({
      downloadUrl,
      fileName: meta.fileName || meta.originalName || 'download',
      size: meta.size,
      remainingDownloads: maxDownloads - meta.downloadCount
    });
    
  } catch (error) {
    console.error('[download] Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
};