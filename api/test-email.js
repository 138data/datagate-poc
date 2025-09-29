module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle OPTIONS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const recipientEmail = req.query.email || '138data@gmail.com';
    
    try {
        // nodemailerを動的にロード
        const nodemailer = require('nodemailer');
        
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: '138data@gmail.com',
                pass: 'xaov vyif bulp rxnl'
            }
        });
        
        const mailOptions = {
            from: '138data@gmail.com',
            to: recipientEmail,
            subject: 'DataGate Test Mail',
            text: 'Test OTP: 123456',
            html: '<h2>DataGate Test</h2><p>OTP: <b>123456</b></p>'
        };
        
        const info = await transporter.sendMail(mailOptions);
        
        return res.status(200).json({
            success: true,
            message: 'Email sent successfully',
            messageId: info.messageId,
            to: recipientEmail
        });
        
    } catch (error) {
        console.error('Email error:', error);
        return res.status(200).json({
            success: false,
            error: error.message,
            to: recipientEmail
        });
    }
};