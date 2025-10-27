// lib/email-service.js
// SendGridを使用したメール送信サービス

import sgMail from '@sendgrid/mail';

// 環境変数の検証
function validateEmailConfig() {
  const required = ['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL', 'SENDGRID_FROM_NAME'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// SendGrid初期化
function initializeSendGrid() {
  try {
    validateEmailConfig();
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    return true;
  } catch (error) {
    console.error('SendGrid initialization failed:', error.message);
    return false;
  }
}

// メールテンプレート: ダウンロードリンク通知
function createDownloadEmailTemplate(downloadLink, otp, expiresInDays = 7) {
  const subject = '【138DataGate】ファイル受け取りリンク';
  
  // HTML版
  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #0070f3;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #0070f3;
      margin: 0;
      font-size: 24px;
    }
    .content {
      margin-bottom: 30px;
    }
    .otp-box {
      background-color: #f8f9fa;
      border: 2px solid #0070f3;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 20px 0;
    }
    .otp-label {
      font-size: 14px;
      color: #666;
      margin-bottom: 10px;
    }
    .otp-code {
      font-size: 32px;
      font-weight: bold;
      color: #0070f3;
      letter-spacing: 8px;
      font-family: "Courier New", monospace;
    }
    .button {
      display: inline-block;
      background-color: #0070f3;
      color: #ffffff !important;
      text-decoration: none;
      padding: 12px 30px;
      border-radius: 6px;
      font-weight: bold;
      text-align: center;
      margin: 20px 0;
    }
    .button:hover {
      background-color: #0051cc;
    }
    .info-box {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      font-size: 12px;
      color: #666;
      text-align: center;
    }
    .warning {
      color: #d32f2f;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📦 ファイル受け取りリンク</h1>
    </div>
    
    <div class="content">
      <p>ファイルが共有されました。以下のリンクからダウンロードできます。</p>
      
      <div style="text-align: center;">
        <a href="${downloadLink}" class="button">ファイルをダウンロード</a>
      </div>
      
      <div class="otp-box">
        <div class="otp-label">ワンタイムパスワード（OTP）</div>
        <div class="otp-code">${otp}</div>
      </div>
      
      <div class="info-box">
        <strong>📌 ご利用方法：</strong>
        <ol style="margin: 10px 0; padding-left: 20px;">
          <li>上記の「ファイルをダウンロード」ボタンをクリック</li>
          <li>表示されたページで6桁のOTPを入力</li>
          <li>「ダウンロード」ボタンをクリック</li>
        </ol>
      </div>
      
      <div class="info-box">
        <strong>⚠️ 重要事項：</strong>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li><span class="warning">有効期限：${expiresInDays}日間</span></li>
          <li>OTPは5回まで入力可能（失敗すると15分間ロック）</li>
          <li>このメールは転送しないでください</li>
        </ul>
      </div>
      
      <p style="margin-top: 20px; font-size: 14px; color: #666;">
        ダウンロードリンク（コピー用）：<br>
        <code style="background: #f5f5f5; padding: 5px; display: inline-block; word-break: break-all;">${downloadLink}</code>
      </p>
    </div>
    
    <div class="footer">
      <p>このメールは 138DataGate から自動送信されています。</p>
      <p>お心当たりがない場合は、このメールを破棄してください。</p>
      <p style="margin-top: 10px;">© 2025 138DataGate. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
  
  // テキスト版（HTMLメールが表示できない環境用）
  const text = `
【138DataGate】ファイル受け取りリンク

ファイルが共有されました。以下のリンクからダウンロードできます。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ダウンロードリンク:
${downloadLink}

ワンタイムパスワード（OTP）:
${otp}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【ご利用方法】
1. 上記のリンクにアクセス
2. 表示されたページで6桁のOTPを入力
3. 「ダウンロード」ボタンをクリック

【重要事項】
⚠️ 有効期限：${expiresInDays}日間
⚠️ OTPは5回まで入力可能（失敗すると15分間ロック）
⚠️ このメールは転送しないでください

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
このメールは 138DataGate から自動送信されています。
お心当たりがない場合は、このメールを破棄してください。

© 2025 138DataGate. All rights reserved.
  `.trim();
  
  return { subject, html, text };
}

// メール送信（リトライ機能付き）
async function sendEmail(to, subject, html, text, options = {}) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    trackingSettings = {
      clickTracking: { enable: false },
      openTracking: { enable: false }
    }
  } = options;
  
  // SendGrid初期化確認
  if (!initializeSendGrid()) {
    throw new Error('SendGrid is not properly configured');
  }
  
  const msg = {
    to,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL,
      name: process.env.SENDGRID_FROM_NAME
    },
    subject,
    text,
    html,
    trackingSettings,
    // Reply-To（送信元と同じ）
    replyTo: process.env.SENDGRID_FROM_EMAIL
  };
  
  // リトライロジック（指数バックオフ）
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await sgMail.send(msg);
      
      console.log(`Email sent successfully to ${to} (attempt ${attempt}/${maxRetries})`);
      console.log('SendGrid Response:', JSON.stringify(response[0].statusCode));
      
      return {
        success: true,
        messageId: response[0].headers['x-message-id'],
        statusCode: response[0].statusCode,
        attempt
      };
      
    } catch (error) {
      console.error(`Email send failed (attempt ${attempt}/${maxRetries}):`, error.message);
      
      if (error.response) {
        console.error('SendGrid Error Response:', JSON.stringify(error.response.body, null, 2));
      }
      
      // 最後の試行でエラーの場合は例外をスロー
      if (attempt === maxRetries) {
        throw new Error(`Failed to send email after ${maxRetries} attempts: ${error.message}`);
      }
      
      // 次の試行前に待機（指数バックオフ）
      const delay = retryDelay * Math.pow(2, attempt - 1);
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// ダウンロードリンク通知メールを送信
async function sendDownloadLinkEmail(recipientEmail, downloadLink, otp, expiresInDays = 7) {
  try {
    const { subject, html, text } = createDownloadEmailTemplate(downloadLink, otp, expiresInDays);
    
    const result = await sendEmail(recipientEmail, subject, html, text);
    
    return {
      success: true,
      ...result
    };
    
  } catch (error) {
    console.error('Failed to send download link email:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export {
  sendDownloadLinkEmail,
  sendEmail,
  initializeSendGrid
};
