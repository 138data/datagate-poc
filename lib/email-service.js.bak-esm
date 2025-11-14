/**
 * Email Service - SendGrid Primary (SES Optional)
 * ES Modules 対応版 + sendDownloadLink + sendOTPEmail 関数追加
 * Phase 66: 2025-11-11 12:50:00
 */

import sgMail from '@sendgrid/mail';

// SendGrid 初期化（必須）
if (!process.env.SENDGRID_API_KEY) {
  console.error('[EmailService] CRITICAL: SENDGRID_API_KEY が未設定です');
  throw new Error('SENDGRID_API_KEY が必要です');
}

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
console.log('[EmailService] SendGrid 初期化完了');

// SES 初期化（オプショナル）
let sesClient = null;
try {
  if (process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID) {
    const { SESv2Client } = await import('@aws-sdk/client-sesv2');
    sesClient = new SESv2Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    console.log('[EmailService] SES フォールバック有効');
  } else {
    console.log('[EmailService] SES 未設定（SendGrid のみ使用）');
  }
} catch (error) {
  console.warn('[EmailService] SES 初期化失敗（SendGrid のみ使用）:', error.message);
}

/**
 * SendGrid API でメール送信
 */
async function sendWithSendGrid(mailOptions) {
  const msg = {
    to: mailOptions.to,
    from: mailOptions.from || process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_FROM || '138data@gmail.com',
    subject: mailOptions.subject,
    text: mailOptions.text,
    html: mailOptions.html,
  };

  console.log('[SendGrid] 送信開始:', {
    to: msg.to,
    from: msg.from,
    subject: msg.subject,
  });

  const response = await sgMail.send(msg);
  console.log('[SendGrid] 送信成功:', response[0].statusCode);

  return {
    success: true,
    provider: 'sendgrid',
    statusCode: response[0].statusCode,
    messageId: response[0].headers['x-message-id'],
  };
}

/**
 * SES API でメール送信（フォールバック）
 */
async function sendWithSES(mailOptions) {
  if (!sesClient) {
    throw new Error('SES が初期化されていません');
  }

  const { SendEmailCommand } = await import('@aws-sdk/client-sesv2');

  const command = new SendEmailCommand({
    FromEmailAddress: mailOptions.from || process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_FROM || '138data@gmail.com',
    Destination: {
      ToAddresses: [mailOptions.to],
    },
    Content: {
      Simple: {
        Subject: {
          Data: mailOptions.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: mailOptions.text || '',
            Charset: 'UTF-8',
          },
          Html: {
            Data: mailOptions.html || mailOptions.text || '',
            Charset: 'UTF-8',
          },
        },
      },
    },
  });

  console.log('[SES] フォールバック送信開始:', {
    to: mailOptions.to,
    subject: mailOptions.subject,
  });

  const response = await sesClient.send(command);
  console.log('[SES] 送信成功:', response.MessageId);

  return {
    success: true,
    provider: 'ses',
    messageId: response.MessageId,
  };
}

/**
 * メイン送信関数（SendGrid 優先 → SES フォールバック）
 */
export async function sendEmail(mailOptions) {
  // サンドボックスモードチェック
  if (process.env.MAIL_SANDBOX === 'true') {
    console.log('[EmailService] サンドボックスモード: メール送信スキップ');
    console.log('[EmailService] 送信予定内容:', {
      to: mailOptions.to,
      subject: mailOptions.subject,
      textPreview: mailOptions.text?.substring(0, 100),
    });
    return {
      success: true,
      provider: 'sandbox',
      message: 'サンドボックスモード（実際の送信なし）',
    };
  }

  // 入力検証
  if (!mailOptions.to) {
    throw new Error('送信先メールアドレスが指定されていません');
  }
  if (!mailOptions.subject) {
    throw new Error('件名が指定されていません');
  }
  if (!mailOptions.text && !mailOptions.html) {
    throw new Error('メール本文が指定されていません');
  }

  // SendGrid で送信
  try {
    return await sendWithSendGrid(mailOptions);
  } catch (error) {
    console.error('[SendGrid] 送信失敗:', error.response?.body || error.message);

    // SES フォールバック（利用可能な場合）
    if (sesClient) {
      console.log('[EmailService] SES フォールバックを試行');
      try {
        return await sendWithSES(mailOptions);
      } catch (sesError) {
        console.error('[SES] フォールバック失敗:', sesError.message);
        throw new Error('すべてのメール送信方法が失敗しました');
      }
    }

    // SES が無い場合はエラーを投げる
    throw new Error(`メール送信に失敗しました: ${error.response?.body?.errors?.[0]?.message || error.message}`);
  }
}

