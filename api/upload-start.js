// api/upload-start.js
// Phase 35b: アップロード開始、一時メタデータ作成 (CommonJS)

const crypto = require('crypto');
const { kv } = require('@vercel/kv');

module.exports = async function handler(req, res) {
  // CORSヘッダー
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
    const { fileName, fileSize, recipientEmail } = req.body;

    if (!fileName || !fileSize || !recipientEmail) {
      return res.status(400).json({
        error: 'fileName, fileSize, and recipientEmail are required'
      });
    }

    // ファイルサイズ検証（50MB）
    const MAX_SIZE = 50 * 1024 * 1024;
    if (fileSize > MAX_SIZE) {
      return res.status(400).json({
        error: `File size exceeds 50MB limit`
      });
    }

    // アップロードID生成
    const uploadId = crypto.randomBytes(16).toString('hex');

    // 一時メタデータを KV に保存（10分TTL）
    await kv.set(`upload:${uploadId}:temp`, {
      fileName,
      fileSize,
      recipientEmail,
      createdAt: Date.now()
    }, { ex: 600 }); // 10分

    // 監査ログ
    await kv.lpush('audit:log', JSON.stringify({
      event: 'upload_start',
      uploadId,
      fileName,
      fileSize,
      recipientEmail,
      timestamp: new Date().toISOString()
    }));

    res.status(200).json({
      success: true,
      uploadId
    });

  } catch (error) {
    console.error('Upload start error:', error);
    res.status(500).json({ 
      error: 'Failed to start upload',
      details: error.message 
    });
  }
};
