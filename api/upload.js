import multer from 'multer';
import crypto from 'crypto';
import { kv } from '@vercel/kv';
import { sendMailSecure } from '../service/email/send.js';

const upload = multer({ storage: multer.memoryStorage() });

// KDF設定
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';

// 暗号化関数
function encryptFile(buffer, password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, encrypted]);
}

// OTP生成（6桁数値）
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // Cache-Control: no-store を追加
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  return new Promise((resolve) => {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        console.error('Multer error:', err);
        res.status(400).json({ success: false, error: 'ファイルのアップロードに失敗しました' });
        return resolve();
      }

      try {
        const file = req.file;
        const recipientEmail = req.body.recipientEmail;

        if (!file) {
          res.status(400).json({ success: false, error: 'ファイルが選択されていません' });
          return resolve();
        }

        if (!recipientEmail) {
          res.status(400).json({ success: false, error: '送信先メールアドレスが指定されていません' });
          return resolve();
        }

        // OTP生成
        const otp = generateOTP();
        
        // ファイル暗号化（OTPをパスワードとして使用）
        const encryptedData = encryptFile(file.buffer, otp);
        const encryptedBase64 = encryptedData.toString('base64');

        // ファイルID生成
        const fileId = crypto.randomUUID();

        // メタデータ
        const metadata = {
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
          otp: otp,
          failedAttempts: 0,
        };

        // KVに保存（7日間のTTL）
        const ttlSeconds = 7 * 24 * 60 * 60;
        await kv.set(`file:${fileId}:meta`, metadata, { ex: ttlSeconds });
        await kv.set(`file:${fileId}:data`, encryptedBase64, { ex: ttlSeconds });

        // ダウンロードURL生成
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const baseUrl = `${protocol}://${host}`;
        const fullDownloadUrl = `${baseUrl}/download?id=${fileId}`;

        // メール送信（sendMailSecure を使用）
        const mailResult = await sendMailSecure({
          to: recipientEmail,
          fileName: file.originalname,
          fileSize: file.size,
          downloadUrl: fullDownloadUrl,
          otp: otp,
          fileBuffer: file.buffer, // 暗号化前のバッファ（添付直送用）
          fileId: fileId,
        });

        // 監査ログ保存（30日TTL）
        const auditKey = `audit:${Date.now()}:${fileId}`;
        const auditData = {
          ts: new Date().toISOString(),
          event: 'file_upload',
          fileId: fileId,
          fileName: file.originalname,
          fileSize: file.size,
          to: recipientEmail,
          mode: mailResult.mode || 'link',
          reason: mailResult.reason || 'default',
          status: 'success',
        };
        await kv.set(auditKey, auditData, { ex: 30 * 24 * 60 * 60 }); // 30日

        // 契約キー（downloadUrl）+ 後方互換（downloadLink）を返す
        res.status(200).json({
          success: true,
          downloadUrl: fullDownloadUrl,      // 契約キー
          downloadLink: fullDownloadUrl,     // 後方互換（Phase 41で削除予定）
          fileId: fileId,
          otp: otp,
          mailSent: true,
          mode: mailResult.mode,
          reason: mailResult.reason,
        });
        resolve();
      } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, error: 'アップロード処理に失敗しました' });
        resolve();
      }
    });
  });
}