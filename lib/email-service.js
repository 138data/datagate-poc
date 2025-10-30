const sgMail = require('@sendgrid/mail');

// 環境変数
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@138data.com';
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || '138DataGate';
const ENABLE_EMAIL_SENDING = process.env.ENABLE_EMAIL_SENDING === 'true';

// SendGrid初期化
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

/**
 * ダウンロードリンクメール送信（OTPは含めない）
 */
async function sendDownloadLinkEmail({ to, fileId, fileName }) {
  if (!SENDGRID_API_KEY) {
    console.error('SendGrid API key not configured');
    return { success: false, error: 'API key missing' };
  }

  const downloadUrl = `https://${process.env.VERCEL_URL || 'localhost:3000'}/download.html?id=${fileId}`;

  const msg = {
    to,
    from: {
      email: SENDGRID_FROM_EMAIL,
      name: SENDGRID_FROM_NAME,
    },
    subject: `【138DataGate】ファイル「${fileName}」が届きました`,
    text: `
ファイルが届きました。

ファイル名: ${fileName}

以下のリンクからダウンロードしてください：
${downloadUrl}

ダウンロードページでメールアドレスを入力すると、OTPコードが送信されます。

※このファイルは7日間保存され、最大3回までダウンロード可能です。
※このメールは自動送信されています。

---
138DataGate - セキュアファイル転送サービス
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
    .content { background: #f9fafb; padding: 30px; margin: 20px 0; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📁 ファイルが届きました</h1>
    </div>
    <div class="content">
      <p><strong>ファイル名:</strong> ${fileName}</p>
      <p>以下のボタンをクリックしてダウンロードページにアクセスしてください：</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${downloadUrl}" class="button">ダウンロードページを開く</a>
      </p>
      <p style="font-size: 14px; color: #666;">
        ダウンロードページでメールアドレスを入力すると、OTPコードが送信されます。<br>
        ※このファイルは7日間保存され、最大3回までダウンロード可能です。
      </p>
    </div>
    <div class="footer">
      このメールは自動送信されています。<br>
      138DataGate - セキュアファイル転送サービス
    </div>
  </div>
</body>
</html>
    `.trim(),
  };

  try {
    await sgMail.send(msg);
    console.log(`Download link email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('SendGrid error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * OTP送信メール（メールアドレス確認後）
 */
async function sendOTPEmail({ to, fileName, otp }) {
  if (!SENDGRID_API_KEY) {
    console.error('SendGrid API key not configured');
    return { success: false, error: 'API key missing' };
  }

  const msg = {
    to,
    from: {
      email: SENDGRID_FROM_EMAIL,
      name: SENDGRID_FROM_NAME,
    },
    subject: `【138DataGate】ダウンロード認証コード（OTP）`,
    text: `
ダウンロード認証コード（OTP）

ファイル名: ${fileName}

認証コード: ${otp}

このコードをダウンロードページに入力してください。

※このコードは第三者に教えないでください。
※このメールは自動送信されています。

---
138DataGate - セキュアファイル転送サービス
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
    .content { background: #f9fafb; padding: 30px; margin: 20px 0; }
    .otp-box { background: white; border: 2px solid #2563eb; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 ダウンロード認証コード</h1>
    </div>
    <div class="content">
      <p><strong>ファイル名:</strong> ${fileName}</p>
      <p>以下の認証コード（OTP）をダウンロードページに入力してください：</p>
      <div class="otp-box">${otp}</div>
      <p style="font-size: 14px; color: #dc2626; font-weight: bold;">
        ⚠️ このコードは第三者に教えないでください
      </p>
    </div>
    <div class="footer">
      このメールは自動送信されています。<br>
      138DataGate - セキュアファイル転送サービス
    </div>
  </div>
</body>
</html>
    `.trim(),
  };

  try {
    await sgMail.send(msg);
    console.log(`OTP email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('SendGrid error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 添付ファイル送信
 */
async function sendFileAsAttachment({ to, fileName, fileBuffer }) {
  if (!SENDGRID_API_KEY) {
    console.error('SendGrid API key not configured');
    return { success: false, error: 'API key missing' };
  }

  const msg = {
    to,
    from: {
      email: SENDGRID_FROM_EMAIL,
      name: SENDGRID_FROM_NAME,
    },
    subject: `【138DataGate】ファイル「${fileName}」`,
    text: `
ファイルを添付でお送りします。

ファイル名: ${fileName}

※このメールは自動送信されています。

---
138DataGate - セキュアファイル転送サービス
    `.trim(),
    attachments: [
      {
        content: fileBuffer.toString('base64'),
        filename: fileName,
        type: 'application/octet-stream',
        disposition: 'attachment',
      },
    ],
  };

  try {
    await sgMail.send(msg);
    console.log(`File attachment sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('SendGrid error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 開封通知メール送信
 */
async function sendDownloadNotificationEmail({ to, fileName, downloadedAt, downloadCount, maxDownloads, recipientDomain }) {
  if (!SENDGRID_API_KEY) {
    console.error('SendGrid API key not configured');
    return { success: false, error: 'API key missing' };
  }

  // 受信者ドメインをマスク（例: @138io.com → @138**.com）
  const maskedDomain = recipientDomain.replace(/(.{1,3})([^@]+)(\..+)$/, '$1**$3');

  const msg = {
    to,
    from: {
      email: SENDGRID_FROM_EMAIL,
      name: SENDGRID_FROM_NAME,
    },
    subject: `【開封通知】ファイルがダウンロードされました`,
    text: `
送信したファイルがダウンロードされました。

- ファイル名: ${fileName}
- ダウンロード日時: ${downloadedAt}
- ダウンロード回数: ${downloadCount} / ${maxDownloads}
- 受信者ドメイン: ${maskedDomain}  ※個人情報保護のためマスク表示

※この通知は DataGate の開封通知機能により自動送信されています。

---
138DataGate - セキュアファイル転送サービス
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #10b981; color: white; padding: 20px; text-align: center; }
    .content { background: #f9fafb; padding: 30px; margin: 20px 0; }
    .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .info-table td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
    .info-table td:first-child { font-weight: bold; width: 40%; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ ファイルがダウンロードされました</h1>
    </div>
    <div class="content">
      <p>送信したファイルがダウンロードされました。</p>
      <table class="info-table">
        <tr>
          <td>ファイル名</td>
          <td>${fileName}</td>
        </tr>
        <tr>
          <td>ダウンロード日時</td>
          <td>${downloadedAt}</td>
        </tr>
        <tr>
          <td>ダウンロード回数</td>
          <td>${downloadCount} / ${maxDownloads}</td>
        </tr>
        <tr>
          <td>受信者ドメイン</td>
          <td>${maskedDomain}<br><span style="font-size: 12px; color: #666;">※個人情報保護のためマスク表示</span></td>
        </tr>
      </table>
      <p style="font-size: 14px; color: #666;">
        この通知は DataGate の開封通知機能により自動送信されています。
      </p>
    </div>
    <div class="footer">
      138DataGate - セキュアファイル転送サービス
    </div>
  </div>
</body>
</html>
    `.trim(),
  };

  try {
    await sgMail.send(msg);
    console.log(`Download notification email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('SendGrid error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 統合メール送信関数
 */
async function sendEmail({ to, fileId, fileName, otp, shouldAttach = false, fileBuffer = null }) {
  console.log('[DEBUG] sendEmail called with:', {
    to,
    fileId,
    fileName,
    shouldAttach,
    ENABLE_EMAIL_SENDING,
    hasApiKey: !!SENDGRID_API_KEY,
    apiKeyPrefix: SENDGRID_API_KEY ? SENDGRID_API_KEY.substring(0, 10) : 'none'
  });

  if (!ENABLE_EMAIL_SENDING) {
    console.log('[WARN] Email sending is disabled (ENABLE_EMAIL_SENDING=false)');
    return { sent: false, success: false, mode: 'link', reason: 'email_disabled' };
  }

  if (!SENDGRID_API_KEY) {
    console.error('[ERROR] SendGrid API key not configured');
    return { sent: false, success: false, mode: 'link', reason: 'missing_api_key' };
  }

  console.log('[INFO] Proceeding with email send...');
  
  if (shouldAttach && fileBuffer) {
    const result = await sendFileAsAttachment({ to, fileName, fileBuffer });
    return { sent: true, success: result.success, mode: 'attach', reason: null };
  } else {
    // OTPは含めない（リンクのみ送信）
    const result = await sendDownloadLinkEmail({ to, fileId, fileName });
    return { sent: true, success: result.success, mode: 'link', reason: null };
  }
}

  if (!SENDGRID_API_KEY) {
    return { sent: false, success: false, mode: 'link', reason: 'missing_api_key' };
  }

  if (shouldAttach && fileBuffer) {
    const result = await sendFileAsAttachment({ to, fileName, fileBuffer });
    return { sent: true, success: result.success, mode: 'attach', reason: null };
  } else {
    // OTPは含めない（リンクのみ送信）
    const result = await sendDownloadLinkEmail({ to, fileId, fileName });
    return { sent: true, success: result.success, mode: 'link', reason: null };
  }
}

// 個別のメール送信関数をエクスポート



module.exports = {
  sendEmail,
  sendOTPEmail,
  sendDownloadNotificationEmail
};