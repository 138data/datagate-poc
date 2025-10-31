const nodemailer = require('nodemailer');
require('dotenv').config({ path: '.env.local' });

async function testGmail() {
    console.log('🔐 Gmail接続テスト開始...');
    console.log('User:', process.env.SMTP_USER);
    console.log('Pass:', '***' + process.env.SMTP_PASS.slice(-4));
    
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
    
    try {
        // 接続確認
        await transporter.verify();
        console.log('✅ Gmail接続成功！');
        
        // テストメール送信
        const info = await transporter.sendMail({
            from: '"DataGate Test" <138data@gmail.com>',
            to: '138data@gmail.com',
            subject: 'DataGate Gmail Test - ' + new Date().toLocaleTimeString(),
            text: 'Gmail接続テスト成功！DataGate SMTPシステムが正常に動作しています。',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #48bb78;">✅ Gmail設定成功！</h2>
                    <p>DataGate SMTPシステムのGmail接続が正常に動作しています。</p>
                    <p>時刻: ${new Date().toLocaleString('ja-JP')}</p>
                </div>
            `
        });
        
        console.log('✅ メール送信成功！');
        console.log('Message ID:', info.messageId);
        console.log('Response:', info.response);
        console.log('\n📧 138data@gmail.com の受信トレイを確認してください！');
        
    } catch (error) {
        console.error('❌ エラー:', error.message);
    }
}

testGmail();
