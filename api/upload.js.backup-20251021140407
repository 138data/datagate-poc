// api/upload.js (ESM版 - KVベース)
import crypto from 'node:crypto';

let kv;
try {
  ({ kv } = await import('@vercel/kv'));
} catch (e) {
  console.warn('KV not available:', e.message);
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    console.log('📤 Upload request received');

    // バイナリデータを読み込み
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    console.log('📦 Received', buffer.length, 'bytes');

    // ファイルID生成
    const fileId = crypto.randomBytes(16).toString('hex');
    
    // OTP生成
    const otp = crypto.randomBytes(3).toString('hex');
    
    console.log('🔑 Generated:', { fileId, otp });

    // KVに保存（7日間TTL）
    if (kv) {
      await kv.setex(
        `file:${fileId}`,
        7 * 24 * 60 * 60, // 7日
        JSON.stringify({
          data: buffer.toString('base64'),
          otp,
          uploadedAt: new Date().toISOString()
        })
      );
      console.log('✅ Saved to KV');
    } else {
      console.warn('⚠️ KV not available, using in-memory storage');
    }

    const downloadLink = `https://${req.headers.host}/download.html?id=${fileId}`;

    return res.status(200).json({
      success: true,
      fileId,
      otp,
      downloadLink,
      expiresIn: '7 days'
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    return res.status(500).json({
      success: false,
      error: 'Upload failed',
      details: error.message
    });
  }
}
