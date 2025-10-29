import kv from '@vercel/kv';
import { decryptFile, verifyOTP } from '../../lib/encryption.js';
import { saveAuditLog } from '../../lib/audit-log.js';

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***@***.***';
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

  // レスポンス送信済みフラグ
  let responded = false;
  
  const sendResponse = (status, body) => {
    if (responded) {
      console.log('[WARNING] Response already sent, ignoring');
      return;
    }
    responded = true;
    console.log('[DEBUG] Sending response:', status);
    return new Response(JSON.stringify(body), { status, headers });
  };

  try {
    let fileId = null;
    
    // GET の場合
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
        return sendResponse(400, { error: 'ファイルIDが指定されていません' });
      }

      console.log('[DEBUG] Fetching metadata for fileId:', fileId);
      const metadataJson = await kv.get('file:' + fileId + ':meta');
      
      if (!metadataJson) {
        console.log('[ERROR] Metadata not found for fileId:', fileId);
        return sendResponse(404, { error: 'ファイルが見つかりません' });
      }

      console.log('[DEBUG] Metadata found, parsing JSON');
      
      let metadata;
      try {
        metadata = typeof metadataJson === 'string' ? JSON.parse(metadataJson) : metadataJson;
        console.log('[DEBUG] Metadata parsed successfully');
      } catch (err) {
        console.log('[ERROR] Failed to parse metadata:', err.message);
        return sendResponse(500, { error: 'メタデータの解析に失敗しました' });
      }

      // 失効チェック
      if (metadata.revokedAt) {
        console.log('[ERROR] File revoked at:', metadata.revokedAt);
        return sendResponse(403, { error: 'このファイルは失効されています' });
      }

      console.log('[DEBUG] Building response');
      
      // レスポンスオブジェクトを構築
      const responseData = {
        success: true,
        maskedEmail: maskEmail(metadata.recipient || metadata.recipientEmail || ''),
        fileName: metadata.fileName || 'unknown',
        fileSize: metadata.fileSize || 0,
        downloadCount: metadata.downloadCount || 0,
        maxDownloads: metadata.maxDownloads || 3,
        uploadedAt: metadata.uploadedAt || '',
        expiresAt: metadata.expiresAt || ''
      };
      
      console.log('[DEBUG] Response data:', JSON.stringify(responseData));
      return sendResponse(200, responseData);
    }

    // POST の場合
    if (request.method === 'POST') {
      console.log('[DEBUG] POST handler');
      const body = await request.json();
      const { fileId: postFileId, otp } = body;

      if (!postFileId || !otp) {
        console.log('[ERROR] Missing fileId or otp in POST body');
        return sendResponse(400, { error: 'ファイルIDまたはOTPが指定されていません' });
      }

      console.log('[DEBUG] Fetching metadata for POST');
      const metadataJson = await kv.get('file:' + postFileId + ':meta');
      
      if (!metadataJson) {
        console.log('[ERROR] Metadata not found for POST');
        return sendResponse(404, { error: 'ファイルが見つかりません' });
      }

      const metadata = typeof metadataJson === 'string' ? JSON.parse(metadataJson) : metadataJson;

      // 失効チェック
      if (metadata.revokedAt) {
        console.log('[ERROR] File revoked (POST)');
        return sendResponse(403, { error: 'このファイルは失効されています' });
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

        return sendResponse(403, { error: 'ダウンロード回数の上限に達しました' });
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

        return sendResponse(401, { error: '認証コードが正しくありません' });
      }

      console.log('[DEBUG] OTP verified, fetching encrypted data');
      
      // 暗号化データ取得
      const encryptedDataJson = await kv.get('file:' + postFileId + ':data');
      
      if (!encryptedDataJson) {
        console.log('[ERROR] Encrypted data not found');
        return sendResponse(404, { error: '暗号化データが見つかりません' });
      }

      console.log('[DEBUG] Decrypting file');
      const encryptedDataObj = typeof encryptedDataJson === 'string' ? JSON.parse(encryptedDataJson) : encryptedDataJson;
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
    return sendResponse(405, { error: 'サポートされていないメソッドです' });

  } catch (error) {
    console.error('[ERROR] Unexpected error:', error.message);
    console.error('[ERROR] Stack:', error.stack);
    return sendResponse(500, { error: 'サーバーエラーが発生しました', details: error.message });
  }
}