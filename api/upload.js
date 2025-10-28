// api/upload.js - ファイルアップロードエンドポイント（ES Modules版）
// Node組み込みの crypto を使用

import crypto from 'crypto';
import busboy from 'busboy';
import { kv } from '@vercel/kv';
import { encryptFile, generateOTP } from '../lib/encryption.js';
import { sendEmail } from '../lib/email-service.js';
import { canUseDirectAttach } from '../lib/environment.js';

// 環境変数
const FILE_ENCRYPT_KEY = process.env.FILE_ENCRYPT_KEY;
const DIRECT_ATTACH_MAX_SIZE = parseInt(process.env.DIRECT_ATTACH_MAX_SIZE || '10485760', 10); // 10MB

// 許可されたドメインのリスト
const ALLOWED_DIRECT_DOMAINS = (process.env.ALLOWED_DIRECT_DOMAINS || '')
  .split(',')
  .map(d => d.trim().toLowerCase())
  .filter(d => d.length > 0);

// リクエスト処理
export default async function handler(req, res) {
  // CORS設定
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
      error: 'Method not allowed'
    });
  }

  try {
    // マルチパートフォームデータをパース
    const { fields, file } = await parseMultipartForm(req);

    // 必須フィールドチェック
    if (!fields.recipient || !file) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: recipient or file'
      });
    }

    const recipient = fields.recipient;
    const fileBuffer = file.buffer;
    const fileName = file.filename;
    const fileSize = fileBuffer.length;

    // ファイルIDとOTPを生成
    const fileId = crypto.randomUUID();
    const otp = generateOTP();

    // ファイルを暗号化
    const encryptedData = encryptFile(fileBuffer, FILE_ENCRYPT_KEY);

    // 有効期限（7日後）
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // メタデータ
    const metadata = {
      fileName,
      fileSize,
      uploadedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      otp,
      downloadCount: 0,
      maxDownloads: 3,
      recipient
    };

    // KVに保存（7日TTL）
    const ttlSeconds = 7 * 24 * 60 * 60;
    await kv.set(`file:${fileId}:meta`, JSON.stringify(metadata), { ex: ttlSeconds });
    await kv.set(`file:${fileId}:data`, encryptedData.toString('base64'), { ex: ttlSeconds });

    // 受信者ドメインを抽出
    const recipientDomain = recipient.split('@')[1]?.toLowerCase() || '';

    // 添付直送の可否を判定
    let emailMode = 'link';
    let emailReason = null;
    let shouldAttach = false;

    if (canUseDirectAttach(recipientDomain)) {
      // サイズチェック
      if (fileSize <= DIRECT_ATTACH_MAX_SIZE) {
        shouldAttach = true;
        emailMode = 'attach';
      } else {
        emailMode = 'link';
        emailReason = 'size_exceeded';
      }
    } else {
      // 機能無効またはドメイン不一致
      emailMode = 'link';
      if (process.env.ENABLE_DIRECT_ATTACH === 'true') {
        emailReason = 'domain_not_allowed';
      } else {
        emailReason = 'feature_disabled';
      }
    }

    // メール送信
    const emailResult = await sendEmail({
      to: recipient,
      fileId,
      fileName,
      otp,
      shouldAttach,
      fileBuffer: shouldAttach ? fileBuffer : null
    });

    // 監査ログ（簡易版）
    console.log(JSON.stringify({
      event: 'file_upload',
      fileId,
      recipient,
      fileName,
      fileSize,
      mode: emailMode,
      reason: emailReason,
      emailSuccess: emailResult.success,
      timestamp: new Date().toISOString()
    }));

    // レスポンス
    return res.status(200).json({
      success: true,
      fileId,
      otp,
      email: {
        sent: emailResult.sent,
        success: emailResult.success,
        mode: emailMode,
        reason: emailReason
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}

// マルチパートフォームデータをパース
function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers });
    const fields = {};
    let file = null;

    bb.on('field', (fieldname, val) => {
      fields[fieldname] = val;
    });

    bb.on('file', (fieldname, fileStream, info) => {
      const { filename, encoding, mimeType } = info;
      const chunks = [];

      fileStream.on('data', (chunk) => {
        chunks.push(chunk);
      });

      fileStream.on('end', () => {
        file = {
          fieldname,
          filename,
          encoding,
          mimeType,
          buffer: Buffer.concat(chunks)
        };
      });
    });

    bb.on('finish', () => {
      resolve({ fields, file });
    });

    bb.on('error', (error) => {
      reject(error);
    });

    req.pipe(bb);
  });
}
