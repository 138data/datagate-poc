// api/upload.js - Phase 21 セキュリティ強化版
// 作成日: 2025年10月21日
// 修正内容:
// 1. baseUrl を動的化（x-forwarded-host使用）
// 2. CORS制限（本番ドメインのみ）
// 3. テストエンドポイントの本番無効化

import { kv } from '@vercel/kv';
import { randomBytes } from 'crypto';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb'
    }
  }
};

// 許可するオリジン（本番環境）
const ALLOWED_ORIGINS = [
  'https://datagate-nxp6snt5y-138datas-projects.vercel.app',
  'https://datagate-g1gooejzp-138datas-projects.vercel.app',
  'https://datagate-150t77hod-138datas-projects.vercel.app',
  'https://datagate-hl8kkleun-138datas-projects.vercel.app'
];

// 開発環境の場合は localhost も許可
if (process.env.NODE_ENV === 'development') {
  ALLOWED_ORIGINS.push('http://localhost:3000');
}

// テスト機能を有効化するかどうか（本番では false）
const ALLOW_TEST_ENDPOINTS = process.env.ALLOW_TEST_ENDPOINTS === 'true';

// セキュリティヘッダーを設定
function setSecurityHeaders(res, origin) {
  // CORS（許可されたオリジンのみ）
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  // セキュリティヘッダー
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
}

// OTP生成（6桁の数字）
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ファイルIDを生成（UUID形式）
function generateFileId() {
  return randomBytes(16).toString('hex');
}

// baseURLを動的に生成
function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || req.headers.referer || '';

  // OPTIONS リクエスト（プリフライト）の処理
  if (req.method === 'OPTIONS') {
    setSecurityHeaders(res, origin);
    return res.status(200).end();
  }

  // POST のみ許可
  if (req.method !== 'POST') {
    setSecurityHeaders(res, origin);
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed'
    });
  }

  try {
    console.log('[Upload] Receiving file upload request');

    // リクエストボディを取得（バイナリデータ）
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    if (!fileBuffer || fileBuffer.length === 0) {
      console.warn('[Upload] Empty file received');
      return res.status(400).json({
        success: false,
        error: 'ファイルが空です'
      });
    }

    // ファイルサイズチェック
    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '52428800'); // 50MB
    if (fileBuffer.length > maxSize) {
      console.warn(`[Upload] File too large: ${fileBuffer.length} bytes (max: ${maxSize})`);
      return res.status(413).json({
        success: false,
        error: `ファイルサイズが上限（${Math.floor(maxSize / 1048576)}MB）を超えています`
      });
    }

    // ファイルID と OTP を生成
    const fileId = generateFileId();
    const otp = generateOTP();

    console.log(`[Upload] Generated file ID: ${fileId}`);

    // ファイル名を取得（Content-Disposition ヘッダーから）
    const contentDisposition = req.headers['content-disposition'] || '';
    let fileName = 'untitled';
    const fileNameMatch = contentDisposition.match(/filename="?([^";\n]+)"?/);
    if (fileNameMatch) {
      fileName = decodeURIComponent(fileNameMatch[1]);
    }

    // MIMEタイプを取得
    const mimeType = req.headers['content-type'] || 'application/octet-stream';

    // 有効期限を設定（7日後）
    const retentionDays = parseInt(process.env.FILE_RETENTION_DAYS || '7');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);

    // メタデータをKVに保存
    const fileInfo = {
      fileId,
      fileName,
      mimeType,
      size: fileBuffer.length,
      otp,
      uploadedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      downloadCount: 0,
      maxDownloads: null // 無制限（必要に応じて設定可能）
    };

    await kv.set(`file:${fileId}`, fileInfo, {
      ex: retentionDays * 86400 // TTL（秒）
    });

    // ファイル本体をKVに保存（Base64エンコード）
    const fileData = fileBuffer.toString('base64');
    await kv.set(`fileData:${fileId}`, fileData, {
      ex: retentionDays * 86400 // TTL（秒）
    });

    console.log(`[Upload] File saved: ${fileName} (${fileBuffer.length} bytes)`);

    // ダウンロードURLを生成（動的baseUrl）
    const baseUrl = getBaseUrl(req);
    const downloadUrl = `${baseUrl}/download.html?id=${fileId}`;

    setSecurityHeaders(res, origin);

    return res.status(200).json({
      success: true,
      message: 'ファイルが正常にアップロードされました',
      fileId,
      fileName,
      size: fileBuffer.length,
      otp,
      downloadUrl,
      expiresAt: expiresAt.toISOString()
    });

  } catch (error) {
    console.error('[Upload] Error:', error.message);
    setSecurityHeaders(res, origin);
    return res.status(500).json({
      success: false,
      error: 'ファイルのアップロードに失敗しました',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// テストエンドポイント（開発環境のみ）
export async function testUpload(req, res) {
  if (!ALLOW_TEST_ENDPOINTS) {
    return res.status(403).json({
      success: false,
      error: 'Test endpoints are disabled in production'
    });
  }

  const origin = req.headers.origin || req.headers.referer || '';
  setSecurityHeaders(res, origin);

  try {
    const fileId = 'test123';
    const otp = '123456';
    const fileName = 'test-file.txt';
    const fileContent = 'This is a test file for 138DataGate.';
    const fileBuffer = Buffer.from(fileContent, 'utf-8');

    const fileInfo = {
      fileId,
      fileName,
      mimeType: 'text/plain',
      size: fileBuffer.length,
      otp,
      uploadedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      downloadCount: 0,
      maxDownloads: null
    };

    await kv.set(`file:${fileId}`, fileInfo, { ex: 7 * 86400 });
    await kv.set(`fileData:${fileId}`, fileBuffer.toString('base64'), { ex: 7 * 86400 });

    const baseUrl = getBaseUrl(req);
    const downloadUrl = `${baseUrl}/download.html?id=${fileId}`;

    return res.status(200).json({
      success: true,
      message: 'テストファイルを作成しました',
      fileId,
      otp,
      downloadUrl
    });

  } catch (error) {
    console.error('[TestUpload] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'テストファイルの作成に失敗しました'
    });
  }
}
