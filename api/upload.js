// api/upload.js - Phase 22対応版（修正済み）
const crypto = require('crypto');
const multer = require('multer');

// --- KVクライアントの安全取得 ---
let kvClient = null;
try {
  const mod = require('@vercel/kv');
  if (mod && mod.kv && typeof mod.kv.set === 'function') {
    kvClient = mod.kv;
  }
} catch (_) {
  // SDKが無ければ後でメモリにフォールバック
}

// --- 設定値 ---
const FILE_EXPIRY_DAYS = 7;
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || `${50 * 1024 * 1024}`, 10); // 50MB

// --- 受信（FormData）を正式にパース ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }
}).single('file');

// --- メモリフォールバック ---
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
    return res.status(400).json({ 
      success: false, 
      error: e.message || 'Invalid multipart/form-data' 
    });
  }

  // ファイルチェック
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ 
      success: false, 
      error: 'ファイルが見つかりません' 
    });
  }

  // 受信者メールアドレスを取得（Phase 22で追加）
  // recipientEmail または recipient パラメータを受け入れる
  const recipientEmail = req.body.recipientEmail || req.body.recipient || 'test@example.com';
  
  // メールアドレスが明示的に指定されていない場合の警告
  if (!req.body.recipientEmail && !req.body.recipient) {
    console.warn('[upload] No recipient email provided, using default');
  }

  // メールアドレスの簡易バリデーション（オプショナル）
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (recipientEmail && !emailRegex.test(recipientEmail)) {
    console.warn('[upload] Invalid email format:', recipientEmail);
    // エラーにせず、警告のみ
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
    recipientEmail, // Phase 22で追加
    uploadTime: new Date().toISOString(),
    downloadCount: 0,
    maxDownloads: 3,
    expiryTime
  };

  // 保存（まずKV、なければメモリ）
  try {
    if (kvClient && typeof kvClient.set === 'function') {
      const ttl = FILE_EXPIRY_DAYS * 24 * 60 * 60;
      await kvClient.set(`file:${fileId}:meta`, JSON.stringify(fileInfo), { ex: ttl });
      await kvClient.set(`file:${fileId}:data`, buffer.toString('base64'), { ex: ttl });
      console.log('[upload] Saved to KV:', { fileId, recipient: recipientEmail });
    } else {
      // フォールバック：メモリ
      fileInfo.fileData = buffer;
      memoryStorage.set(fileId, fileInfo);
      global.fileStorage.set(fileId, fileInfo);
      console.log('[upload] KV unavailable -> using memory storage');
    }
  } catch (e) {
    console.error('[upload] Storage error:', e);
    return res.status(500).json({
      success: false,
      error: 'ファイルのアップロードに失敗しました',
      details: e.message
    });
  }

  // ベースURLを動的生成
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const baseUrl = `${proto}://${host}`;
  const downloadUrl = `${baseUrl}/download.html?id=${encodeURIComponent(fileId)}`;

  // send-link APIを呼び出し（Phase 22で追加）
  try {
    const sendLinkUrl = `${baseUrl}/api/files/send-link`;
    
    console.log('[upload] Calling send-link API:', sendLinkUrl);
    
    const sendLinkResponse = await fetch(sendLinkUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId,
        to: recipientEmail,
        message: ''
      })
    });

    const sendLinkResult = await sendLinkResponse.json();
    
    if (sendLinkResult.success) {
      console.log('[upload] Email sent successfully to:', recipientEmail);
    } else {
      console.error('[upload] Email sending failed:', sendLinkResult.error);
    }
  } catch (emailError) {
    console.error('[upload] Email sending error:', emailError.message);
    // メール送信エラーでもアップロードは成功として扱う
  }

  // レスポンス
  return res.status(200).json({
    success: true,
    message: 'ファイルが正常にアップロードされました',
    fileId,
    downloadUrl,
    otp,
    fileName: fileInfo.fileName,
    fileSize: fileInfo.fileSize,
    recipientEmail, // Phase 22で追加
    storageType: kvClient ? 'KV Storage (Persistent)' : 'Memory (Temporary)',
    expiryDate: fileInfo.expiryTime
  });
};