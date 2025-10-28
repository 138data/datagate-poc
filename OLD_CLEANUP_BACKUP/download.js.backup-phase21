// api/download.js - Phase 21 セキュリティ強化版
// 作成日: 2025年10月21日
// 修正内容:
// 1. OTPログの秘匿化
// 2. キャッシュ禁止ヘッダ追加
// 3. CORS制限（本番ドメインのみ）
// 4. POST統一（OTPはリクエストボディで受け取る）

import { kv } from '@vercel/kv';

export const config = {
  api: {
    bodyParser: true
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

// OTPをマスク化する関数（ログ出力用）
function maskOTP(otp) {
  if (!otp || otp.length < 3) return '***';
  return otp.substring(0, 2) + '*'.repeat(otp.length - 2);
}

// セキュリティヘッダーを設定
function setSecurityHeaders(res, origin) {
  // キャッシュ禁止
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // セキュリティヘッダー
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // CORS（許可されたオリジンのみ）
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || req.headers.referer || '';

  // OPTIONS リクエスト（プリフライト）の処理
  if (req.method === 'OPTIONS') {
    setSecurityHeaders(res, origin);
    return res.status(200).end();
  }

  // GET: メタデータ確認（OTP不要）
  if (req.method === 'GET') {
    try {
      const { id } = req.query;

      if (!id) {
        console.warn('[Download] GET: Missing file ID');
        return res.status(400).json({
          success: false,
          error: 'ファイルIDが必要です'
        });
      }

      console.log(`[Download] GET: Checking metadata for file: ${id}`);

      // KVからメタデータ取得
      const fileInfo = await kv.get(`file:${id}`);

      if (!fileInfo) {
        console.warn(`[Download] GET: File not found: ${id}`);
        return res.status(404).json({
          success: false,
          error: 'ファイルが見つかりません'
        });
      }

      // 有効期限チェック
      if (fileInfo.expiresAt && new Date(fileInfo.expiresAt) < new Date()) {
        console.warn(`[Download] GET: File expired: ${id}`);
        await kv.del(`file:${id}`);
        return res.status(410).json({
          success: false,
          error: 'ファイルの有効期限が切れています'
        });
      }

      // ダウンロード回数チェック
      if (fileInfo.maxDownloads && fileInfo.downloadCount >= fileInfo.maxDownloads) {
        console.warn(`[Download] GET: Download limit exceeded: ${id}`);
        await kv.del(`file:${id}`);
        return res.status(410).json({
          success: false,
          error: 'ダウンロード回数の上限に達しました'
        });
      }

      setSecurityHeaders(res, origin);

      // メタデータのみ返却（OTPは含めない）
      return res.status(200).json({
        success: true,
        fileName: fileInfo.fileName,
        size: fileInfo.size,
        uploadedAt: fileInfo.uploadedAt,
        expiresAt: fileInfo.expiresAt,
        downloadCount: fileInfo.downloadCount || 0,
        maxDownloads: fileInfo.maxDownloads || null
      });

    } catch (error) {
      console.error('[Download] GET Error:', error.message);
      return res.status(500).json({
        success: false,
        error: 'メタデータの取得に失敗しました'
      });
    }
  }

  // POST: OTP認証＆ファイル本体返却
  if (req.method === 'POST') {
    try {
      const { id, otp } = req.body;

      if (!id || !otp) {
        console.warn('[Download] POST: Missing id or otp');
        return res.status(400).json({
          success: false,
          error: 'ファイルIDとOTPが必要です'
        });
      }

      console.log(`[Download] POST: Attempting download for file: ${id}, OTP: ${maskOTP(otp)}`);

      // KVからメタデータ取得
      const fileInfo = await kv.get(`file:${id}`);

      if (!fileInfo) {
        console.warn(`[Download] POST: File not found: ${id}`);
        return res.status(404).json({
          success: false,
          error: 'ファイルが見つかりません'
        });
      }

      // 有効期限チェック
      if (fileInfo.expiresAt && new Date(fileInfo.expiresAt) < new Date()) {
        console.warn(`[Download] POST: File expired: ${id}`);
        await kv.del(`file:${id}`);
        return res.status(410).json({
          success: false,
          error: 'ファイルの有効期限が切れています'
        });
      }

      // ダウンロード回数チェック
      if (fileInfo.maxDownloads && fileInfo.downloadCount >= fileInfo.maxDownloads) {
        console.warn(`[Download] POST: Download limit exceeded: ${id}`);
        await kv.del(`file:${id}`);
        return res.status(410).json({
          success: false,
          error: 'ダウンロード回数の上限に達しました'
        });
      }

      // OTP認証（秘匿化ログ）
      if (fileInfo.otp !== otp) {
        console.warn(`[Download] POST: OTP mismatch for file: ${id}, provided: ${maskOTP(otp)}`);
        return res.status(401).json({
          success: false,
          error: 'OTPが正しくありません'
        });
      }

      console.log(`[Download] POST: OTP verified for file: ${id}`);

      // ファイル本体を取得
      const fileData = await kv.get(`fileData:${id}`);

      if (!fileData) {
        console.error(`[Download] POST: File data not found: ${id}`);
        return res.status(500).json({
          success: false,
          error: 'ファイルデータが見つかりません'
        });
      }

      // ダウンロード回数を更新
      const newDownloadCount = (fileInfo.downloadCount || 0) + 1;
      await kv.set(`file:${id}`, {
        ...fileInfo,
        downloadCount: newDownloadCount,
        lastDownloadedAt: new Date().toISOString()
      });

      console.log(`[Download] POST: Download count updated: ${newDownloadCount}/${fileInfo.maxDownloads || '∞'}`);

      // ダウンロード上限に達した場合は削除
      if (fileInfo.maxDownloads && newDownloadCount >= fileInfo.maxDownloads) {
        console.log(`[Download] POST: Max downloads reached, deleting file: ${id}`);
        await kv.del(`file:${id}`);
        await kv.del(`fileData:${id}`);
      }

      // セキュリティヘッダー設定
      setSecurityHeaders(res, origin);

      // ファイル返却
      res.setHeader('Content-Type', fileInfo.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileInfo.fileName)}"`);
      res.setHeader('Content-Length', Buffer.byteLength(fileData, 'base64'));

      console.log(`[Download] POST: Sending file: ${fileInfo.fileName} (${fileInfo.size} bytes)`);

      return res.status(200).send(Buffer.from(fileData, 'base64'));

    } catch (error) {
      console.error('[Download] POST Error:', error.message);
      return res.status(500).json({
        success: false,
        error: 'ファイルのダウンロードに失敗しました'
      });
    }
  }

  // その他のメソッドは許可しない
  setSecurityHeaders(res, origin);
  return res.status(405).json({
    success: false,
    error: 'Method Not Allowed'
  });
}
