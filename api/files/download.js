import { kv } from '@vercel/kv';
import { decryptFile } from '../../lib/encryption.js';
import { sendOTPEmail, sendDownloadNotificationEmail } from '../../lib/email-service.js';
import { saveAuditLog } from '../../lib/audit-log.js';

/**
 * ダウンロードAPIエンドポイント
 * 
 * GET /api/files/download?id={fileId}
 *   - ファイル情報取得（OTPなしで取得可能）
 * 
 * POST /api/files/download/request-otp
 *   - メールアドレス確認 + OTP送信
 *   - Body: { fileId: string, email: string }
 * 
 * POST /api/files/download
 *   - OTP検証 + ファイルダウンロード + 開封通知送信
 *   - Body: { fileId: string, otp: string }
 */
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

      return new Response(
        JSON.stringify({
          success: true,
          fileName: metadata.fileName,
          fileSize: metadata.fileSize,
          uploadedAt: metadata.uploadedAt,
          expiresAt: metadata.expiresAt,
          downloadCount: metadata.downloadCount || 0,
          maxDownloads: metadata.maxDownloads || 3,
        }),
        { status: 200, headers }
      );
    } catch (error) {
      console.error('Get file info error:', error);
      return new Response(
        JSON.stringify({ success: false, message: 'ファイル情報の取得に失敗しました' }),
        { status: 500, headers }
      );
    }
  }

  // POST: OTP送信リクエスト or ダウンロード
  if (request.method === 'POST') {
    try {
      const body = await request.json();

      // OTP送信リクエスト（/api/files/download/request-otp）
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

        // メールアドレス確認
        const recipientEmail = (metadata.recipient || '').toLowerCase();
        const inputEmail = email.toLowerCase();

        if (recipientEmail !== inputEmail) {
          // 監査ログ: メールアドレス不一致
          await saveAuditLog({
            event: 'email_mismatch',
            fileId,
            actor: inputEmail,
            to: recipientEmail,
            status: 'rejected',
          });

          return new Response(
            JSON.stringify({ success: false, message: 'メールアドレスが一致しません' }),
            { status: 403, headers }
          );
        }

        // OTPをメール送信
        const otpResult = await sendOTPEmail({
          to: recipientEmail,
          fileName: metadata.fileName,
          otp: metadata.otp,
        });

        if (!otpResult.success) {
          return new Response(
            JSON.stringify({ success: false, message: 'OTPの送信に失敗しました' }),
            { status: 500, headers }
          );
        }

        // 監査ログ: OTP送信成功
        await saveAuditLog({
          event: 'otp_sent',
          fileId,
          actor: recipientEmail,
          to: recipientEmail,
          status: 'success',
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: 'OTPをメールで送信しました',
          }),
          { status: 200, headers }
        );
      }

      // ダウンロードリクエスト（/api/files/download）
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

      // OTP検証
      if (metadata.otp !== otp) {
        // 監査ログ: OTP不一致
        await saveAuditLog({
          event: 'download_failed',
          fileId,
          actor: 'unknown',
          to: metadata.recipient,
          status: 'invalid_otp',
        });

        return new Response(
          JSON.stringify({ success: false, message: 'OTPが正しくありません' }),
          { status: 401, headers }
        );
      }

      // ダウンロード回数チェック
      const downloadCount = metadata.downloadCount || 0;
      const maxDownloads = metadata.maxDownloads || 3;

      if (downloadCount >= maxDownloads) {
        // 監査ログ: 回数制限超過
        await saveAuditLog({
          event: 'download_failed',
          fileId,
          actor: metadata.recipient,
          to: metadata.recipient,
          status: 'max_downloads_exceeded',
        });

        return new Response(
          JSON.stringify({ success: false, message: 'ダウンロード回数の上限に達しました' }),
          { status: 403, headers }
        );
      }

      // 有効期限チェック
      const expiresAt = new Date(metadata.expiresAt);
      const now = new Date();

      if (expiresAt < now) {
        // 監査ログ: 期限切れ
        await saveAuditLog({
          event: 'download_failed',
          fileId,
          actor: metadata.recipient,
          to: metadata.recipient,
          status: 'expired',
        });

        return new Response(
          JSON.stringify({ success: false, message: 'ファイルの有効期限が切れています' }),
          { status: 410, headers }
        );
      }

      // 暗号化データ取得
      const encryptedDataJson = await kv.get(`file:${fileId}:data`);

      if (!encryptedDataJson) {
        return new Response(
          JSON.stringify({ success: false, message: 'ファイルデータが見つかりません' }),
          { status: 404, headers }
        );
      }

      const encryptedDataObj = typeof encryptedDataJson === 'string' ? JSON.parse(encryptedDataJson) : encryptedDataJson;

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
      } catch (decryptError) {
        console.error('Decryption error:', decryptError);
        return new Response(
          JSON.stringify({ success: false, message: 'ファイルの復号化に失敗しました' }),
          { status: 500, headers }
        );
      }

      // ダウンロード回数を更新
      metadata.downloadCount = downloadCount + 1;
      const ttlSeconds = Math.floor((expiresAt - now) / 1000);
      await kv.set(`file:${fileId}:meta`, JSON.stringify(metadata), { ex: ttlSeconds });

      // 【開封通知機能】
      try {
        const notifyConfig = await kv.get('config:notify').catch(() => null);
        const notifyEnabled = notifyConfig?.enabled === true;
        const isFirstOnly = (notifyConfig?.mode || 'first') === 'first';
        const notifyTo = metadata.senderNotifyEmail || notifyConfig?.fallbackEmail;

        if (notifyEnabled && notifyTo) {
          const alreadyNotified = !!metadata.firstDownloadNotifiedAt;

          // 初回のみ or 毎回通知
          if (!isFirstOnly || !alreadyNotified) {
            // 受信者ドメインを抽出
            const recipientDomain = metadata.recipient.split('@')[1] || 'unknown';

            // 日本時間でフォーマット（JST = UTC+9）
            const downloadedAtUTC = new Date();
            const downloadedAtJST = new Date(downloadedAtUTC.getTime() + 9 * 60 * 60 * 1000);
            const formattedDate = downloadedAtJST.toISOString().replace('T', ' ').substring(0, 19) + ' (JST)';

            // 開封通知メール送信
            await sendDownloadNotificationEmail({
              to: notifyTo,
              fileName: metadata.fileName,
              downloadedAt: formattedDate,
              downloadCount: metadata.downloadCount,
              maxDownloads: metadata.maxDownloads,
              recipientDomain: `@${recipientDomain}`,
            });

            // メタデータ更新
            if (!metadata.firstDownloadNotifiedAt) {
              metadata.firstDownloadNotifiedAt = downloadedAtUTC.toISOString();
            }
            metadata.notifyCount = (metadata.notifyCount || 0) + 1;
            await kv.set(`file:${fileId}:meta`, JSON.stringify(metadata), { ex: ttlSeconds });

            // 監査ログ: 開封通知送信
            await saveAuditLog({
              event: 'open_notified',
              fileId,
              actor: metadata.recipient,
              to: notifyTo,
              status: 'success',
            });
          }
        }
      } catch (notifyError) {
        // 開封通知の失敗はダウンロードを阻害しない（ベストエフォート）
        console.error('Download notification error:', notifyError);
      }

      // 監査ログ: ダウンロード成功
      await saveAuditLog({
        event: 'download',
        fileId,
        actor: metadata.recipient,
        to: metadata.recipient,
        size: metadata.fileSize,
        status: 'success',
      });

      // ファイルを返す
      const fileName = metadata.fileName;
      const encodedFileName = encodeURIComponent(fileName);
      const disposition = `attachment; filename="${fileName}"; filename*=UTF-8''${encodedFileName}`;

      return new Response(decryptedBuffer, {
        status: 200,
        headers: {
          'Content-Type': metadata.mimeType || 'application/octet-stream',
          'Content-Disposition': disposition,
          'Content-Length': decryptedBuffer.length.toString(),
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      });

    } catch (error) {
      console.error('Download error:', error);
      return new Response(
        JSON.stringify({ success: false, message: 'ダウンロード処理中にエラーが発生しました' }),
        { status: 500, headers }
      );
    }
  }

  // その他のメソッドは拒否
  return new Response(
    JSON.stringify({ success: false, message: 'Method not allowed' }),
    { status: 405, headers }
  );
}
