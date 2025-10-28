// lib/email-service.js - ESM版メール送信サービス
// エラー時も例外を投げず、結果オブジェクトを返す設計

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sgMail = require('@sendgrid/mail');

// SendGrid API Key設定
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@138data.com';
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || '138DataGate';
const ENABLE_EMAIL_SENDING = process.env.ENABLE_EMAIL_SENDING === 'true';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

/**
 * ダウンロードリンク付きメール送信
 * @param {Object} params
 * @param {string} params.to - 送信先メールアドレス
 * @param {string} params.fileId - ファイルID
 * @param {string} params.fileName - ファイル名
 * @param {string} params.otp - OTP（6桁数値）
 * @returns {Promise<Object>} - { success: boolean, error?: string }
 */
export async function sendDownloadLinkEmail({ to, fileId, fileName, otp }) {
  // 環境変数チェック
  if (!ENABLE_EMAIL_SENDING) {
    console.log('[Email] Email sending is disabled (ENABLE_EMAIL_SENDING=false)');
    return { success: false, error: 'Email sending is disabled' };
  }

  if (!SENDGRID_API_KEY) {
    console.error('[Email] SENDGRID_API_KEY is not set');
    return { success: false, error: 'SendGrid API key is not configured' };
  }

  if (!to) {
    console.error('[Email] Recipient email is missing');
    return { success: false, error: 'Recipient email is required' };
  }

  // ダウンロードURL生成
  const downloadUrl = `${process.env.VERCEL_URL || 'https://datagate-poc.vercel.app'}/download?id=${fileId}`;

  const msg = {
    to,
    from: {
      email: SENDGRID_FROM_EMAIL,
      name: SENDGRID_FROM_NAME
    },
    subject: `ファイルをお送りします: ${fileName}`,
    text: `
ファイル「${fileName}」をお送りします。

以下のリンクからダウンロードしてください:
${downloadUrl}

ダウンロード時に以下のOTPコードが必要です:
${otp}

※ このリンクは7日間有効で、最大3回までダウンロード可能です。
※ このメールに心当たりがない場合は、破棄してください。

---
138DataGate - セキュアファイル転送サービス
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .otp { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 4px; margin: 20px 0; text-align: center; }
    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0;">ファイルをお送りします</h1>
    </div>
    <div class="content">
      <p>ファイル「<strong>${fileName}</strong>」をお送りします。</p>
      <p>以下のボタンからダウンロードしてください:</p>
      <div style="text-align: center;">
        <a href="${downloadUrl}" class="button">ファイルをダウンロード</a>
      </div>
      <p>ダウンロード時に以下のOTPコードが必要です:</p>
      <div class="otp">${otp}</div>
      <div class="footer">
        <p>※ このリンクは7日間有効で、最大3回までダウンロード可能です。</p>
        <p>※ このメールに心当たりがない場合は、破棄してください。</p>
        <p style="margin-top: 20px;">138DataGate - セキュアファイル転送サービス</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim()
  };

  try {
    console.log('[Email] Sending download link email to:', to);
    await sgMail.send(msg);
    console.log('[Email] Download link email sent successfully');
    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send download link email:', error.message);
    if (error.response) {
      console.error('[Email] SendGrid response:', error.response.body);
    }
    return { success: false, error: error.message };
  }
}

/**
 * ファイル添付直送メール送信
 * @param {Object} params
 * @param {string} params.to - 送信先メールアドレス
 * @param {string} params.fileName - ファイル名
 * @param {Buffer} params.fileBuffer - ファイルバッファ
 * @returns {Promise<Object>} - { success: boolean, error?: string }
 */
export async function sendFileAsAttachment({ to, fileName, fileBuffer }) {
  // 環境変数チェック
  if (!ENABLE_EMAIL_SENDING) {
    console.log('[Email] Email sending is disabled (ENABLE_EMAIL_SENDING=false)');
    return { success: false, error: 'Email sending is disabled' };
  }

  if (!SENDGRID_API_KEY) {
    console.error('[Email] SENDGRID_API_KEY is not set');
    return { success: false, error: 'SendGrid API key is not configured' };
  }

  if (!to) {
    console.error('[Email] Recipient email is missing');
    return { success: false, error: 'Recipient email is required' };
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    console.error('[Email] File buffer is empty');
    return { success: false, error: 'File buffer is required' };
  }

  const msg = {
    to,
    from: {
      email: SENDGRID_FROM_EMAIL,
      name: SENDGRID_FROM_NAME
    },
    subject: `ファイルをお送りします: ${fileName}`,
    text: `
ファイル「${fileName}」を添付でお送りします。

※ このメールに心当たりがない場合は、破棄してください。

---
138DataGate - セキュアファイル転送サービス
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0;">ファイルをお送りします</h1>
    </div>
    <div class="content">
      <p>ファイル「<strong>${fileName}</strong>」を添付でお送りします。</p>
      <div class="footer">
        <p>※ このメールに心当たりがない場合は、破棄してください。</p>
        <p style="margin-top: 20px;">138DataGate - セキュアファイル転送サービス</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim(),
    attachments: [
      {
        content: fileBuffer.toString('base64'),
        filename: fileName,
        type: 'application/octet-stream',
        disposition: 'attachment'
      }
    ]
  };

  try {
    console.log('[Email] Sending file as attachment to:', to, 'Size:', fileBuffer.length);
    await sgMail.send(msg);
    console.log('[Email] File attachment email sent successfully');
    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send file attachment email:', error.message);
    if (error.response) {
      console.error('[Email] SendGrid response:', error.response.body);
    }
    return { success: false, error: error.message };
  }
}

