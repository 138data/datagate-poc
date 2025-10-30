// api/files/download.js - Node.js handler format (完全版)
const { kv } = require('@vercel/kv');
const { decryptFile, verifyOTP } = require('../../lib/encryption.js');
const { saveAuditLog } = require('../../lib/audit-log.js');

const maskEmail = (mail) => {
  if (!mail || !mail.includes('@')) return '';
  const [l, d] = mail.split('@');
  const lm = l.length <= 2 ? l[0] + '*' : l[0] + '***' + l.slice(-1);
  const [d1, ...rest] = d.split('.');
  const dm = (d1.length <= 2 ? d1[0] + '*' : d1[0] + '***') + (rest.length ? '.' + rest.join('.') : '');
  return lm + '@' + dm;
};

const safeParseMeta = (metaVal) => {
  if (!metaVal) return null;
  if (typeof metaVal === 'string') {
    try { return JSON.parse(metaVal); } catch { return null; }
  }
  if (typeof metaVal === 'object') return metaVal;
  return null;
};

module.exports = async function handler(request) {
  // CORS headers
  const corsHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // OPTIONS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    // GET: ファイル情報取得
    if (request.method === 'GET') {
      // URLパラメータ取得
      const protocol = request.headers.get('x-forwarded-proto') || 'https';
      const host = request.headers.get('host') || request.headers.get('x-forwarded-host') || 'localhost';
      const fullUrl = protocol + '://' + host + request.url;
      const url = new URL(fullUrl);
      const id = url.searchParams.get('id');

      if (!id) {
        return new Response(JSON.stringify({ error: 'Missing file ID' }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const metadataJson = await kv.get('file:' + id + ':meta');
      const metadata = safeParseMeta(metadataJson);

      if (!metadata) {
        return new Response(JSON.stringify({ error: 'File not found' }), {
          status: 404,
          headers: corsHeaders
        });
      }

      // 失効チェック
      if (metadata.revokedAt) {
        return new Response(JSON.stringify({ error: 'File has been revoked' }), {
          status: 403,
          headers: corsHeaders
        });
      }

      // レスポンス
      const responseData = {
        success: true,
        fileName: metadata.fileName,
        fileSize: metadata.fileSize,
        uploadedAt: metadata.uploadedAt,
        expiresAt: metadata.expiresAt,
        downloadCount: metadata.downloadCount || 0,
        maxDownloads: metadata.maxDownloads || 3,
        maskedEmail: maskEmail(metadata.recipient)
      };

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: corsHeaders
      });
    }

    // POST: OTP検証 + ダウンロード
    if (request.method === 'POST') {

// リクエストボディ取得
      const body = await request.json();
      const fileId = body.fileId;
      const otp = body.otp;

      if (!fileId || !otp) {
        return new Response(JSON.stringify({ error: 'Missing fileId or otp' }), {
          status: 400,
          headers: corsHeaders
        });
      }

      const metadataJson = await kv.get('file:' + fileId + ':meta');
      const metadata = safeParseMeta(metadataJson);

      if (!metadata) {
        return new Response(JSON.stringify({ error: 'File not found' }), {
          status: 404,
          headers: corsHeaders
        });
      }

      // 失効チェック
      if (metadata.revokedAt) {
        await saveAuditLog({
          event: 'download_blocked',
          actor: metadata.recipient,
          fileId: fileId,
          fileName: metadata.fileName,
          reason: 'revoked'
        });
        return new Response(JSON.stringify({ error: 'File has been revoked' }), {
          status: 403,
          headers: corsHeaders
        });
      }

      // OTP検証
      if (!verifyOTP(otp, metadata.otp)) {
        await saveAuditLog({
          event: 'download_failed',
          actor: metadata.recipient,
          fileId: fileId,
          fileName: metadata.fileName,
          reason: 'invalid_otp'
        });
        return new Response(JSON.stringify({ error: 'Invalid OTP' }), {
          status: 401,
          headers: corsHeaders
        });
      }

      // ダウンロード回数チェック
      const downloadCount = metadata.downloadCount || 0;
      const maxDownloads = metadata.maxDownloads || 3;

      if (downloadCount >= maxDownloads) {
        await saveAuditLog({
          event: 'download_blocked',
          actor: metadata.recipient,
          fileId: fileId,
          fileName: metadata.fileName,
          reason: 'max_downloads_exceeded'
        });
        return new Response(JSON.stringify({ error: 'Maximum download limit reached' }), {
          status: 403,
          headers: corsHeaders
        });
      }

      // 暗号化データ取得
      const encryptedDataJson = await kv.get('file:' + fileId + ':data');

      if (!encryptedDataJson) {
        return new Response(JSON.stringify({ error: 'File data not found' }), {
          status: 404,
          headers: corsHeaders
        });
      }

      let encryptedDataObj;
      if (typeof encryptedDataJson === 'string') {
        encryptedDataObj = JSON.parse(encryptedDataJson);
      } else {
        encryptedDataObj = encryptedDataJson;
      }

      // 復号化
      const encryptedBuffer = Buffer.from(encryptedDataObj.data, 'base64');
      const decryptedBuffer = decryptFile(
        encryptedBuffer,
        encryptedDataObj.salt,
        encryptedDataObj.iv,
        encryptedDataObj.authTag
      );

      // ダウンロード回数更新
      metadata.downloadCount = downloadCount + 1;
      await kv.set('file:' + fileId + ':meta', JSON.stringify(metadata), {
        ex: 7 * 24 * 60 * 60
      });

      // 監査ログ
      await saveAuditLog({
        event: 'download_success',
        actor: metadata.recipient,
        fileId: fileId,
        fileName: metadata.fileName,
        size: metadata.fileSize,
        downloadCount: metadata.downloadCount
      });

      // ファイル送信
      const fileHeaders = {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="' + metadata.fileName + '"; filename*=UTF-8\'\'' + encodeURIComponent(metadata.fileName),
        'Content-Length': decryptedBuffer.length.toString(),
        'Cache-Control': 'no-store'
      };

      return new Response(decryptedBuffer, {
        status: 200,
        headers: fileHeaders
      });
    }

    // その他のメソッド
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders
    });

  } catch (error) {
    console.error('[ERROR] download.js:', error.message);
    console.error('[STACK]', error.stack);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    });
  }
};