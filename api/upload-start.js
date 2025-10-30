// api/upload-start.js
// Phase 35b: クライアント直アップロード用の一時URL発行

import crypto from 'crypto';
import { put } from '@vercel/blob';
import { kv } from '@vercel/kv';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb' // メタデータのみ受信
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileName, fileSize, recipientEmail } = req.body;

    // バリデーション
    if (!fileName || !fileSize || !recipientEmail) {
      return res.status(400).json({ 
        error: 'fileName, fileSize, recipientEmail are required' 
      });
    }

    // ファイルサイズ制限（50MB）
    const maxSize = 50 * 1024 * 1024;
    if (fileSize > maxSize) {
      return res.status(413).json({ 
        error: `File size exceeds ${maxSize / 1024 / 1024}MB limit` 
      });
    }

    // 一時Blob用のキー生成
    const tempBlobKey = `temp-${crypto.randomBytes(16).toString('hex')}`;
    const uploadId = crypto.randomBytes(16).toString('hex');

    // Vercel Blob の一時アップロードURL生成（PUT用）
    // 注: @vercel/blob の put() は直接アップロード機能がないため、
    // ここでは一時的な「予約」としてメタデータをKVに保存
    const tempMeta = {
      fileName,
      fileSize,
      recipientEmail,
      uploadId,
      tempBlobKey,
      createdAt: Date.now(),
      status: 'pending' // upload-complete で 'completed' に変更
    };

    // KV に一時メタデータ保存（10分TTL）
    await kv.set(`upload:${uploadId}:temp`, tempMeta, { ex: 600 });

    // 監査ログ
    await kv.lpush('audit:log', JSON.stringify({
      event: 'upload_start',
      uploadId,
      fileName,
      fileSize,
      recipientEmail,
      timestamp: new Date().toISOString()
    }));

    // クライアントに返す情報
    // 注: Vercel Blob の直接PUT APIは現在サポートされていないため、
    // この実装では「/api/upload-complete に Base64 で送る」方式を採用
    // （真のクライアント直PUTは Vercel Blob の機能拡張待ち）
    res.status(200).json({
      uploadId,
      message: 'Upload session initialized. Send file data to /api/upload-complete'
    });

  } catch (error) {
    console.error('Upload start error:', error);
    res.status(500).json({ error: 'Failed to initialize upload' });
  }
}
