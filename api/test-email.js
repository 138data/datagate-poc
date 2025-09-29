// メール送信テスト用API
const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    try {
        // Gmail設定
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: '138data@gmail.com',
                pass: 'xaov vyif bulp rxnl'
            }
        });
        
        // テストメール送信
        const info = await transporter.sendMail({
            from: '138data@gmail.com',
            to: req.query.email || '138data@gmail.com',
            subject: 'DataGate テストメール',
            text: 'これはテストメールです。OTP: 123456',
            html: '<h1>DataGate Test</h1><p>OTP: <strong>123456</strong></p>'
        });
        
        res.json({
            success: true,
            messageId: info.messageId,
            accepted: info.accepted,
            response: info.response
        });
        
    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: error.code,
            command: error.command
        });
    }
};