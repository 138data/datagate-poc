import nodemailer from 'nodemailer';

// SMTP設定
const smtpConfig = {
  host: process.env.SES_SMTP_HOST,
  port: process.env.SES_SMTP_PORT ? parseInt(process.env.SES_SMTP_PORT, 10) : 587,
  // Vercelの環境変数はすべて文字列になるため、厳密に '465' と比較
  secure: process.env.SES_SMTP_PORT === '465', // true for 465, false for 587
  auth: {
    user: process.env.SES_SMTP_USER,
    pass: process.env.SES_SMTP_PASS,
  },
};

// ファイルサイズを読みやすい形式にフォーマット
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  try {
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  } catch (e) {
    return `${bytes} Bytes`;
  }
}

// ★ ESMの export 構文
export async function sendFileNotification(options) {
  const { to, from, subject, message, filename, fileSize, downloadUrl, expiresAt } = options;

  let transporter;
  try {
    transporter = nodemailer.createTransport(smtpConfig);
    // SMTP接続のテスト
    await transporter.verify();
  } catch (verifyError) {
    console.error('SMTP Transport configuration or connection error:', verifyError);
    // verifyError.code === 'EAUTH' の場合、認証情報（USER/PASS）が間違っている
    throw new Error(`SMTP verify failed: ${verifyError.message}`);
  }

  const text = `
${from} 様からファイルが届いています。

メッセージ:
${message || 'なし'}

ファイル名: ${filename}
サイズ: ${formatFileSize(fileSize)}

ダウンロードURL: ${downloadUrl}

有効期限: ${new Date(expiresAt).toLocaleString('ja-JP')}
`;

  const html = `
<p>${from} 様からファイルが届いています。</p>

<p><b>メッセージ:</b><br/>${message ? message.replace(/\n/g, '<br/>') : 'なし'}</p>

<hr/>
<p><b>ファイル名:</b> ${filename}</p>
<p><b>サイズ:</b> ${formatFileSize(fileSize)}</p>
<p><b>ダウンロードURL:</b> <a href="${downloadUrl}">${downloadUrl}</a></p>
<p><b>有効期限:</b> ${new Date(expiresAt).toLocaleString('ja-JP')}</p>
<hr/>
<p style="font-size:12px; color:#888;">
  このメールは DataGate (datagate-poc.vercel.app) を通じて送信されました。
  送信元メールアドレス (${from}) への返信は、受信者 (${to}) には届きません。
</p>
`;

  try {
    await transporter.sendMail({
      from: `"DataGate (via Vercel)" <${process.env.SES_FROM_EMAIL}>`, // 送信元（SESで検証済みの固定アドレス）
      replyTo: from, // ユーザーが「返信」を押したときの宛先
      to: to, // 宛先
      subject: subject, // 件名
      text: text,
      html: html,
    });
  } catch (sendError) {
    console.error('Email sendMail failed:', sendError);
    throw new Error(`Email sendMail failed: ${sendError.message}`);
  }
}