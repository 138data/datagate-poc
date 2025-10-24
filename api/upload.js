// api/upload.js
// DataGate Upload API - KV + FormData + Dynamic URL
// Phase 22 hotfix

const crypto = require('crypto');
const multer = require('multer');

// --- KVクライアントの安全取得（型チェック付き） ---
let kvClient = null;
try {
  const mod = require('@vercel/kv');           // CJS: { kv: {...} }
  if (mod && mod.kv && typeof mod.kv.set === 'function') {
    kvClient = mod.kv;
  }
} catch (_) {
  // SDKが無ければ後でメモリにフォールバック
}

// --- 設定値 ---
const FILE_EXPIRY_DAYS = 7;
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || `${10 * 1024 * 1024}`, 10); // 既定10MB

// --- 受信（FormData）を正式にパース ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }
}).single('file');

// --- メモリフォールバック（download.jsもglobal.fileStorage参照可） ---
const memoryStorage = new Map();
global.fileStorage = global.fileStorage || new Map();

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  // FormDataをパース
  try {
    await new Promise((resolve, reject) => {
      upload(req, res, (err) => (err ? reject(err) : resolve()));
    });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message || 'Invalid multipart/form-data' });
  }

  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ success: false, error: 'ファイルが見つかりません' });
  }

  const buffer = req.file.buffer;
  const originalName = req.file.originalname || 'uploaded-file.dat';
  const mimeType = req.file.mimetype || 'application/octet-stream';

  // ID / OTP
  const fileId = crypto.randomBytes(16).toString('hex'); // 32文字
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiryTime = new Date(Date.now() + FILE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const fileInfo = {
    fileName: originalName,
    fileSize: buffer.length,
    mimeType,
    otp,
    uploadTime: new Date().toISOString(),
    downloadCount: 0,
    maxDownloads: 3,
    expiryTime
  };

  // 保存（まずKV、なければメモリ）—— kv.setが"関数"かを必ず確認
  try {
    if (kvClient && typeof kvClient.set === 'function') {
      const ttl = FILE_EXPIRY_DAYS * 24 * 60 * 60;
      await kvClient.set(`file:${fileId}:meta`, JSON.stringify(fileInfo), { ex: ttl });
      await kvClient.set(`file:${fileId}:data`, buffer.toString('base64'), { ex: ttl });
    } else {
      // フォールバック：メモリ（download.js側も対応あり）
      fileInfo.fileData = buffer;
      memoryStorage.set(fileId, fileInfo);
      global.fileStorage.set(fileId, fileInfo);
      console.log('[Upload] KV unavailable -> using memory storage');
    }
  } catch (e) {
    console.error('[Upload] Storage error:', e);
    return res.status(500).json({
      success: false,
      error: 'ファイルのアップロードに失敗しました',
      details: e.message
    });
  }

  // ベースURLはヘッダから動的に生成（本番URL変更に追従）
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers['x-forwarded-host']  || req.headers.host;
  const baseUrl = `${proto}://${host}`;

  const downloadLink = `${baseUrl}/download.html?id=${encodeURIComponent(fileId)}`;

  return res.status(200).json({
    success: true,
    message: 'ファイルが正常にアップロードされました',
    fileId,
    downloadLink,
    otp,
    fileName: fileInfo.fileName,
    fileSize: fileInfo.fileSize,
    storageType: kvClient ? 'KV Storage (Persistent)' : 'Memory (Temporary)',
    expiryDate: fileInfo.expiryTime
  });
};
