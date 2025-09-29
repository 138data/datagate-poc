// DataGate Email Service
const nodemailer = require('nodemailer');

// Gmail SMTP設定
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: '138data@gmail.com',
    pass: 'xaov vyif bulp rxnl'
  }
});

// OTPメール送信関数
async function sendOTPEmail(recipientEmail, otp, fileName, downloadLink) {
  const mailOptions = {
    from: '138data@gmail.com',
    to: recipientEmail,
    subject: '【DataGate】ファイルダウンロード認証コード',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">🔐 DataGate</h1>
        </div>
        
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333;">認証コード（OTP）のお知らせ</h2>
          
          <p>ファイル名: <strong>${fileName}</strong></p>
          
          <div style="background: #fff3cd; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
            <p style="margin: 0; color: #856404;">認証コード</p>
            <h1 style="color: #e74c3c; font-size: 48px; letter-spacing: 10px; margin: 10px 0;">${otp}</h1>
          </div>
          
          <p>ダウンロードリンク：<br>
          <a href="${downloadLink}">${downloadLink}</a></p>
          
          <p style="color: #666; font-size: 12px;">
            ※ダウンロードは3回まで可能です<br>
            ※7日後に自動削除されます
          </p>
        </div>
      </div>
    `
  };
  
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { sendOTPEmail };