const sgMail = require('@sendgrid/mail');

// 環境変数の読み込み
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'datagate@138io.com';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || '138DataGate';

// APIキーを設定（重要：モジュールレベルで1回だけ実行）
if (SENDGRID_API_KEY) {
  console.log('[email-service] Setting API key, length:', SENDGRID_API_KEY.length);
  sgMail.setApiKey(SENDGRID_API_KEY);
} else {
  console.error('[email-service] ERROR: SENDGRID_API_KEY is not set');
}

async function sendEmail(to, fileId, fileName, fileSize, downloadUrl, otp, mode = 'link') {
  console.log('[email-service] sendEmail called with:', { to, fileName, mode });
  
  if (!SENDGRID_API_KEY) {
    console.error('[email-service] Cannot send email: API key not configured');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const msg = {
      to: to,
      from: {
        email: FROM_EMAIL,
        name: FROM_NAME
      },
      subject: `【138DataGate】セキュアファイル送信: ${fileName}`,
      text: `ファイル「${fileName}」が送信されました。\n\nダウンロードURL: ${downloadUrl}\n\nワンタイムパスワード: ${otp}\n\nファイルは7日後に自動削除されます。`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">【138DataGate】セキュアファイル送信</h2>
          <p>ファイル「<strong>${fileName}</strong>」が送信されました。</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>ダウンロードURL:</strong><br>
            <a href="${downloadUrl}" style="color: #0066cc;">${downloadUrl}</a></p>
            <p><strong>ワンタイムパスワード:</strong><br>
            <span style="font-size: 24px; font-weight: bold; color: #ff6600;">${otp}</span></p>
          </div>
          <p style="color: #666; font-size: 12px;">
            ※ ファイルは7日後に自動削除されます。<br>
            ※ ダウンロードは3回まで可能です。
          </p>
        </div>
      `
    };

    console.log('[email-service] Sending email with from:', FROM_EMAIL, 'to:', to);
    const response = await sgMail.send(msg);
    console.log('[email-service] Email sent successfully, response:', response[0].statusCode);
    return { success: true, messageId: response[0].headers?.['x-message-id'] };
  } catch (error) {
    console.error('[email-service] Email sending failed:', error);
    if (error.response) {
      console.error('[email-service] Error status:', error.response.statusCode);
      console.error('[email-service] Error body:', JSON.stringify(error.response.body));
    }
    return { 
      success: false, 
      error: error.message || 'Failed to send email',
      details: error.response?.body
    };
  }
}

module.exports = { sendEmail };
