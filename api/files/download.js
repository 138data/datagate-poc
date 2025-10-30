// api/files/download.js - Node.js handler format (修正版 v2)
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
      console.log('[DEBUG] GET request.url:', request.url);
      
      // URLパラメータ取得（より確実な方法）
      let id = null;
      
      // 方法1: request.url から直接抽出
      const urlMatch = request.url.match(/[?&]id=([^&]+)/);
      if (urlMatch) {
        id = urlMatch[1];
        console.log('[DEBUG] ID extracted from regex:', id);
      }
      
      // 方法2: URL オブジェクトを試す
      if (!id) {
        try {
          const url = new URL(request.url, 'https://dummy.com');
          id = url.searchParams.get('id');
          console.log('[DEBUG] ID from URL object:', id);
        } catch (e) {
          console.log('[DEBUG] URL parsing failed:', e.message);
        }
      }

      console.log('[DEBUG] Final ID:', id);

      if (!id) {
        console.log('[ERROR] Missing file ID in request:', request.url);
        return new Response(JSON.stringify({ error: 'Missing file ID' }), {
          status: 400,
          headers: corsHeaders
        });
      }

      console.log('[DEBUG] Fetching metadata for fileId:', id);
      const metadataJson = await kv.get('file:' + id + ':meta');
      const metadata = safeParseMeta(metadataJson);

      if (!metadata) {
        console.log('[ERROR] File not found:', id);
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

      console.log('[DEBUG] Returning file info:', responseData);

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: corsHeaders
      });
    }

    // POST: OTP検証 + ダウンロード
    if (request.method === 'POST') {
      console.log('[DEBUG] POST download request');
      
      // リクエストボディ取得
      const body = await request.json();
      const fileId = body.fileId;
      const otp = body.otp;

      console.log('[DEBUG] fileId:', fileId, 'otp:', otp);

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
      console.log('[DEBUG] Verifying OTP...');
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

      console.log('[DEBUG] OTP verified successfully');

      // ダウンロード回数チェック
      const downloadCount = metadata.downloadCount || 0;
      const maxDownloads = metadata.maxDownloads || 3;

      console.log('[DEBUG] Download count:', downloadCount, '/', maxDownloads);

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
      console.log('[DEBUG] Fetching encrypted data...');
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
      console.log('[DEBUG] Decrypting file...');
      const encryptedBuffer = Buffer.from(encryptedDataObj.data, 'base64');
      const decryptedBuffer = decryptFile(
        encryptedBuffer,
        encryptedDataObj.salt,
        encryptedDataObj.iv,
        encryptedDataObj.authTag
      );

      console.log('[DEBUG] File decrypted, size:', decryptedBuffer.length);

      // ダウンロード回数更新
      console.log('[DEBUG] Updating download count...');
      metadata.downloadCount = downloadCount + 1;
      await kv.set('file:' + fileId + ':meta', JSON.stringify(metadata), {
        ex: 7 * 24 * 60 * 60
      });

      console.log('[DEBUG] Download count updated to:', metadata.downloadCount);

      // 監査ログ
      await saveAuditLog({
        event: 'download_success',
        actor: metadata.recipient,
        fileId: fileId,
        fileName: metadata.fileName,
        size: metadata.fileSize,
        downloadCount: metadata.downloadCount
      });

      console.log('[DEBUG] Sending file to client...');

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
