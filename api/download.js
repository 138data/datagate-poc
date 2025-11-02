// api/download.js - JSON返却（Phase 40契約準拠）

import { kv } from '@vercel/kv';
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    // メタデータ取得
    const metaStr = await kv.get(`file:${id}:meta`);
    if (!metaStr) {
      return res.status(404).json({ error: 'File not found or expired' });
    }

    const metadata = JSON.parse(metaStr);

    // ワンタイムトークン生成（60秒有効）
    const token = crypto.randomBytes(32).toString('hex');
    await kv.set(`token:${token}`, id, { ex: 60 });

    // ダウンロードURL生成
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const downloadUrl = `${baseUrl}/api/download-blob?token=${token}`;

    res.status(200).json({
      success: true,
      fileName: metadata.fileName,
      fileSize: metadata.fileSize,
      downloadUrl,
      expiresIn: 60
    });

  } catch (error) {
    console.error('[api/download] Error:', error);
    res.status(500).json({
      error: 'Failed to prepare download',
      details: error.message
    });
  }
}