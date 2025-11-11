/**
 * Email Service - SendGrid Primary (SES Optional)
 * nodemailer 完全削除、API-First 実装
 */

const sgMail = require('@sendgrid/mail');

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
    const { SESv2Client } = require('@aws-sdk/client-sesv2');
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

  const { SendEmailCommand } = require('@aws-sdk/client-sesv2');
  
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
async function sendEmail(mailOptions) {
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

module.exports = { sendEmail };