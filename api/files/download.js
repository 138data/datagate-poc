/**
 * ファイルダウンロードAPI
 * 
 * GET /api/files/download?id={fileId}
 *   - ファイル情報取得（OTP不要）
 * 
 * POST /api/files/download/request-otp
 *   - メールアドレス確認 + OTP送信
 *   - Body: { fileId: string, email: string }
 * 
 * POST /api/files/download
 *   - OTP検証 + ファイルダウンロード + 開封通知送信
 *   - Body: { fileId: string, otp: string }
 */
import { kv } from '@vercel/kv';
import { decryptFile } from '../../lib/encryption.js';
import { saveAuditLog } from '../../lib/audit-log.js';
import { sendOTPEmail, sendDownloadNotificationEmail } from '../../lib/email-service.js';

/**
 * メールアドレスのマスク処理
 * 例: datagate@138io.com → d***@138io.com
 */
function maskEmail(email) {
  if (!email || !email.includes('@')) {
    return '***';
  }
  
  const [localPart, domain] = email.split('@');
  
  // ローカル部分の最初の1文字のみ表示
  const masked = localPart.length > 0 
    ? localPart[0] + '***'
    : '***';
  
  return `${masked}@${domain}`;
}

export default async function handler(request) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  };

  // CORSヘッダー
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...headers,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  // GET: ファイル情報取得
  if (request.method === 'GET') {
    const fileId = url.searchParams.get('id');

    if (!fileId) {
      return new Response(
        JSON.stringify({ success: false, message: 'ファイルIDが指定されていません' }),
        { status: 400, headers }
      );
    }

    try {
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
            message: 'このファイルは送信者により失効されました',
            revokedAt: metadata.revokedAt
          }),
          { status: 403, headers }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          fileName: metadata.fileName,
          fileSize: metadata.fileSize,
          uploadedAt: metadata.uploadedAt,
          expiresAt: metadata.expiresAt,
          downloadCount: metadata.downloadCount || 0,
          maxDownloads: metadata.maxDownloads || 3,
          maskedEmail: maskEmail(metadata.recipient)  // マスク表示追加
        }),
        { status: 200, headers }
      );
    } catch (error) {
      console.error('Error fetching file metadata:', error);
      return new Response(
        JSON.stringify({ success: false, message: 'サーバーエラーが発生しました' }),
        { status: 500, headers }
      );
    }
  }

  // POST: OTP送信またはダウンロード
  if (request.method === 'POST') {
    try {
      const body = await request.json();

      // POST /api/files/download/request-otp
      if (pathname.includes('/request-otp')) {
        const { fileId, email } = body;

        if (!fileId || !email) {
          return new Response(
            JSON.stringify({ success: false, message: 'fileId と email が必要です' }),
            { status: 400, headers }
          );
        }

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

        // メールアドレス確認（大文字小文字無視）
        if (email.toLowerCase() !== metadata.recipient.toLowerCase()) {
          return new Response(
            JSON.stringify({ success: false, message: 'メールアドレスが一致しません' }),
            { status: 403, headers }
          );
        }

        // OTP送信
        const result = await sendOTPEmail({
          to: metadata.recipient,
          fileId,
          fileName: metadata.fileName,
          otp: metadata.otp
        });

        if (result.success) {
          return new Response(
            JSON.stringify({ success: true, message: '認証コードを送信しました' }),
            { status: 200, headers }
          );
        } else {
          return new Response(
            JSON.stringify({ success: false, message: '認証コードの送信に失敗しました' }),
            { status: 500, headers }
          );
        }
      }

      // POST /api/files/download（OTP検証 + ダウンロード）
      const { fileId, otp } = body;

      if (!fileId || !otp) {
        return new Response(
          JSON.stringify({ success: false, message: 'fileId と otp が必要です' }),
          { status: 400, headers }
        );
      }

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
      if (metadata.otp !== otp) {
        // 監査ログ
        await saveAuditLog({
          event: 'download_failed',
          fileId,
          fileName: metadata.fileName,
          recipient: metadata.recipient,
          reason: 'invalid_otp',
          size: metadata.fileSize,
        });

        return new Response(
          JSON.stringify({ success: false, message: '認証コードが正しくありません' }),
          { status: 401, headers }
        );
      }

      // ダウンロード回数制限チェック
      const currentDownloadCount = metadata.downloadCount || 0;
      const maxDownloads = metadata.maxDownloads || 3;

      if (currentDownloadCount >= maxDownloads) {
        // 監査ログ
        await saveAuditLog({
          event: 'download_failed',
          fileId,
          fileName: metadata.fileName,
          recipient: metadata.recipient,
          reason: 'max_downloads_exceeded',
          size: metadata.fileSize,
        });

        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'ダウンロード回数の上限に達しました' 
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
      let decryptedBuffer;
      try {
        const encryptedBuffer = Buffer.from(encryptedDataObj.data, 'base64');
        decryptedBuffer = decryptFile(
          encryptedBuffer,
          encryptedDataObj.salt,
          encryptedDataObj.iv,
          encryptedDataObj.authTag
        );
      } catch (error) {
        console.error('Decryption failed:', error);
        return new Response(
          JSON.stringify({ success: false, message: '復号化に失敗しました' }),
          { status: 500, headers }
        );
      }

      // ダウンロード回数をインクリメント
      metadata.downloadCount = currentDownloadCount + 1;
      await kv.set(`file:${fileId}:meta`, JSON.stringify(metadata));

      // 監査ログ
      await saveAuditLog({
        event: 'download_success',
        fileId,
        fileName: metadata.fileName,
        recipient: metadata.recipient,
        size: metadata.fileSize,
        downloadCount: metadata.downloadCount,
      });

      // 開封通知メール送信（バックグラウンド）
      sendDownloadNotificationEmail({
        to: metadata.recipient,
        fileName: metadata.fileName,
        downloadedAt: new Date().toISOString(),
        downloadCount: metadata.downloadCount,
        maxDownloads: metadata.maxDownloads || 3,
        recipientDomain: metadata.recipient.split('@')[1] || metadata.recipient
      }).catch(err => {
        console.error('Failed to send opened notification:', err);
      });

      // ファイル名のエンコーディング（RFC 5987）
      const encodedFileName = encodeURIComponent(metadata.fileName)
        .replace(/'/g, '%27');

      // ファイルダウンロード
      return new Response(decryptedBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="file.txt"; filename*=UTF-8''${encodedFileName}`,
          'Content-Length': decryptedBuffer.length.toString(),
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      });
    } catch (error) {
      console.error('Error in download handler:', error);
      return new Response(
        JSON.stringify({ success: false, message: 'サーバーエラーが発生しました' }),
        { status: 500, headers }
      );
    }
  }

  // 未対応メソッド
  return new Response(
    JSON.stringify({ success: false, message: 'メソッドがサポートされていません' }),
    { status: 405, headers }
  );
}