/**
 * 統合メール送信関数
 * @param {Object} params
 * @param {string} params.to - 送信先メールアドレス
 * @param {string} params.fileId - ファイルID
 * @param {string} params.fileName - ファイル名
 * @param {string} params.otp - OTP（6桁数値）
 * @param {boolean} params.shouldAttach - 添付直送フラグ
 * @param {Buffer} params.fileBuffer - ファイルバッファ（添付直送時のみ）
 * @returns {Promise<Object>} - { sent: boolean, success: boolean, mode: string, reason?: string }
 */
export async function sendEmail({ to, fileId, fileName, otp, shouldAttach = false, fileBuffer = null }) {
  // 環境変数チェック
  if (!ENABLE_EMAIL_SENDING) {
    console.log('[Email] Email sending is disabled (ENABLE_EMAIL_SENDING=false)');
    return {
      sent: false,
      success: false,
      mode: shouldAttach ? 'attach' : 'link',
      reason: 'email_disabled'
    };
  }

  if (!SENDGRID_API_KEY) {
    console.error('[Email] SENDGRID_API_KEY is not set');
    return {
      sent: false,
      success: false,
      mode: shouldAttach ? 'attach' : 'link',
      reason: 'missing_api_key'
    };
  }

  if (!to) {
    console.error('[Email] Recipient email is missing');
    return {
      sent: false,
      success: false,
      mode: shouldAttach ? 'attach' : 'link',
      reason: 'invalid_recipient'
    };
  }

  // 添付直送の場合
  if (shouldAttach && fileBuffer) {
    console.log('[Email] Sending file as attachment to:', to);
    const result = await sendFileAsAttachment({ to, fileName, fileBuffer });
    return {
      sent: true,
      success: result.success,
      mode: 'attach',
      reason: result.success ? null : 'send_failed',
      error: result.error
    };
  }
  // リンク送付の場合
  else {
    console.log('[Email] Sending download link to:', to);
    const result = await sendDownloadLinkEmail({ to, fileId, fileName, otp });
    return {
      sent: true,
      success: result.success,
      mode: 'link',
      reason: result.success ? null : 'send_failed',
      error: result.error
    };
  }
}
