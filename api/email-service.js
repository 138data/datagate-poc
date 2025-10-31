// api/email-service.js - 完全版（Part 1/1）

import sgMail from '@sendgrid/mail';
import { getEnvironmentConfig } from './environment.js';

/**
 * SendGridの初期化
 */
function initializeSendGrid() {
  const config = getEnvironmentConfig();
  
  if (!config.sendgridApiKey) {
    throw new Error('SENDGRID_API_KEY is not configured');
  }
  
  sgMail.setApiKey(config.sendgridApiKey);
}

/**
 * ダウンロードリンクとOTPをメール送信
 * @param {object} params
 * @param {string} params.to - 送信先メールアドレス
 * @param {string} params.downloadUrl - ダウンロードURL
 * @param {string} params.otp - OTP（6桁）
 * @param {string} params.expiresAt - 有効期限（ISO 8601形式）
 * @returns {Promise<{success: boolean, messageId?: string, statusCode?: number, error?: string}>}
 */
export async function sendDownloadLinkEmail({ to, downloadUrl, otp, expiresAt }) {
  try {
    initializeSendGrid();
    
    const config = getEnvironmentConfig();
    
    // 有効期限を日本時間で表示
    const expiresDate = new Date(expiresAt);
    const jstDate = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(expiresDate);
    
    const msg = {
      to: to,
      from: {
        email: config.sendgridFromEmail,
        name: config.sendgridFromName
      },
      subject: '【138DataGate】ファイルのダウンロードリンク',
      text: `
ファイルのダウンロードリンクをお送りします。

ダウンロードURL:
${downloadUrl}

ワンタイムパスワード（OTP）:
${otp}

有効期限: ${jstDate}（日本時間）

※このリンクは7日間有効です。
※OTPは6桁の数字です。ダウンロードページで入力してください。
※このメールに心当たりがない場合は、送信者にお問い合わせください。

---
138DataGate - 安全なファイル受け渡しシステム
      `.trim(),
      html: `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #333;">ファイルのダウンロードリンク</h2>
  <p>ファイルのダウンロードリンクをお送りします。</p>
  
  <div style="background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
    <p><strong>ダウンロードURL:</strong></p>
    <p><a href="${downloadUrl}" style="color: #0066cc; word-break: break-all;">${downloadUrl}</a></p>
    
    <p style="margin-top: 20px;"><strong>ワンタイムパスワード（OTP）:</strong></p>
    <p style="font-size: 24px; font-weight: bold; color: #0066cc; letter-spacing: 3px;">${otp}</p>
    
    <p style="margin-top: 20px;"><strong>有効期限:</strong> ${jstDate}（日本時間）</p>
  </div>
  
  <p style="color: #666; font-size: 14px;">
    ※このリンクは7日間有効です。<br>
    ※OTPは6桁の数字です。ダウンロードページで入力してください。<br>
    ※このメールに心当たりがない場合は、送信者にお問い合わせください。
  </p>
  
  <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
  <p style="color: #999; font-size: 12px; text-align: center;">
    138DataGate - 安全なファイル受け渡しシステム
  </p>
</div>
      `.trim()
    };
    
    console.log('[EmailService] Sending download link email to:', to);
    
    const [response] = await sgMail.send(msg);
    
    console.log('[EmailService] Email sent successfully:', {
      statusCode: response.statusCode,
      messageId: response.headers['x-message-id']
    });
    
    return {
      success: true,
      messageId: response.headers['x-message-id'],
      statusCode: response.statusCode
    };
  } catch (error) {
    console.error('[EmailService] Send failed:', error);
    
    if (error.response) {
      console.error('[EmailService] SendGrid error details:', {
        statusCode: error.response.statusCode,
        body: error.response.body
      });
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * ファイルを添付してメール送信（添付直送モード）
 * @param {object} params
 * @param {string} params.to - 送信先メールアドレス
 * @param {string} params.fileName - ファイル名（UTF-8）
 * @param {Buffer} params.fileContent - ファイル内容（Buffer形式）
 * @param {string} params.mimeType - MIMEタイプ（例: 'application/pdf'）
 * @returns {Promise<{success: boolean, messageId?: string, statusCode?: number, error?: string}>}
 */
export async function sendFileAsAttachment({ to, fileName, fileContent, mimeType }) {
  try {
    initializeSendGrid();
    
    const config = getEnvironmentConfig();
    
    // Base64エンコード
    const base64Content = fileContent.toString('base64');
    
    console.log('[EmailService] Sending file as attachment:', {
      to: to,
      fileName: fileName,
      fileSize: fileContent.length,
      mimeType: mimeType
    });
    
    const msg = {
      to: to,
      from: {
        email: config.sendgridFromEmail,
        name: config.sendgridFromName
      },
      subject: '【138DataGate】ファイル送信',
      text: `
ファイルを添付でお送りします。

ファイル名: ${fileName}
サイズ: ${(fileContent.length / 1024).toFixed(2)} KB

※このメールに心当たりがない場合は、送信者にお問い合わせください。

---
138DataGate - 安全なファイル受け渡しシステム
      `.trim(),
      html: `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #333;">ファイル送信</h2>
  <p>ファイルを添付でお送りします。</p>
  
  <div style="background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
    <p><strong>ファイル名:</strong> ${fileName}</p>
    <p><strong>サイズ:</strong> ${(fileContent.length / 1024).toFixed(2)} KB</p>
  </div>
  
  <p style="color: #666; font-size: 14px;">
    ※このメールに心当たりがない場合は、送信者にお問い合わせください。
  </p>
  
  <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
  <p style="color: #999; font-size: 12px; text-align: center;">
    138DataGate - 安全なファイル受け渡しシステム
  </p>
</div>
      `.trim(),
      attachments: [
        {
          content: base64Content,
          filename: fileName,
          type: mimeType,
          disposition: 'attachment'
        }
      ]
    };
    
    const [response] = await sgMail.send(msg);
    
    console.log('[EmailService] File sent as attachment successfully:', {
      statusCode: response.statusCode,
      messageId: response.headers['x-message-id']
    });
    
    return {
      success: true,
      messageId: response.headers['x-message-id'],
      statusCode: response.statusCode
    };
  } catch (error) {
    console.error('[EmailService] Send attachment failed:', error);
    
    if (error.response) {
      console.error('[EmailService] SendGrid error details:', {
        statusCode: error.response.statusCode,
        body: error.response.body
      });
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}