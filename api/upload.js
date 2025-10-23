// ========================================
// api/upload.js - 修正版（Part 1）
// ========================================

const { createClient } = require('@vercel/kv');

// 環境変数からの設定読み込み
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || `${50 * 1024 * 1024}`, 10); // 50MB（A-2対応）
const FILE_RETENTION_DAYS = parseInt(process.env.FILE_RETENTION_DAYS || '7', 10);

// KVクライアント初期化
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// OTP生成（6桁数字）
function generateOTP() {
  const chars = '0123456789';
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += chars[Math.floor(Math.random() * chars.length)];
  }
  return otp;
}

// UUIDv4生成
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

module.exports = async (req, res) => {
  // CORSヘッダー設定（A-3対応: カスタムヘッダー追加）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name, X-File-Type');

  // OPTIONSリクエスト（プリフライト）
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // POSTのみ許可
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // A-3対応: カスタムヘッダーからファイル情報取得
    const originalName = decodeURIComponent(req.headers['x-file-name'] || 'uploaded-file.dat');
    const mimeType = req.headers['x-file-type'] || 'application/octet-stream';

    // リクエストボディ（生バイト）を読み込み
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    // ファイルサイズチェック（A-2対応: 環境変数化）
    if (fileBuffer.length > MAX_FILE_SIZE) {
      res.status(413).json({
        error: 'File too large',
        maxSize: MAX_FILE_SIZE,
        actualSize: fileBuffer.length
      });
      return;
    }

    // ファイルID・OTP生成
    const fileId = generateUUID();
    const otp = generateOTP();

    // Base64エンコード
    const fileData = fileBuffer.toString('base64');

    // メタデータ作成
    const fileInfo = {
      fileId,
      fileName: originalName,
      fileSize: fileBuffer.length,
      mimeType,
      otp,
      uploadTime: new Date().toISOString(),
      expiryTime: new Date(Date.now() + FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      remainingDownloads: 3,
      storageType: 'kv',
    };

    // TTL計算（秒単位）
    const ttlSeconds = FILE_RETENTION_DAYS * 24 * 60 * 60;

    // KVに保存（メタデータ + データ）
    await Promise.all([
      kv.set(`file:${fileId}:meta`, JSON.stringify(fileInfo), { ex: ttlSeconds }),
      kv.set(`file:${fileId}:data`, fileData, { ex: ttlSeconds }),
    ]);

    // A-1対応: 動的ホスト取得
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${proto}://${host}`;
    const downloadLink = `${baseUrl}/download.html?id=${fileId}`;

    // レスポンス
    res.status(200).json({
      success: true,
      fileId,
      otp,
      downloadLink,
      expiryTime: fileInfo.expiryTime,
      remainingDownloads: 3,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: error.message,
    });
  }
};