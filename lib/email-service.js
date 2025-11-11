// lib/email-service.js（完全版 - Phase 58c - Amazon SES統合）
import * as nodemailer from 'nodemailer';
// Phase 62: Try namespace import - 2025-11-11 11:08:20
// ===========================
// 環境変数 (Phase 62 - Force rebuild)
// ===========================
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'sendgrid';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM = process.env.SENDGRID_FROM_EMAIL || 'noreply@datagate-poc.vercel.app';
const SES_SMTP_HOST = process.env.SES_SMTP_HOST;
const SES_SMTP_PORT = parseInt(process.env.SES_SMTP_PORT || '587');
const SES_SMTP_USER = process.env.SES_SMTP_USER;
const SES_SMTP_PASS = process.env.SES_SMTP_PASS;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || 'datagate@138io.com';
const VPS_SMTP_HOST = '162.43.28.209';
const VPS_SMTP_PORT = 587;
const VPS_SMTP_USER = 'datagate@138io.com';
const VPS_SMTP_PASS = process.env.VPS_SMTP_PASS;
// ===========================
// トランスポーター作成関数
// ===========================
function createSendGridTransporter() {
  if (!SENDGRID_API_KEY) {
    throw new Error('SENDGRID_API_KEY is not set');
  }
  return nodemailer.createTransporter({
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: {
      user: 'apikey',
      pass: SENDGRID_API_KEY
    }
  });
}
function createSESTransporter() {
  if (!SES_SMTP_HOST || !SES_SMTP_USER || !SES_SMTP_PASS) {
    throw new Error('SES SMTP credentials are not set');
  }
  return nodemailer.createTransporter({
    host: SES_SMTP_HOST,
    port: SES_SMTP_PORT,
    secure: false,
    auth: {
      user: SES_SMTP_USER,
      pass: SES_SMTP_PASS
    }
  });
}
function createVPSTransporter() {
  if (!VPS_SMTP_PASS) {
    throw new Error('VPS_SMTP_PASS is not set');
  }
  return nodemailer.createTransporter({
    host: VPS_SMTP_HOST,
    port: VPS_SMTP_PORT,
    secure: false,
    auth: {
      user: VPS_SMTP_USER,
      pass: VPS_SMTP_PASS
    }
  });
}
// ===========================
// メール送信関数
// ===========================
export async function sendEmail({ to, subject, html, text }) {
  const providers = [EMAIL_PROVIDER, 'sendgrid', 'vps'];
  const uniqueProviders = [...new Set(providers)];
  let lastError = null;
  for (const provider of uniqueProviders) {
    try {
      console.log(`[EMAIL] Attempting to send email via ${provider}...`);
     
      let transporter;
      let from;
     
      if (provider === 'ses') {
        transporter = createSESTransporter();
        from = SES_FROM_EMAIL;
      } else if (provider === 'vps') {
        transporter = createVPSTransporter();
        from = VPS_SMTP_USER;
      } else {
        transporter = createSendGridTransporter();
        from = SENDGRID_FROM;
      }
      const info = await transporter.sendMail({
        from,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, '')
      });
      console.log(`[EMAIL] ✅ Email sent successfully via ${provider}:`, info.messageId);
      return {
        success: true,
        messageId: info.messageId,
        provider
      };
    } catch (error) {
      console.error(`[EMAIL] ❌ Failed to send email via ${provider}:`, error.message);
      lastError = error;
      continue;
    }
  }
  throw new Error(`All email providers failed. Last error: ${lastError?.message}`);
}
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
export async function sendOTPEmail(to, otp, downloadUrl, fileInfo) {
  const subject = '【DataGate】ファイル受信通知';
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🔐 DataGate</h1>
    <p style="color: white; margin: 10px 0 0 0; font-size: 14px;">安全なファイル受け渡しシステム</p>
  </div>
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <h2 style="color: #667eea; margin-top: 0;">ファイルが届いています</h2>
    <p>ファイルをダウンロードするための情報をお送りします。</p>
    <div style="background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 5px 0;"><strong>ファイル名:</strong> ${fileInfo.fileName}</p>
      <p style="margin: 5px 0;"><strong>ファイルサイズ:</strong> ${formatFileSize(fileInfo.fileSize)}</p>
      <p style="margin: 5px 0;"><strong>有効期限:</strong> ${new Date(fileInfo.expiresAt).toLocaleString('ja-JP')}</p>
    </div>
    <h3 style="color: #667eea;">ダウンロード方法</h3>
    <ol style="background: #f0f0ff; padding: 20px 20px 20px 40px; border-radius: 8px; margin: 20px 0;">
      <li style="margin-bottom: 10px;">下記のリンクをクリック</li>
      <li style="margin-bottom: 10px;">ワンタイムパスワード（OTP）を入力</li>
      <li>ファイルをダウンロード</li>
    </ol>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${downloadUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">📥 ダウンロードページを開く</a>
    </div>
    <div style="background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
      <div style="font-size: 14px; color: #666; margin-bottom: 10px;">ワンタイムパスワード（OTP）</div>
      <div style="font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</div>
    </div>
    <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 14px; color: #856404;"><strong>⚠️ 重要:</strong> この OTP は一度のみ有効です。第三者に教えないでください。</p>
    </div>
    <div style="background: #e7f3ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 13px; color: #004085;">
        <strong>📌 注意事項</strong><br>
        • ダウンロードは3回まで可能です<br>
        • ${Math.floor((new Date(fileInfo.expiresAt) - new Date()) / (1000 * 60 * 60 * 24))}日後に自動削除されます<br>
        • パスワードの入力回数制限があります
      </p>
    </div>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    <p style="font-size: 12px; color: #999; text-align: center;">
      このメールは DataGate から自動送信されています。<br>
      心当たりがない場合は、このメールを無視してください。
    </p>
  </div>
</body>
</html>
  `;
  return sendEmail({ to, subject, html });
}
export async function sendDownloadNotificationEmail(to, fileName, downloaderEmail) {
  const subject = '【DataGate】ファイルがダウンロードされました';
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">📥 DataGate</h1>
    <p style="color: white; margin: 10px 0 0 0; font-size: 14px;">ダウンロード通知</p>
  </div>
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <h2 style="color: #667eea; margin-top: 0;">ファイルがダウンロードされました</h2>
    <p>送信したファイルがダウンロードされました。</p>
    <div style="background: white; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 5px 0;"><strong>ファイル名:</strong> ${fileName}</p>
      <p style="margin: 5px 0;"><strong>ダウンロード者:</strong> ${downloaderEmail}</p>
      <p style="margin: 5px 0;"><strong>日時:</strong> ${new Date().toLocaleString('ja-JP')}</p>
    </div>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    <p style="font-size: 12px; color: #999; text-align: center;">このメールは DataGate から自動送信されています。</p>
  </div>
</body>
</html>
  `;
  return sendEmail({ to, subject, html });
}
export async function sendAlertEmail(to, alertType, message, details = {}) {
  const subject = `【DataGate Alert】${alertType}`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🚨 DataGate Alert</h1>
    <p style="color: white; margin: 10px 0 0 0; font-size: 14px;">${alertType}</p>
  </div>
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <h2 style="color: #dc3545; margin-top: 0;">Alert Details</h2>
    <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 14px; color: #721c24;"><strong>${message}</strong></p>
    </div>
    <div style="background: white; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <h3 style="margin-top: 0; color: #666;">Details:</h3>
      <pre style="background: #f0f0f0; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px;">${JSON.stringify(details, null, 2)}</pre>
    </div>
    <p style="font-size: 14px; color: #666;">Timestamp: ${new Date().toISOString()}</p>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    <p style="font-size: 12px; color: #999; text-align: center;">This is an automated alert from DataGate monitoring system.</p>
  </div>
</body>
</html>
  `;
  return sendEmail({ to, subject, html });
}
export default {
  sendEmail,
  sendOTPEmail,
  sendDownloadNotificationEmail,
  sendAlertEmail
};
