import { kv } from '@vercel/kv';
import { decryptFile, verifyOTP } from '../../lib/encryption.js';
import { sendDownloadNotificationEmail } from '../../lib/email-service.js';
import { saveAuditLog } from '../../lib/audit-log.js';

/**
 * メールアドレスをマスク表示
 * 例: "user@example.com" → "u***@example.com"
 */
function maskEmail(email) {
  if (!email || !email.includes('@')) {
    return '***';
  }
  const [localPart, domain] = email.split('@');
  const masked = localPart.length > 0
    ? localPart[0] + '***'
    : '***';
  return `${masked}@${domain}`;
}

/**
 * ファイルダウンロードAPI
 * 
 * GET  /api/files/download?id={fileId} - ファイル情報取得
 * POST /api/files/download - OTP検証 + ファイルダウンロード
 */
export default async function handler(request) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  };

  // CORS対応
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

  console.log('[DEBUG] Request method:', request.method);
  console.log('[DEBUG] Request URL:', request.url);

  try {
    const url = new URL(request.url, `https://${request.headers.host || request.headers["host"] || "localhost"}`);
    const pathname = url.pathname;
    
    console.log('[DEBUG] Parsed URL pathname:', pathname);
    console.log('[DEBUG] Parsed URL search params:', url.search);

    // GET: ファイル情報取得
    if (request.method === 'GET') {
      console.log('[DEBUG] Entering GET handler');
      
      const fileId = url.searchParams.get('id');
      console.log('[DEBUG] fileId from query:', fileId);
      
      if (!fileId) {
        console.log('[DEBUG] fileId is missing');
        return new Response(
          JSON.stringify({ success: false, message: 'ファイルIDが指定されていません' }),
          { status: 400, headers }
        );
      }

      try {
        console.log('[DEBUG] Fetching metadata from KV...');
        const metadataJson = await kv.get(`file:${fileId}:meta`);
        console.log('[DEBUG] metadataJson type:', typeof metadataJson);
        console.log('[DEBUG] metadataJson:', metadataJson ? 'exists' : 'null');
        
        if (!metadataJson) {
          console.log('[DEBUG] Metadata not found in KV');
          return new Response(
            JSON.stringify({ success: false, message: 'ファイルが見つかりません' }),
            { status: 404, headers }
          );
        }

        const metadata = typeof metadataJson === 'string' ? JSON.parse(metadataJson) : metadataJson;
        console.log('[DEBUG] Metadata parsed successfully');
        console.log('[DEBUG] metadata.recipient:', metadata.recipient);

        // 失効チェック
        if (metadata.revokedAt) {
          console.log('[DEBUG] File is revoked');
          return new Response(
            JSON.stringify({
              success: false,
              message: 'このファイルは送信者により失効されました',
              revokedAt: metadata.revokedAt
            }),
            { status: 403, headers }
          );
        }

        console.log('[DEBUG] Creating masked email...');
        const maskedEmail = maskEmail(metadata.recipient);
        console.log('[DEBUG] maskedEmail:', maskedEmail);

        const responseData = {
          success: true,
          fileName: metadata.fileName,
          fileSize: metadata.fileSize,
          uploadedAt: metadata.uploadedAt,
          expiresAt: metadata.expiresAt,
          downloadCount: metadata.downloadCount || 0,
          maxDownloads: metadata.maxDownloads || 3,
          maskedEmail: maskedEmail
        };

        console.log('[DEBUG] Returning response:', JSON.stringify(responseData));

        return new Response(
          JSON.stringify(responseData),
          { status: 200, headers }
        );
      } catch (error) {
        console.error('[DEBUG] Error in GET handler:', error);
        console.error('[DEBUG] Error stack:', error.stack);
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'サーバーエラーが発生しました',
            debug: error.message 
          }),
          { status: 500, headers }
        );
      }
    }

    // POST: OTP検証 + ファイルダウンロード
    if (request.method === 'POST') {
      console.log('[DEBUG] Entering POST handler');
      
      const body = await request.json();
      const { fileId, otp } = body;

      console.log('[DEBUG] POST body:', { fileId, otp: otp ? '***' : undefined });

      if (!fileId || !otp) {
        return new Response(
          JSON.stringify({ success: false, message: 'ファイルIDまたはOTPが指定されていません' }),
          { status: 400, headers }
        );
      }

      try {
        // メタデータ取得
        const metadataJson = await kv.get(`file:${fileId}:meta`);
        if (!metadataJson) {
          return new Response(
            JSON.stringify({ success: false, message: 'ファイルが見つかりません' }),
            { status: 404, headers }
          );
        }

        const metadata = typeof metadataJson === 'string' ? JSON.parse(metadataJson) : metadataJson;

        // 失効チェック
        if (metadata.revokedAt) {
          return new Response(
            JSON.stringify({
              success: false,
              message: 'このファイルは送信者により失効されました'
            }),
            { status: 403, headers }
          );
        }

        // OTP検証
        if (!verifyOTP(otp, metadata.otp)) {
          return new Response(
            JSON.stringify({ success: false, message: 'OTPが正しくありません' }),
            { status: 401, headers }
          );
        }

        // ダウンロード回数チェック
        const currentDownloadCount = metadata.downloadCount || 0;
        const maxDownloads = metadata.maxDownloads || 3;

        if (currentDownloadCount >= maxDownloads) {
          return new Response(
            JSON.stringify({
              success: false,
              message: `ダウンロード回数の上限（${maxDownloads}回）に達しました`
            }),
            { status: 403, headers }
          );
        }

        // 暗号化データ取得
        const encryptedDataJson = await kv.get(`file:${fileId}:data`);
        if (!encryptedDataJson) {
          return new Response(
            JSON.stringify({ success: false, message: '暗号化データが見つかりません' }),
            { status: 404, headers }
          );
        }

        const encryptedDataObj = typeof encryptedDataJson === 'string' 
          ? JSON.parse(encryptedDataJson) 
          : encryptedDataJson;

        // 復号化
        const encryptedBuffer = Buffer.from(encryptedDataObj.data, 'base64');
        const decryptedBuffer = decryptFile(
          encryptedBuffer,
          encryptedDataObj.salt,
          encryptedDataObj.iv,
          encryptedDataObj.authTag
        );

        // ダウンロード回数をインクリメント
        metadata.downloadCount = currentDownloadCount + 1;
        await kv.set(`file:${fileId}:meta`, JSON.stringify(metadata));

        // 監査ログ保存
        await saveAuditLog({
          event: 'file_downloaded',
          fileId,
          fileName: metadata.fileName,
          recipient: metadata.recipient,
          downloadCount: metadata.downloadCount
        });

        // 開封通知メール送信（初回ダウンロード時のみ）
        if (currentDownloadCount === 0) {
          try {
            const host = request.headers.host || request.headers["host"] || "localhost";
            const protocol = host.includes('localhost') ? 'http' : 'https';
            const manageUrl = `${protocol}://${host}/manage.html?id=${fileId}&token=${metadata.manageToken}`;

            await sendDownloadNotificationEmail({
              to: metadata.uploadedBy || metadata.recipient,
              fileName: metadata.fileName,
              downloadedBy: metadata.recipient,
              downloadedAt: new Date().toISOString(),
              manageUrl
            });
          } catch (emailError) {
            console.error('開封通知メール送信エラー:', emailError);
          }
        }

        // ファイル名のエンコーディング（RFC5987形式）
        const encodedFileName = encodeURIComponent(metadata.fileName);

        return new Response(decryptedBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${metadata.fileName}"; filename*=UTF-8''${encodedFileName}`,
            'Cache-Control': 'no-store, no-cache, must-revalidate'
          }
        });
      } catch (error) {
        console.error('[DEBUG] Error in POST handler:', error);
        return new Response(
          JSON.stringify({ success: false, message: 'ダウンロード処理中にエラーが発生しました' }),
          { status: 500, headers }
        );
      }
    }

    // その他のメソッドは405
    return new Response(
      JSON.stringify({ success: false, message: 'メソッドが許可されていません' }),
      { status: 405, headers }
    );
  } catch (error) {
    console.error('[DEBUG] Outer error:', error);
    console.error('[DEBUG] Outer error stack:', error.stack);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'サーバーエラーが発生しました',
        debug: error.message 
      }),
      { status: 500, headers }
    );
  }
}
