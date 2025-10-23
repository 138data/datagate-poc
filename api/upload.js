// api/upload.js - ノーコストAV仕込み版
// Phase 22準備：将来のマルウェアスキャン導入用の仕込み（現状は挙動変更なし）

const crypto = require('crypto');
const path = require('path');
const { kv } = require('@vercel/kv');

// 環境変数（既定OFF）
const AV_ENABLED = process.env.AV_ENABLED === 'true';
const AV_FAIL_OPEN = process.env.AV_FAIL_OPEN === 'true';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10485760; // 10MB
const FILE_EXPIRY_DAYS = parseInt(process.env.FILE_RETENTION_DAYS) || 7;

// 許可する拡張子（ゼロコストのセキュリティ強化）
const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.csv',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp',
  '.zip', '.rar', '.7z'
]);

// SHA256ハッシュ計算
function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// 将来用スタブ関数（現状は常にクリーンを返す）
async function scanBuffer(buffer, filename) {
  if (!AV_ENABLED) {
    return { clean: true, vendor: 'none' };
  }
  
  // 将来ここにCloudAVや自前ClamAV呼び出しを実装
  // 例: const result = await cloudAV.scan(buffer);
  //     return { clean: result.isClean, vendor: 'cloudav' };
  
  return { clean: true, vendor: 'future' };
}

// OTP生成（6桁英数字）
function generateOTP() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += chars[Math.floor(Math.random() * chars.length)];
  }
  return otp;
}

module.exports = async (req, res) => {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name, X-File-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed'
    });
  }

  try {
    // ヘッダーからファイル情報を取得（フロント側の将来対応用）
    const originalName = decodeURIComponent(
      req.headers['x-file-name'] || 'uploaded-file.dat'
    );
    const mimeTypeHdr = req.headers['x-file-type'] || 'application/octet-stream';

    // 拡張子チェック
    const ext = path.extname(originalName).toLowerCase();
    if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({
        success: false,
        error: `拡張子 ${ext} は許可されていません`,
        allowedExtensions: Array.from(ALLOWED_EXTENSIONS)
      });
    }

    // リクエストボディからファイルデータを読み込み
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // ファイルサイズチェック
    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        error: `ファイルサイズが上限（${MAX_FILE_SIZE / 1048576}MB）を超えています`
      });
    }

    if (buffer.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'ファイルが空です'
      });
    }

    // SHA256ハッシュ計算（将来の重複検出や検証用）
    const sha256 = computeSha256(buffer);

    // 将来用のスキャン処理（現在はAV_ENABLED=falseなので常にクリーン）
    let scanStatus = AV_ENABLED ? 'pending' : 'not_scanned';
    try {
      const scanResult = await scanBuffer(buffer, originalName);
      scanStatus = scanResult.clean ? 'clean' : 'infected';
      
      // 感染が検出され、Fail-Closedモードの場合は拒否
      if (!scanResult.clean && !AV_FAIL_OPEN) {
        console.error('[AV] Malware detected:', {
          fileName: originalName,
          sha256: sha256,
          vendor: scanResult.vendor
        });
        
        return res.status(400).json({
          success: false,
          error: 'ウイルスが検出されました。アップロードを中止しました。'
        });
      }
    } catch (error) {
      console.error('[AV] Scan error:', error);
      
      // AVサービスエラー時、Fail-Closedモードなら拒否
      if (!AV_FAIL_OPEN) {
        return res.status(503).json({
          success: false,
          error: 'セキュリティスキャンサービスに接続できません'
        });
      }
      
      // Fail-Openモードではwarningとして継続
      scanStatus = 'scan_error';
    }

    // ファイルIDとOTPを生成
    const fileId = crypto.randomUUID();
    const otp = generateOTP();

    // メタデータ（既存項目＋AV準備用項目）
    const fileInfo = {
      fileName: originalName,
      fileSize: buffer.length,
      mimeType: mimeTypeHdr,
      otp: otp,
      uploadTime: new Date().toISOString(),
      downloadCount: 0,
      maxDownloads: 3,
      expiryTime: new Date(Date.now() + FILE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      scanStatus: scanStatus,  // 将来用：'not_scanned' | 'pending' | 'clean' | 'infected' | 'scan_error'
      sha256: sha256            // 将来用：重複検出や検証
    };

    // Vercel KVに保存（メタデータとファイルデータを分離）
    const metaKey = `file:${fileId}:meta`;
    const dataKey = `file:${fileId}:data`;

    await kv.set(metaKey, fileInfo, { ex: FILE_EXPIRY_DAYS * 24 * 60 * 60 });
    await kv.set(dataKey, buffer.toString('base64'), { ex: FILE_EXPIRY_DAYS * 24 * 60 * 60 });

    console.log('[Upload] Success:', {
      fileId,
      fileName: originalName,
      fileSize: buffer.length,
      scanStatus: scanStatus,
      sha256: sha256.substring(0, 16) + '...'
    });

    // レスポンス
    return res.status(200).json({
      success: true,
      fileId: fileId,
      otp: otp,
      fileName: originalName,
      fileSize: buffer.length,
      expiryTime: fileInfo.expiryTime,
      maxDownloads: fileInfo.maxDownloads,
      scanStatus: scanStatus,  // フロント側で表示可能
      message: 'ファイルが正常にアップロードされました'
    });

  } catch (error) {
    console.error('[Upload] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'ファイルのアップロードに失敗しました',
      details: error.message
    });
  }
};
