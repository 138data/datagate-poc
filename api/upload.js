// ========================================
// api/upload.js - CommonJS形式（Vercel互換）
// ========================================

const { createClient } = require('@vercel/kv');
const formidable = require('formidable');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

// 環境変数
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '52428800', 10); // 50MB
const FILE_RETENTION_DAYS = parseInt(process.env.FILE_RETENTION_DAYS || '7', 10);

// KVクライアント初期化
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// OTP生成（数字のみ6桁）
function generateOTP() {
  const chars = '0123456789';
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += chars[Math.floor(Math.random() * chars.length)];
  }
  return otp;
}

// メインハンドラー
module.exports = async (req, res) => {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONSリクエスト処理
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POSTメソッドのみ許可
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed',
      message: 'POSTメソッドのみサポートしています',
    });
  }

  try {
    console.log('[Upload] ファイルアップロード開始');

    // formidable設定
    const form = formidable({
      maxFileSize: MAX_FILE_SIZE,
      keepExtensions: true,
      multiples: false,
    });

    // フォームデータをパース
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('[Upload] formidable parse error:', err);
          reject(err);
        } else {
          resolve([fields, files]);
        }
      });
    });

    console.log('[Upload] フォームデータ解析完了');

    // ファイルチェック
    const fileArray = files.file;
    if (!fileArray || fileArray.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No File',
        message: 'ファイルが選択されていません',
      });
    }

    const file = fileArray[0];
    console.log('[Upload] ファイル情報:', {
      originalFilename: file.originalFilename,
      size: file.size,
      mimetype: file.mimetype,
    });

    // ファイルサイズチェック
    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        error: 'File Too Large',
        message: `ファイルサイズが上限（${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB）を超えています`,
      });
    }

    // ファイルIDとOTPを生成
    const fileId = uuidv4();
    const otp = generateOTP();

    console.log('[Upload] 生成情報:', {
      fileId,
      otp,
    });

    // ファイルデータを読み込み
    const fileBuffer = await fs.readFile(file.filepath);

    // メタデータを作成
    const metadata = {
      fileId,
      fileName: file.originalFilename || 'unknown',
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size,
      otp,
      uploadedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    };

    // KVに保存（ファイルデータはBase64エンコード）
    await kv.set(`file:${fileId}`, {
      ...metadata,
      data: fileBuffer.toString('base64'),
    }, {
      ex: FILE_RETENTION_DAYS * 24 * 60 * 60, // TTL（秒）
    });

    console.log('[Upload] KVに保存完了');

    // 一時ファイル削除
    try {
      await fs.unlink(file.filepath);
      console.log('[Upload] 一時ファイル削除完了');
    } catch (unlinkError) {
      console.warn('[Upload] 一時ファイル削除失敗（無視）:', unlinkError.message);
    }

    // 成功レスポンス
    return res.status(200).json({
      success: true,
      message: 'ファイルがアップロードされました',
      fileId,
      otp,
      fileName: file.originalFilename,
      size: file.size,
      expiresAt: metadata.expiresAt,
    });

  } catch (error) {
    console.error('[Upload] エラー:', error);

    // エラーレスポンス（必ずJSON形式）
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'ファイルのアップロードに失敗しました',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
