// lib/services/notificationService.js

/**
 * 開封通知メールを送信
 * @param {Object} params - 通知パラメータ
 * @param {string} params.senderEmail - 送信者メールアドレス
 * @param {string} params.recipientEmail - 受信者メールアドレス
 * @param {string} params.fileName - ファイル名
 * @param {string} params.downloadedAt - ダウンロード日時
 * @param {string} params.downloadIp - ダウンロード元IP
 * @param {string} params.fileId - ファイルID
 * @returns {Promise<void>}
 */
export async function sendDownloadNotification({
  senderEmail,
  recipientEmail,
  fileName,
  downloadedAt,
  downloadIp,
  fileId,
}) {
  // SendGrid APIキー（環境変数から取得）
  const apiKey = process.env.SENDGRID_API_KEY;
  
  if (!apiKey) {
    console.error('❌ SENDGRID_API_KEY が設定されていません');
    throw new Error('SendGrid API key is not configured');
  }
  
  // 開封通知メール本文
  const emailBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .info-box { background: white; padding: 20px; margin: 20px 0; border-left: 4px solid #667eea; border-radius: 5px; }
    .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
    .info-label { font-weight: bold; color: #667eea; }
    .info-value { color: #555; }
    .manage-button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📬 ファイルがダウンロードされました</h1>
    </div>
    <div class="content">
      <p>こんにちは、</p>
      <p>送信したファイルが受信者によってダウンロードされました。</p>
      
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">📄 ファイル名:</span>
          <span class="info-value">${fileName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">📧 受信者:</span>
          <span class="info-value">${recipientEmail}</span>
        </div>
        <div class="info-row">
          <span class="info-label">⏰ ダウンロード日時:</span>
          <span class="info-value">${new Date(downloadedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</span>
        </div>
        <div class="info-row">
          <span class="info-label">🌐 ダウンロード元IP:</span>
          <span class="info-value">${downloadIp}</span>
        </div>
      </div>
      
      <p>ファイルを今すぐ削除したい場合は、下記のリンクから管理画面にアクセスしてください。</p>
      
      <center>
        <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/manage/${fileId}" class="manage-button">
          🔒 ファイルを管理する
        </a>
      </center>
      
      <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px;">
        ※ ファイルは7日後に自動削除されます。<br>
        ※ このメールに心当たりがない場合は、削除してください。
      </p>
    </div>
    <div class="footer">
      <p>DataGate - Secure File Transfer System</p>
      <p>© 2025 138Data. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
  
  // SendGrid API呼び出し
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: senderEmail }],
          subject: `[DataGate] ファイルがダウンロードされました - ${fileName}`,
        },
      ],
      from: {
        email: 'datagate@138io.com',
        name: 'DataGate System',
      },
      content: [
        {
          type: 'text/html',
          value: emailBody,
        },
      ],
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ SendGrid API エラー:', errorText);
    throw new Error(`Failed to send notification: ${response.status}`);
  }
  
  console.log('✅ 開封通知メール送信成功:', senderEmail);
}

/**
 * 削除通知メールを送信
 * @param {Object} params - 通知パラメータ
 * @param {string} params.senderEmail - 送信者メールアドレス
 * @param {string} params.fileName - ファイル名
 * @param {string} params.deletedBy - 削除者
 * @returns {Promise<void>}
 */
export async function sendDeletionNotification({
  senderEmail,
  fileName,
  deletedBy,
}) {
  const apiKey = process.env.SENDGRID_API_KEY;
  
  if (!apiKey) {
    console.error('❌ SENDGRID_API_KEY が設定されていません');
    throw new Error('SendGrid API key is not configured');
  }
  
  const deleteReasonText = {
    'sender': 'あなたが削除しました',
    'auto': '7日間の保持期間が経過したため自動削除されました',
    'admin': '管理者によって削除されました',
  }[deletedBy] || '削除されました';
  
  const emailBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .info-box { background: white; padding: 20px; margin: 20px 0; border-left: 4px solid #f5576c; border-radius: 5px; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🗑️ ファイルが削除されました</h1>
    </div>
    <div class="content">
      <p>こんにちは、</p>
      <p>以下のファイルが削除されました。</p>
      
      <div class="info-box">
        <p><strong>📄 ファイル名:</strong> ${fileName}</p>
        <p><strong>🔐 削除理由:</strong> ${deleteReasonText}</p>
        <p><strong>⏰ 削除日時:</strong> ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
      </div>
      
      <p style="color: #666; font-size: 14px;">
        ※ このメールは情報提供のみです。アクションは不要です。
      </p>
    </div>
    <div class="footer">
      <p>DataGate - Secure File Transfer System</p>
      <p>© 2025 138Data. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
  
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: senderEmail }],
          subject: `[DataGate] ファイルが削除されました - ${fileName}`,
        },
      ],
      from: {
        email: 'datagate@138io.com',
        name: 'DataGate System',
      },
      content: [
        {
          type: 'text/html',
          value: emailBody,
        },
      ],
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ SendGrid API エラー:', errorText);
    throw new Error(`Failed to send deletion notification: ${response.status}`);
  }
  
  console.log('✅ 削除通知メール送信成功:', senderEmail);
}