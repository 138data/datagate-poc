const nodemailer = require('nodemailer');

console.log('=== Direct Mail Test ===');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: '138data@gmail.com',
    pass: 'vwfpoehwgmckyqek'
  }
});

async function send() {
  try {
    const info = await transporter.sendMail({
      from: '"DataGate" <138data@gmail.com>',
      to: '138data@gmail.com',
      subject: 'Test ' + new Date().toLocaleTimeString(),
      html: '<h1>テスト成功！</h1><p>このメールが見えれば設定OK</p>'
    });
    
    console.log('✅ SUCCESS! メール送信完了');
    console.log('Message ID:', info.messageId);
    console.log('Gmailを確認してください！');
  } catch (error) {
    console.log('❌ FAILED:', error.message);
    if (error.message.includes('Invalid login')) {
      console.log('→ アプリパスワードを確認してください');
    }
  }
}

send();