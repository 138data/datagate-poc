// lib/emails/sendgrid.js
// Phase 35b: SendGrid メール送信ユーティリティ

import sgMail from '@sendgrid/mail';

// SendGrid API Key 設定
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.warn('SENDGRID_API_KEY not set');
}

/**
 * ダウンロードリンクメール送信
 * @param {Object} params - メールパラメータ
 * @param {string} params.to - 送信先メールアドレス
 * @param {string} params.fileName - ファイル名
 * @param {string} params.downloadUrl - ダウンロードURL
 * @param {string} params.otpCode - OTPコード（6桁）
 * @returns {Promise<void>}
 */
export async function sendDownloadLinkEmail({ to, fileName, downloadUrl, otpCode }) {
  const msg = {
    to,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL || 'noreply@138data.com',
      name: process.env.SENDGRID_FROM_NAME || '138DataGate'
    },
    subject: 'ファイル受信のお知らせ - 138DataGate',
    text: `
${fileName} のダウンロードリンクをお送りします。

ダウンロードリンク：
${downloadUrl}

認証コード（OTP）：
${otpCode}

有効期限：7日間

このメールは自動送信されています。
    `.trim(),
    html: `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 8px 8px 0 0;
    }
    .content {
      background: #f9f9f9;
      padding: 30px;
      border-radius: 0 0 8px 8px;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      border-radius: 8px;
      margin: 20px 0;
    }
    .otp {
      font-size: 32px;
      font-weight: 700;
      letter-spacing: 8px;
      color: #667eea;
      background: white;
      padding: 15px;
      border-radius: 8px;
      display: inline-block;
      margin: 10px 0;
    }
    .footer {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin:0;">🔒 138DataGate</h1>
    <p style="margin:5px 0 0;">セキュアファイル送信サービス</p>
  </div>
  <div class="content">
    <h2 style="color:#667eea;">ファイル受信のお知らせ</h2>
    <p><strong>${fileName}</strong> のダウンロードリンクをお送りします。</p>
    
    <p>以下のリンクをクリックしてファイルをダウンロードしてください：</p>
    <a href="${downloadUrl}" class="button">📥 ファイルをダウンロード</a>
    
    <p>ダウンロード時に以下の認証コード（OTP）の入力が必要です：</p>
    <div class="otp">${otpCode}</div>
    
    <p><strong>有効期限：7日間</strong></p>
    
    <div class="footer">
      <p>このメールは自動送信されています。</p>
      <p>© 2025 138DataGate. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim()
  };

  try {
    await sgMail.send(msg);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error('SendGrid error:', error);
    if (error.response) {
      console.error('SendGrid response:', error.response.body);
    }
    throw error;
  }
}
