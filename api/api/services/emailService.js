// api/services/emailService.js
const sgMail = require('@sendgrid/mail');

// SendGrid APIキーの設定
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

/**
 * OTP付きメールを送信
 * @param {string} to - 送信先メールアドレス
 * @param {string} otp - ワンタイムパスワード
 * @param {string} downloadLink - ダウンロードリンク
 * @param {string} fileName - ファイル名
 * @returns {Promise} 送信結果
 */
async function sendOTPEmail(to, otp, downloadLink, fileName) {
  // SendGridが設定されていない場合はコンソール出力
  if (!process.env.SENDGRID_API_KEY) {
    console.log('📧 メール送信（テストモード）');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`To: ${to}`);
    console.log(`OTP: ${otp}`);
    console.log(`Link: ${downloadLink}`);
    console.log(`File: ${fileName}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return { success: true, mode: 'test' };
  }

  const msg = {
    to: to,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL || 'noreply@datagate.com',
      name: process.env.SENDGRID_FROM_NAME || 'DataGate'
    },
    subject: `【DataGate】ファイル受信のお知らせ: ${fileName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #f9f9f9;
            border-radius: 10px;
            padding: 30px;
            margin: 20px 0;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 10px 10px 0 0;
            text-align: center;
            margin: -30px -30px 20px -30px;
          }
          .otp-box {
            background: #fff;
            border: 2px solid #667eea;
            border-radius: 10px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
          }
          .otp-code {
            font-size: 32px;
            font-weight: bold;
            color: #667eea;
            letter-spacing: 5px;
            margin: 10px 0;
          }
          .button {
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 25px;
            margin: 20px auto;
            text-align: center;
          }
          .info {
            background: #e8f4f8;
            border-left: 4px solid #3498db;
            padding: 15px;
            margin: 20px 0;
          }
          .footer {
            color: #888;
            font-size: 12px;
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
          }
          .warning {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 DataGate</h1>
            <p>セキュアファイル転送サービス</p>
          </div>
          
          <h2>ファイルが送信されました</h2>
          <p>以下のファイルが送信されました。ダウンロードするには、下記のOTPコードが必要です。</p>
          
          <div class="info">
            <strong>📎 ファイル名:</strong> ${fileName}<br>
            <strong>📅 送信日時:</strong> ${new Date().toLocaleString('ja-JP')}<br>
            <strong>⏰ 有効期限:</strong> 7日間<br>
            <strong>📥 ダウンロード可能回数:</strong> 3回
          </div>
          
          <div class="otp-box">
            <p><strong>ワンタイムパスワード（OTP）</strong></p>
            <div class="otp-code">${otp}</div>
            <p style="color: #666; font-size: 12px;">このコードはダウンロード時に必要です</p>
          </div>
          
          <div style="text-align: center;">
            <a href="${downloadLink}" class="button">ファイルをダウンロード</a>
          </div>
          
          <div class="warning">
            <strong>⚠️ セキュリティに関する注意:</strong><br>
            • このOTPコードは他人に共有しないでください<br>
            • ダウンロードは3回まで可能です<br>
            • 7日後に自動的に削除されます
          </div>
          
          <div class="footer">
            <p>このメールは DataGate セキュアファイル転送サービスから自動送信されています。</p>
            <p>心当たりがない場合は、このメールを削除してください。</p>
            <p>© 2025 DataGate - Secure File Transfer</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
DataGate - セキュアファイル転送

ファイルが送信されました
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ファイル名: ${fileName}
送信日時: ${new Date().toLocaleString('ja-JP')}

ワンタイムパスワード（OTP）: ${otp}

ダウンロードリンク: ${downloadLink}

このOTPコードはダウンロード時に必要です。
他人に共有しないでください。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DataGate - Secure File Transfer
    `
  };

  try {
    const response = await sgMail.send(msg);
    console.log('✅ メール送信成功:', to);
    return { success: true, messageId: response[0].headers['x-message-id'] };
  } catch (error) {
    console.error('❌ メール送信エラー:', error);
    if (error.response) {
      console.error('Error details:', error.response.body);
    }
    throw error;
  }
}

/**
 * ダウンロード完了通知メール
 * @param {string} to - 送信先メールアドレス
 * @param {string} fileName - ファイル名
 * @param {number} remainingDownloads - 残りダウンロード回数
 */
async function sendDownloadNotification(to, fileName, remainingDownloads) {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('📧 ダウンロード通知（テストモード）');
    console.log(`To: ${to}, File: ${fileName}, Remaining: ${remainingDownloads}`);
    return { success: true, mode: 'test' };
  }

  const msg = {
    to: to,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL || 'noreply@datagate.com',
      name: process.env.SENDGRID_FROM_NAME || 'DataGate'
    },
    subject: `【DataGate】ファイルがダウンロードされました: ${fileName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>ファイルダウンロード通知</h2>
        <p>送信したファイルがダウンロードされました。</p>
        <ul>
          <li>ファイル名: ${fileName}</li>
          <li>ダウンロード日時: ${new Date().toLocaleString('ja-JP')}</li>
          <li>残りダウンロード可能回数: ${remainingDownloads}回</li>
        </ul>
        ${remainingDownloads === 0 ? '<p style="color: red;">⚠️ ダウンロード回数の上限に達しました。ファイルは削除されます。</p>' : ''}
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    console.log('✅ ダウンロード通知送信成功:', to);
    return { success: true };
  } catch (error) {
    console.error('❌ ダウンロード通知送信エラー:', error);
    return { success: false, error };
  }
}

module.exports = {
  sendOTPEmail,
  sendDownloadNotification
};
