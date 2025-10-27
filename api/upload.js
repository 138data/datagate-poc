// api/upload.js - Phase 22対応版（環境判定機能追加）
const crypto = require('crypto');
const multer = require('multer');

// 🆕 環境判定ユーティリティをインポート
const { isProduction, isEmailEnabled, getEnvironmentInfo } = require('../lib/environment');

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
  // CORS対応
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 🆕 環境情報を取得
  const envInfo = getEnvironmentInfo();
  console.log(`📍 Environment: ${envInfo.environment}, Email Enabled: ${envInfo.emailEnabled}, Sandbox: ${envInfo.sandboxMode}`);

  return new Promise((resolve) => {
    upload(req, res, async (err) => {
      if (err) {
        console.error('❌ Multer error:', err);
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ error: 'ファイルサイズが上限を超えています' });
        } else {
          res.status(500).json({ error: 'ファイルアップロードに失敗しました' });
        }
        return resolve();
      }

      try {
        // --- 必須フィールドのチェック ---
        const { sender, recipient } = req.body;
        if (!sender || !recipient) {
          return res.status(400).json({ 
            error: '送信者と受信者のメールアドレスが必要です',
            details: { sender: !!sender, recipient: !!recipient }
          });
        }

        // --- ファイルの存在確認 ---
        if (!req.file) {
          return res.status(400).json({ error: 'ファイルが指定されていません' });
        }

        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        const fileSize = req.file.size;
        const mimeType = req.file.mimetype;

        console.log(`📤 アップロード開始: ${fileName} (${fileSize} bytes)`);

        // --- ファイルID生成 ---
        const fileId = crypto.randomBytes(16).toString('hex');

        // --- OTP生成（6桁の数字） ---
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // --- 暗号化 ---
        const encryptionKey = crypto.randomBytes(32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
        
        const encryptedBuffer = Buffer.concat([
          cipher.update(fileBuffer),
          cipher.final()
        ]);
        const authTag = cipher.getAuthTag();

        // --- Base64エンコード ---
        const encryptedData = encryptedBuffer.toString('base64');
        const encKeyB64 = encryptionKey.toString('base64');
        const ivB64 = iv.toString('base64');
        const authTagB64 = authTag.toString('base64');

        // --- 有効期限 ---
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + FILE_EXPIRY_DAYS);
        const ttlSeconds = FILE_EXPIRY_DAYS * 24 * 60 * 60;

        // --- メタデータ ---
        const metadata = {
          fileName,
          fileSize,
          mimeType,
          sender,
          recipient,
          encryptionKey: encKeyB64,
          iv: ivB64,
          authTag: authTagB64,
          otp,
          downloadCount: 0,
          maxDownloads: 3,
          uploadedAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString()
        };

        // --- KVに保存 ---
        const metaKey = `file:${fileId}:meta`;
        const dataKey = `file:${fileId}:data`;

        if (kvClient) {
          await kvClient.set(metaKey, JSON.stringify(metadata), { ex: ttlSeconds });
          await kvClient.set(dataKey, encryptedData, { ex: ttlSeconds });
          console.log(`✅ KVに保存成功: ${fileId}`);
        } else {
          // メモリフォールバック
          memoryStorage.set(metaKey, JSON.stringify(metadata));
          memoryStorage.set(dataKey, encryptedData);
          global.fileStorage.set(metaKey, JSON.stringify(metadata));
          global.fileStorage.set(dataKey, encryptedData);
          console.log(`✅ メモリに保存成功（フォールバック）: ${fileId}`);
        }

        // --- ダウンロードURL生成 ---
        const baseUrl = req.headers.origin || `https://${req.headers.host}`;
        const downloadUrl = `${baseUrl}/download.html?id=${fileId}`;

        // 🆕 メール送信の判定
        if (isEmailEnabled()) {
          // 本番環境：実際にメールを送信
          console.log(`📧 [Production] メール送信を実行: ${recipient}`);
          // TODO: 実際のメール送信処理をここに実装
          // 例: await sendDownloadEmail(recipient, downloadUrl, otp, fileName);
        } else {
          // Preview/Development環境：メール送信をシミュレート
          console.log(`📧 [${envInfo.environment.toUpperCase()} Mode] メール送信をシミュレート`);
          console.log(`   宛先: ${recipient}`);
          console.log(`   ダウンロードURL: ${downloadUrl}`);
          console.log(`   OTP: ${otp}`);
          console.log(`   ファイル名: ${fileName}`);
        }

        // --- レスポンス ---
        const response = {
          success: true,
          fileId,
          downloadUrl,
          otp,
          fileName,
          fileSize,
          expiresAt: expiresAt.toISOString(),
          maxDownloads: 3
        };

        // 🆕 非本番環境では環境情報を含める
        if (!isProduction()) {
          response._debug = {
            environment: envInfo.environment,
            emailSent: isEmailEnabled(),
            sandboxMode: envInfo.sandboxMode,
            vercelUrl: envInfo.vercelUrl
          };
        }

        console.log(`✅ アップロード完了: ${fileId}`);
        res.status(200).json(response);
        resolve();

      } catch (error) {
        console.error('❌ アップロードエラー:', error);
        res.status(500).json({ 
          error: 'サーバーエラーが発生しました',
          details: error.message 
        });
        resolve();
      }
    });
  });
};