/**
 * ダウンロードリンクメール送信（upload.js で使用）
 * Phase 65: 追加
 */
export async function sendDownloadLink(recipientEmail, downloadUrl, otp, fileName) {
  console.log('[sendDownloadLink] 呼び出し:', {
    recipientEmail,
    fileName,
    downloadUrl,
    otpLength: otp?.length,
  });

  const mailOptions = {
    to: recipientEmail,
    subject: 'ファイル受け取りURL',
    text: `
ファイルのダウンロードURLをお送りします。

ファイル名: ${fileName}
ダウンロードURL: ${downloadUrl}
確認コード: ${otp}

このURLは7日間有効です。
ダウンロードは3回まで可能です。
    `,
    html: `
<p>ファイルのダウンロードURLをお送りします。</p>
<p><strong>ファイル名:</strong> ${fileName}</p>
<p><strong>ダウンロードURL:</strong><br>
<a href="${downloadUrl}">${downloadUrl}</a></p>
<p><strong>確認コード:</strong> ${otp}</p>
<p>このURLは7日間有効です。<br>
ダウンロードは3回まで可能です。</p>
    `,
  };

  return await sendEmail(mailOptions);
}

/**
 * OTPメール送信（upload.js で使用）
 * Phase 66: 追加
 */
export async function sendOTPEmail(recipientEmail, otp, downloadUrl, fileInfo) {
  console.log('[sendOTPEmail] 呼び出し:', {
    recipientEmail,
    otp,
    downloadUrl,
    fileName: fileInfo?.fileName,
  });

  const mailOptions = {
    to: recipientEmail,
    subject: 'ファイル受け取りURL - DataGate',
    text: `
ファイルのダウンロードURLをお送りします。

【ファイル情報】
ファイル名: ${fileInfo.fileName}
ファイルサイズ: ${(fileInfo.fileSize / 1024).toFixed(2)} KB
有効期限: ${new Date(fileInfo.expiresAt).toLocaleString('ja-JP')}

【ダウンロード方法】
1. 以下のURLにアクセスしてください
${downloadUrl}

2. 確認コード（OTP）を入力してください
確認コード: ${otp}

【ご注意】
- このURLは7日間有効です
- ダウンロードは3回まで可能です
- 確認コードは6桁の数字です

━━━━━━━━━━━━━━━━━━━━━━
DataGate - 安全なファイル受け渡しシステム
━━━━━━━━━━━━━━━━━━━━━━
    `,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4A90E2; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .info-box { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4A90E2; }
    .otp-code { font-size: 32px; font-weight: bold; color: #4A90E2; text-align: center; padding: 20px; background: white; border: 2px dashed #4A90E2; border-radius: 5px; letter-spacing: 5px; }
    .button { display: inline-block; padding: 12px 30px; background: #4A90E2; color: white; text-decoration: none; border-radius: 5px; margin: 15px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📁 ファイル受け取りURL</h1>
    </div>
    
    <div class="content">
      <p>ファイルのダウンロードURLをお送りします。</p>
      
      <div class="info-box">
        <strong>📄 ファイル情報</strong><br>
        ファイル名: ${fileInfo.fileName}<br>
        ファイルサイズ: ${(fileInfo.fileSize / 1024).toFixed(2)} KB<br>
        有効期限: ${new Date(fileInfo.expiresAt).toLocaleString('ja-JP')}
      </div>
      
      <h3>🔑 確認コード（OTP）</h3>
      <div class="otp-code">${otp}</div>
      
      <h3>📥 ダウンロード方法</h3>
      <p>以下のボタンをクリックして、上記の確認コードを入力してください。</p>
      
      <div style="text-align: center;">
        <a href="${downloadUrl}" class="button">ファイルをダウンロード</a>
      </div>
      
      <div class="info-box">
        <strong>⚠️ ご注意</strong><br>
        • このURLは7日間有効です<br>
        • ダウンロードは3回まで可能です<br>
        • 確認コードは6桁の数字です
      </div>
    </div>
    
    <div class="footer">
      DataGate - 安全なファイル受け渡しシステム<br>
      このメールに心当たりがない場合は、削除してください。
    </div>
  </div>
</body>
</html>
    `,
  };

  return await sendEmail(mailOptions);
}

// デフォルトエクスポート（後方互換性）
const emailService = {
  sendEmail,
  sendDownloadLink,
  sendOTPEmail,
};

export default emailService;