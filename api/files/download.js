import { kv } from '@vercel/kv';
import { decryptFile, verifyOTP } from '../../lib/encryption.js';
import { sendDownloadNotificationEmail } from '../../lib/email-service.js';
import { saveAuditLog } from '../../lib/audit-log.js';

/**
 * メールアドレスをマスク表示
 */
function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [localPart, domain] = email.split('@');
  const masked = localPart.length > 0 ? localPart[0] + '***' : '***';
  return `${masked}@${domain}`;
}

export default async function handler(request) {
  console.log('[DEBUG] Handler start');
  console.log('[DEBUG] Method:', request.method);
  console.log('[DEBUG] URL:', request.url);

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  try {
    // Vercel では request.url が相対パスで渡されるため、絶対URLを構築
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('host') || request.headers.get('x-forwarded-host') || 'localhost';
    const fullUrl = `${protocol}://${host}${request.url}`;
    const url = new URL(fullUrl);
    
    console.log('[DEBUG] Full URL:', fullUrl);
    
    if (request.method === 'GET') {
      console.log('[DEBUG] GET handler');
      const fileId = url.searchParams.get('id');
      
      if (!fileId) {
        return new Response(
          JSON.stringify({ error: 'ファイルIDが指定されていません' }),
          { status: 400, headers }
        );
      }

      console.log('[DEBUG] Fetching metadata');
      const metadataJson = await kv.get('file:' + fileId + ':meta');
      
      if (!metadataJson) {
        return new Response(
          JSON.stringify({ error: 'ファイルが見つかりません' }),
          { status: 404, headers }
        );
      }

      const metadata = JSON.parse(metadataJson);
      
      if (metadata.revokedAt) {
        return new Response(
          JSON.stringify({ error: 'このファイルは失効されました' }),
          { status: 403, headers }
        );
      }

      return new Response(JSON.stringify({
        maskedEmail: maskEmail(metadata.recipient),
        fileName: metadata.fileName,
        fileSize: metadata.fileSize,
        uploadedAt: metadata.uploadedAt,
        expiresAt: metadata.expiresAt,
        downloadCount: metadata.downloadCount || 0,
        maxDownloads: metadata.maxDownloads || 3
      }), { status: 200, headers });
    }

    if (request.method === 'POST') {
      console.log('[DEBUG] POST handler');
      const body = await request.json();
      const { fileId, otp } = body;

      if (!fileId || !otp) {
        return new Response(
          JSON.stringify({ error: 'ファイルIDとOTPが必要です' }),
          { status: 400, headers }
        );
      }

      const metadataJson = await kv.get('file:' + fileId + ':meta');
      if (!metadataJson) {
        return new Response(
          JSON.stringify({ error: 'ファイルが見つかりません' }),
          { status: 404, headers }
        );
      }

      const metadata = JSON.parse(metadataJson);

      if (metadata.revokedAt) {
        return new Response(
          JSON.stringify({ error: 'このファイルは失効されました' }),
          { status: 403, headers }
        );
      }

      const maxDownloads = metadata.maxDownloads || 3;
      const currentCount = metadata.downloadCount || 0;

      if (currentCount >= maxDownloads) {
        return new Response(
          JSON.stringify({ error: 'ダウンロード回数の上限に達しています' }),
          { status: 403, headers }
        );
      }

      if (!verifyOTP(otp, metadata.otp)) {
        return new Response(
          JSON.stringify({ error: '認証コードが正しくありません' }),
          { status: 401, headers }
        );
      }

      const encryptedDataJson = await kv.get('file:' + fileId + ':data');
      if (!encryptedDataJson) {
        return new Response(
          JSON.stringify({ error: 'ファイルデータが見つかりません' }),
          { status: 404, headers }
        );
      }

      const encryptedDataObj = JSON.parse(encryptedDataJson);
      const encryptedBuffer = Buffer.from(encryptedDataObj.data, 'base64');
      const decryptedBuffer = decryptFile(
        encryptedBuffer,
        encryptedDataObj.salt,
        encryptedDataObj.iv,
        encryptedDataObj.authTag
      );

      metadata.downloadCount = currentCount + 1;
      await kv.set('file:' + fileId + ':meta', JSON.stringify(metadata));

      await saveAuditLog({
        event: 'download',
        fileId,
        fileName: metadata.fileName,
        recipient: metadata.recipient,
        downloadCount: metadata.downloadCount
      });

      if (metadata.notifyOnOpen && metadata.uploaderEmail) {
        await sendDownloadNotificationEmail({
          to: metadata.uploaderEmail,
          fileName: metadata.fileName,
          recipient: metadata.recipient,
          downloadCount: metadata.downloadCount
        });
      }

      const fileName = metadata.fileName || 'download.bin';
      const encodedFileName = encodeURIComponent(fileName)
        .replace(/['()]/g, escape)
        .replace(/\*/g, '%2A');

      return new Response(decryptedBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="file.bin"; filename*=UTF-8' + "''" + encodedFileName,
          'Content-Length': decryptedBuffer.length.toString(),
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    }

    return new Response(
      JSON.stringify({ error: 'メソッドが許可されていません' }),
      { status: 405, headers }
    );

  } catch (error) {
    console.error('[ERROR]', error);
    return new Response(
      JSON.stringify({ error: 'サーバーエラー', details: error.message }),
      { status: 500, headers }
    );
  }
}
