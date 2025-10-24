// api/upload.js
// ファイルアップロードAPI（Phase 21対応・ハードニング適用版）

const { createClient } = require('@vercel/kv');
const formidable = require('formidable');
const { v4: uuidv4 } = require('uuid');

// Vercel KV クライアント初期化
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// 環境変数から設定を読み込み
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 52428800; // デフォルト 50MB
const FILE_RETENTION_DAYS = parseInt(process.env.FILE_RETENTION_DAYS) || 7;
const ENABLE_COMPRESSION = process.env.ENABLE_COMPRESSION === 'true';

// OTP生成関数（6桁数字）
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONSリクエスト対応
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POSTメソッドのみ許可
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // formidableで正式にパース
    const form = new formidable.IncomingForm({
      maxFileSize: MAX_FILE_SIZE,
      keepExtensions: true,
    });

    // ファイル解析
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    // ファイル取得
    const uploadedFile = files.file;
    if (!uploadedFile) {
      return res.status(400).json({ error: 'ファイルがありません' });
    }

    // ファイル情報取得
    const file = Array.isArray(uploadedFile) ? uploadedFile[0] : uploadedFile;
    const filePath = file.filepath;
    const fileName = file.originalFilename || 'untitled';
    const fileSize = file.size;
    const mimeType = file.mimetype || 'application/octet-stream';

    // サイズチェック
    if (fileSize > MAX_FILE_SIZE) {
      return res.status(400).json({ 
        error: `ファイルサイズが上限（${Math.floor(MAX_FILE_SIZE / 1024 / 1024)}MB）を超えています` 
      });
    }

    // ファイルを読み込み
    const fs = require('fs').promises;
    const fileBuffer = await fs.readFile(filePath);

    // 圧縮処理（オプション）
    let finalBuffer = fileBuffer;
    let compressed = false;
    let originalSize = fileSize;
    let compressedSize = fileSize;

    if (ENABLE_COMPRESSION && isCompressible(mimeType)) {
      try {
        const zlib = require('zlib');
        const { promisify } = require('util');
        const gzip = promisify(zlib.gzip);
        
        finalBuffer = await gzip(fileBuffer);
        compressed = true;
        compressedSize = finalBuffer.length;
        
        console.log(`圧縮実施: ${fileName}`);
        console.log(`元のサイズ: ${originalSize} bytes`);
        console.log(`圧縮後サイズ: ${compressedSize} bytes`);
        console.log(`圧縮率: ${((1 - compressedSize / originalSize) * 100).toFixed(2)}%`);
      } catch (compressError) {
        console.error('圧縮エラー:', compressError);
        // 圧縮失敗時は元のファイルを使用
        finalBuffer = fileBuffer;
        compressed = false;
      }
    }

    // ファイルID生成
    const fileId = uuidv4();

    // OTP生成
    const otp = generateOTP();

    // 有効期限計算
    const uploadTime = new Date();
    const expiryTime = new Date(uploadTime.getTime() + FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    // KVに保存するデータ
    const fileData = {
      fileId,
      fileName,
      fileSize: originalSize,
      compressedSize: compressed ? compressedSize : originalSize,
      compressed,
      mimeType,
      otp,
      uploadTime: uploadTime.toISOString(),
      expiryTime: expiryTime.toISOString(),
      remainingDownloads: 5, // デフォルト5回
      fileBuffer: finalBuffer.toString('base64'), // base64エンコード
    };

    // Vercel KVに保存（TTL付き）
    const ttlSeconds = FILE_RETENTION_DAYS * 24 * 60 * 60;
    await kv.set(`file:${fileId}`, fileData, { ex: ttlSeconds });

    // 一時ファイル削除
    try {
      await fs.unlink(filePath);
    } catch (unlinkError) {
      console.error('一時ファイル削除エラー:', unlinkError);
    }

    // ダウンロードURL生成（動的ホスト）
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers['host'];
    const downloadUrl = `${protocol}://${host}/download.html?id=${fileId}`;

    // レスポンス
    return res.status(200).json({
      success: true,
      fileId,
      otp,
      fileName,
      fileSize: originalSize,
      compressedSize: compressed ? compressedSize : originalSize,
      compressed,
      downloadUrl,
      expiryTime: expiryTime.toISOString(),
      remainingDownloads: 5,
    });

  } catch (error) {
    console.error('アップロードエラー:', error);
    return res.status(500).json({ 
      error: 'アップロードに失敗しました',
      details: error.message 
    });
  }
};

// 圧縮対象判定
function isCompressible(mimeType) {
  const compressibleTypes = [
    'text/',
    'application/json',
    'application/xml',
    'application/javascript',
    'application/x-javascript',
    'image/svg+xml',
  ];
  
  return compressibleTypes.some(type => mimeType.startsWith(type));
}
