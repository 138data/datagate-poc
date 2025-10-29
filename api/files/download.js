import kv from '@vercel/kv';
import { decryptFile, verifyOTP } from '../../lib/encryption.js';
import { saveAuditLog } from '../../lib/audit-log.js';

function maskEmail(email) {
  if (!email) return '***@***.***';
  const [localPart, domain] = email.split('@');
  if (!domain) return '***@***.***';
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

  try {
    // URL パース処理を try-catch で囲む
    console.log('[DEBUG] Starting URL parse');
    
    let fileId = null;
    
    // GET の場合、クエリパラメータから fileId を取得
    if (request.method === 'GET') {
      console.log('[DEBUG] GET handler - parsing URL');
      
      // request.url からクエリパラメータを直接抽出
      const urlParts = request.url.split('?');
      if (urlParts.length > 1) {
        const queryString = urlParts[1];
        const params = new URLSearchParams(queryString);
        fileId = params.get('id');
        console.log('[DEBUG] fileId from query:', fileId);
      }
      
      if (!fileId) {
        console.log('[ERROR] No fileId in query');
        return new Response(
          JSON.stringify({ error: 'ファイルIDが指定されていません' }),
          { status: 400, headers }
        );
      }

      console.log('[DEBUG] Fetching metadata for fileId:', fileId);
      const metadataJson = await kv.get('file:' + fileId + ':meta');
      
      if (!metadataJson) {
        console.log('[ERROR] Metadata not found for fileId:', fileId);
        return new Response(
          JSON.stringify({ error: 'ファイルが見つかりません' }),
          { status: 404, headers }
        );
      }

      console.log('[DEBUG] Metadata found, parsing JSON');
      const metadata = JSON.parse(metadataJson);

      // 失効チェック
      if (metadata.revokedAt) {
        console.log('[ERROR] File revoked at:', metadata.revokedAt);
        return new Response(
          JSON.stringify({ error: 'このファイルは失効されています' }),
          { status: 403, headers }
        );
      }

      console.log('[DEBUG] Building response');
      return new Response(JSON.stringify({
        fileName: metadata.fileName,
        fileSize: metadata.fileSize,
        uploadedAt: metadata.uploadedAt,
        expiresAt: metadata.expiresAt,
        downloadCount: metadata.downloadCount || 0,
        maxDownloads: metadata.maxDownloads || 3,
        maskedEmail: maskEmail(metadata.recipient)
      }), { status: 200, headers });
    }

    // POST の場合
    if (request.method === 'POST') {
      console.log('[DEBUG] POST handler');
      const body = await request.json();
      const { fileId: postFileId, otp } = body;

      if (!postFileId || !otp) {
        console.log('[ERROR] Missing fileId or otp in POST body');
        return new Response(
          JSON.stringify({ error: 'ファイルIDまたはOTPが指定されていません' }),
          { status: 400, headers }
        );
      }

      console.log('[DEBUG] Fetching metadata for POST');
      const metadataJson = await kv.get('file:' + postFileId + ':meta');
      
      if (!metadataJson) {
        console.log('[ERROR] Metadata not found for POST');
        return new Response(
          JSON.stringify({ error: 'ファイルが見つかりません' }),
          { status: 404, headers }
        );
      }

      const metadata = JSON.parse(metadataJson);

      // 失効チェック
      if (metadata.revokedAt) {
        console.log('[ERROR] File revoked (POST)');
        return new Response(
          JSON.stringify({ error: 'このファイルは失効されています' }),
          { status: 403, headers }
        );
      }

      // ダウンロード回数制限チェック
      const maxDownloads = metadata.maxDownloads || 3;
      const currentDownloadCount = metadata.downloadCount || 0;

      if (currentDownloadCount >= maxDownloads) {
        console.log('[ERROR] Download limit exceeded');
        await saveAuditLog({
          event: 'download_failed',
          fileId: postFileId,
          fileName: metadata.fileName,
          actor: metadata.recipient,
          reason: 'limit_exceeded'
        });

        return new Response(
          JSON.stringify({ error: 'ダウンロード回数の上限に達しました' }),
          { status: 403, headers }
        );
      }

      // OTP検証
      console.log('[DEBUG] Verifying OTP');
      if (!verifyOTP(otp, metadata.otp)) {
        console.log('[ERROR] OTP verification failed');
        await saveAuditLog({
          event: 'download_failed',
          fileId: postFileId,
          fileName: metadata.fileName,
          actor: metadata.recipient,
          reason: 'invalid_otp'
        });

        return new Response(
          JSON.stringify({ error: '認証コードが正しくありません' }),
          { status: 401, headers }
        );
      }

      console.log('[DEBUG] OTP verified, fetching encrypted data');
      
      // 暗号化データ取得
      const encryptedDataJson = await kv.get('file:' + postFileId + ':data');
      
      if (!encryptedDataJson) {
        console.log('[ERROR] Encrypted data not found');
        return new Response(
          JSON.stringify({ error: '暗号化データが見つかりません' }),
          { status: 404, headers }
        );
      }

      console.log('[DEBUG] Decrypting file');
      const encryptedDataObj = JSON.parse(encryptedDataJson);
      const encryptedBuffer = Buffer.from(encryptedDataObj.data, 'base64');
      
      const decryptedBuffer = decryptFile(
        encryptedBuffer,
        encryptedDataObj.salt,
        encryptedDataObj.iv,
        encryptedDataObj.authTag
      );

      // ダウンロード回数をインクリメント
      console.log('[DEBUG] Incrementing download count');
      metadata.downloadCount = currentDownloadCount + 1;
      await kv.set('file:' + postFileId + ':meta', JSON.stringify(metadata));

      // 監査ログ
      console.log('[DEBUG] Saving audit log');
      await saveAuditLog({
        event: 'download_success',
        fileId: postFileId,
        fileName: metadata.fileName,
        actor: metadata.recipient,
        downloadCount: metadata.downloadCount
      });

      console.log('[DEBUG] Returning file');
      // RFC5987形式のファイル名エンコーディング
      const encodedFileName = encodeURIComponent(metadata.fileName);
      
      return new Response(decryptedBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${metadata.fileName}"; filename*=UTF-8''${encodedFileName}`,
          'Content-Length': decryptedBuffer.length.toString(),
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    }

    // 未対応のメソッド
    console.log('[ERROR] Unsupported method:', request.method);
    return new Response(
      JSON.stringify({ error: 'サポートされていないメソッドです' }),
      { status: 405, headers }
    );

  } catch (error) {
    console.error('[ERROR] Unexpected error:', error.message);
    console.error('[ERROR] Stack:', error.stack);
    return new Response(
      JSON.stringify({ error: 'サーバーエラーが発生しました', details: error.message }),
      { status: 500, headers }
    );
  }
}