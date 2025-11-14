/**
 * Email Service - SendGrid Primary (Gmail SMTP Fallback)
 * CommonJS 対応版
 * Phase 74: S3 Migration - Vercel Compatibility Fix
 */

const sgMail = require('@sendgrid/mail');
const nodemailer = require('nodemailer');

// SendGrid 初期化
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('[EmailService] SendGrid initialized');
} else {
  console.warn('[EmailService] SENDGRID_API_KEY not set, will use SMTP fallback');
}

// Gmail SMTP トランスポーター（フォールバック用）
let gmailTransporter = null;
if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  gmailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  console.log('[EmailService] Gmail SMTP fallback configured');
}

/**
 * メール送信（ダウンロードリンク通知）
 * @param {Object} params
 * @param {string} params.to - 受信者メールアドレス
 * @param {string} params.fileId - ファイルID
 * @param {string} params.fileName - ファイル名
 * @param {number} params.fileSize - ファイルサイズ
 * @param {string} params.otp - ワンタイムパスワード
 * @param {Date} params.expiresAt - 有効期限
 * @returns {Promise<boolean>}
 */
async function sendEmail({ to, fileId, fileName, fileSize, otp, expiresAt }) {
  const downloadUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://datagate-poc.vercel.app'}/download/${fileId}`;
  
  const formattedSize = formatFileSize(fileSize);
  const formattedExpiry = new Date(expiresAt).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  });

  const subject = `【DataGate】ファイル受信通知: ${fileName}`;
  const textContent = `
ファイルが共有されました。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 ファイル情報
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ファイル名: ${fileName}
サイズ: ${formattedSize}
有効期限: ${formattedExpiry}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔐 ダウンロード手順
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. 下記のリンクをクリックしてください：
   ${downloadUrl}

2. ワンタイムパスワード（OTP）を入力してください：
   ${otp}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 重要事項
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- このファイルは ${formattedExpiry} まで有効です
- OTPは1回のみ使用可能です
- ダウンロード後、ファイルは自動削除されます
- このメールに返信しないでください

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DataGate - Secure File Transfer System
Powered by 138data
  `.trim();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
    .info-box { background: white; padding: 20px; margin: 20px 0; border-left: 4px solid #667eea; border-radius: 5px; }
    .otp-box { background: #667eea; color: white; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0; border-radius: 5px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
    .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; border-radius: 0 0 10px 10px; }
    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔒 DataGate</h1>
      <p>セキュアファイル転送システム</p>
    </div>
    <div class="content">
      <h2>ファイルが共有されました</h2>
      
      <div class="info-box">
        <h3>📁 ファイル情報</h3>
        <p><strong>ファイル名:</strong> ${fileName}</p>
        <p><strong>サイズ:</strong> ${formattedSize}</p>
        <p><strong>有効期限:</strong> ${formattedExpiry}</p>
      </div>

      <h3>🔐 ダウンロード手順</h3>
      <ol>
        <li>下記のボタンをクリックしてダウンロードページにアクセス</li>
        <li>ワンタイムパスワード（OTP）を入力</li>
        <li>ファイルをダウンロード</li>
      </ol>

      <div style="text-align: center;">
        <a href="${downloadUrl}" class="button">📥 ファイルをダウンロード</a>
      </div>

      <h3>ワンタイムパスワード（OTP）</h3>
      <div class="otp-box">${otp}</div>

      <div class="warning">
        <h4>⚠️ 重要事項</h4>
        <ul>
          <li>このファイルは <strong>${formattedExpiry}</strong> まで有効です</li>
          <li>OTPは1回のみ使用可能です（5回失敗でロック）</li>
          <li>ダウンロード後、ファイルは自動削除されます</li>
          <li>このメールには返信しないでください</li>
        </ul>
      </div>
    </div>
    <div class="footer">
      <p>DataGate - Secure File Transfer System</p>
      <p>Powered by 138data</p>
      <p style="margin-top: 10px; opacity: 0.7;">
        このメールに心当たりがない場合は、削除してください。
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  // SANDBOX モード確認
  if (process.env.MAIL_SANDBOX === 'true') {
    console.log('[EmailService] SANDBOX MODE - メール送信スキップ');
    console.log({
      to,
      subject,
      otp,
      downloadUrl,
    });
    return true;
  }

  // SendGrid で送信試行
  if (process.env.SENDGRID_API_KEY) {
    try {
      const msg = {
        to,
        from: {
          email: process.env.SENDGRID_FROM_EMAIL || 'noreply@138data.com',
          name: 'DataGate',
        },
        subject,
        text: textContent,
        html: htmlContent,
      };

      await sgMail.send(msg);
      console.log('[EmailService] SendGrid送信成功:', to);
      return true;
    } catch (error) {
      console.error('[EmailService] SendGrid送信失敗:', error.message);
      
      // Gmail SMTP フォールバック
      if (gmailTransporter) {
        try {
          await gmailTransporter.sendMail({
            from: `"DataGate" <${process.env.GMAIL_USER}>`,
            to,
            subject,
            text: textContent,
            html: htmlContent,
          });
          console.log('[EmailService] Gmail SMTP送信成功:', to);
          return true;
        } catch (gmailError) {
          console.error('[EmailService] Gmail SMTP送信失敗:', gmailError.message);
          return false;
        }
      }
      
      return false;
    }
  }

  // SendGrid未設定の場合はGmail SMTPのみ試行
  if (gmailTransporter) {
    try {
      await gmailTransporter.sendMail({
        from: `"DataGate" <${process.env.GMAIL_USER}>`,
        to,
        subject,
        text: textContent,
        html: htmlContent,
      });
      console.log('[EmailService] Gmail SMTP送信成功:', to);
      return true;
    } catch (error) {
      console.error('[EmailService] Gmail SMTP送信失敗:', error.message);
      return false;
    }
  }

  console.error('[EmailService] 利用可能な送信方法がありません');
  return false;
}

/**
 * ファイルサイズをフォーマット
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// CommonJS エクスポート
module.exports = sendEmail;