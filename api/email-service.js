import sgMail from '@sendgrid/mail';
import { getEnvironmentConfig } from './environment.js';

/**
 * SendGrid経由でダウンロードリンクを含むメールを送信
 * @param {Object} params - パラメータオブジェクト
 * @param {string} params.to - 送信先メールアドレス
 * @param {string} params.downloadUrl - ダウンロードページURL
 * @param {string} params.otp - ワンタイムパスワード
 * @param {string} params.expiresAt - 有効期限（ISO 8601形式）
 * @returns {Promise<Object>} 送信結果 { success: boolean, statusCode: number, messageId: string, error?: string }
 */
export async function sendDownloadLinkEmail({ to, downloadUrl, otp, expiresAt }) {
  const envConfig = getEnvironmentConfig();

  // 🔍 デバッグログ追加
  console.log('[email-service] sendDownloadLinkEmail called with:', {
    to,
    downloadUrl: downloadUrl ? 'present' : 'missing',
    otp: otp ? 'present' : 'missing',
    expiresAt,
    envConfig: {
      enableEmailSending: envConfig.enableEmailSending,
      sendgridApiKey: envConfig.sendgridApiKey ? 'present' : 'missing',
      sendgridFromEmail: envConfig.sendgridFromEmail,
      sendgridFromName: envConfig.sendgridFromName
    }
  });

  // メール送信が無効な場合
  if (!envConfig.enableEmailSending) {
    console.log('[email-service] Email sending is disabled');
    return {
      success: false,
      error: 'Email sending is disabled in environment configuration'
    };
  }

  // SendGrid設定の検証
  if (!envConfig.sendgridApiKey) {
    console.error('[email-service] SENDGRID_API_KEY is not configured');
    return {
      success: false,
      error: 'SENDGRID_API_KEY is not configured'
    };
  }

  if (!envConfig.sendgridFromEmail) {
    console.error('[email-service] SENDGRID_FROM_EMAIL is not configured');
    return {
      success: false,
      error: 'SENDGRID_FROM_EMAIL is not configured'
    };
  }

  try {
    // SendGrid APIキー設定
    sgMail.setApiKey(envConfig.sendgridApiKey);

    // 有効期限のフォーマット
    const expiresDate = new Date(expiresAt);
    const formattedExpires = expiresDate.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo'
    });

    // メール本文
    const emailBody = `
ファイルのダウンロードリンクをお送りします。

ダウンロードURL:
${downloadUrl}

ワンタイムパスワード: ${otp}

有効期限: ${formattedExpires}（日本時間）

※ このリンクは最大3回までダウンロード可能です。
※ 有効期限を過ぎるとダウンロードできなくなります。

---
138DataGate - セキュアファイル転送サービス
    `.trim();

    // メールメッセージ構築
    const msg = {
      to: to,
      from: {
        email: envConfig.sendgridFromEmail,
        name: envConfig.sendgridFromName || '138DataGate'
      },
      subject: '【138DataGate】ファイルのダウンロードリンク',
      text: emailBody,
      html: emailBody.replace(/\n/g, '<br>')
    };

    console.log('[email-service] Attempting to send email via SendGrid');

    // SendGrid経由でメール送信
    const [response] = await sgMail.send(msg);

    console.log('[email-service] SendGrid response:', {
      statusCode: response.statusCode,
      headers: response.headers
    });

    return {
      success: true,
      statusCode: response.statusCode,
      messageId: response.headers['x-message-id'] || null
    };

  } catch (error) {
    console.error('[email-service] SendGrid error:', {
      message: error.message,
      code: error.code,
      response: error.response ? {
        statusCode: error.response.statusCode,
        body: error.response.body
      } : 'no response'
    });

    return {
      success: false,
      error: error.message || 'Unknown error',
      statusCode: error.code || null,
      details: error.response ? error.response.body : null
    };
  }
}