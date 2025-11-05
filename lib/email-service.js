const sgMail = require('@sendgrid/mail');

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'sendgrid.net@138data.com';
const BASE_URL = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : 'http://localhost:3000';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

/**
 * OTP付きダウンロードリンクメール送信（Phase 34標準）
 */
async function sendDownloadLinkEmailWithOTP({ to, fileId, fileName, otp }) {
  if (!SENDGRID_API_KEY) {
    console.error('SendGrid API key not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const downloadUrl = `${BASE_URL}/download.html?fileId=${fileId}`;

  const msg = {
    to,
    from: FROM_EMAIL,
    subject: `ファイルが届きました: ${fileName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">📁 ファイルが届きました</h2>
        <p>ファイルのダウンロードリンクをお送りします。</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>ファイル名:</strong> ${fileName}</p>
          <p style="margin: 5px 0;"><strong>ダウンロードリンク:</strong> <a href="${downloadUrl}">${downloadUrl}</a></p>
          <p style="margin: 5px 0; font-size: 18px; color: #0066cc;"><strong>OTP: ${otp}</strong></p>
        </div>

        <p style="font-size: 14px; color: #666;">
          ※このファイルは7日間保存され、最大3回までダウンロード可能です。
        </p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="font-size: 12px; color: #999;">
          このメールは自動送信されています。<br>
          138DataGate - セキュアファイル転送サービス
        </p>
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    console.log(`Email sent successfully to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('Email sending failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * ファイル添付メール送信
 */
async function sendWithAttachment({ to, fileName, fileBuffer }) {
  if (!SENDGRID_API_KEY) {
    console.error('SendGrid API key not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const msg = {
    to,
    from: FROM_EMAIL,
    subject: `ファイルが届きました: ${fileName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">📁 ファイルが届きました</h2>
        <p>添付ファイルをご確認ください。</p>
        <p style="font-size: 14px; color: #666;">ファイル名: <strong>${fileName}</strong></p>
      </div>
    `,
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
    await sgMail.send(msg);
    console.log(`Email with attachment sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('Email sending failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * メイン送信関数
 */
async function sendEmail({ to, fileId, fileName, otp, shouldAttach = false, fileBuffer = null }) {
  if (!SENDGRID_API_KEY) {
    console.log('Email sending is disabled (no API key)');
    return { sent: false, reason: 'no_api_key' };
  }

  const ENABLE_DIRECT_ATTACH = process.env.ENABLE_DIRECT_ATTACH === 'true';
  const isAttachAllowed = ENABLE_DIRECT_ATTACH && shouldAttach;

  try {
    if (isAttachAllowed && fileBuffer) {
      // 添付直送モード
      const result = await sendWithAttachment({ to, fileName, fileBuffer });
      return { sent: true, success: result.success, mode: 'attach', reason: null };
    } else {
      // OTP付きリンクモード（Phase 34標準）
      const result = await sendDownloadLinkEmailWithOTP({ to, fileId, fileName, otp });
      return { sent: true, success: result.success, mode: 'link', reason: null };
    }
  } catch (error) {
    console.error('Email service error:', error);
    return { sent: false, reason: 'send_failed', error: error.message };
  }
}

module.exports = {
  sendEmail,
  sendDownloadLinkEmailWithOTP,
  sendWithAttachment
};