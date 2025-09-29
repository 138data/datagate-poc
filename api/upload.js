const crypto = require('crypto');
const nodemailer = require('nodemailer');

// グローバルストレージ
if (!global.dataGateStorage) {
    global.dataGateStorage = new Map();
    // テストファイル
    global.dataGateStorage.set('test123', {
        fileName: 'test-file.txt',
        fileData: Buffer.from('This is a test file content'),
        otp: '123456',
        downloadCount: 0,
        maxDownloads: 100
    });
}

// Gmail SMTP設定
const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: '138data@gmail.com',
        pass: 'xaov vyif bulp rxnl'  // 提供されたアプリパスワード
    }
});

async function sendOTPEmail(email, otp, fileName, downloadLink) {
    try {
        const info = await transporter.sendMail({
            from: '"DataGate System" <138data@gmail.com>',
            to: email,
            subject: '【DataGate】ファイルダウンロード通知',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #667eea; padding: 30px; text-align: center;">
                        <h1 style="color: white; margin: 0;">DataGate</h1>
                    </div>
                    <div style="padding: 30px; background: #f8f9fa;">
                        <h2 style="color: #333;">ファイルが共有されました</h2>
                        <p><strong>ファイル名:</strong> ${fileName}</p>
                        
                        <div style="background: #fff3cd; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px;">
                            <p style="margin: 0; color: #856404;">ワンタイムパスワード (OTP)</p>
                            <div style="font-size: 36px; font-weight: bold; color: #dc3545; letter-spacing: 8px; margin: 10px 0;">
                                ${otp}
                            </div>
                        </div>
                        
                        <div style="text-align: center; margin: 20px 0;">
                            <a href="${downloadLink}" style="background: #667eea; color: white; padding: 15px 40px; text-decoration: none; display: inline-block; border-radius: 8px;">
                                ダウンロードページへ
                            </a>
                        </div>
                        
                        <p style="color: #666; font-size: 14px;">
                            ※ ダウンロードは最大3回まで可能です<br>
                            ※ OTPは他人に教えないでください
                        </p>
                    </div>
                </div>
            `
        });
        console.log('Email sent:', info.messageId);
        return true;
    } catch (error) {
        console.error('Email error:', error);
        return false;
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    
    try {
        const chunks = [];
        let totalSize = 0;
        
        await new Promise((resolve, reject) => {
            req.on('data', chunk => {
                totalSize += chunk.length;
                if (totalSize > 10485760) reject(new Error('File too large'));
                chunks.push(chunk);
            });
            req.on('end', resolve);
        });
        
        const buffer = Buffer.concat(chunks);
        const bodyString = buffer.toString();
        
        // フォームデータから情報抽出
        let fileName = 'uploaded-file.dat';
        let recipientEmail = '';
        let fileData = buffer;
        
        // メールアドレスの抽出
        const emailMatch = bodyString.match(/name="recipientEmail"[^>]*\r\n\r\n([^\r\n]+)/);
        if (emailMatch) recipientEmail = emailMatch[1].trim();
        
        // ファイル名の抽出
        const filenameMatch = bodyString.match(/filename="([^"]+)"/);
        if (filenameMatch) fileName = filenameMatch[1];
        
        const fileId = crypto.randomBytes(8).toString('hex');
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // ストレージに保存
        global.dataGateStorage.set(fileId, {
            fileName: fileName,
            fileData: fileData,
            otp: otp,
            downloadCount: 0,
            maxDownloads: 3,
            uploadTime: Date.now()
        });
        
        console.log(`File stored: ${fileId}, Email: ${recipientEmail}`);
        
        const downloadLink = `https://datagate-poc.vercel.app/download.html?id=${fileId}`;
        
        // メール送信
        let emailSent = false;
        if (recipientEmail && recipientEmail.includes('@')) {
            emailSent = await sendOTPEmail(recipientEmail, otp, fileName, downloadLink);
        }
        
        return res.status(200).json({
            success: true,
            fileId: fileId,
            downloadLink: downloadLink,
            fileName: fileName,
            otp: emailSent ? undefined : otp,
            message: emailSent ? 
                `メールを ${recipientEmail} に送信しました` : 
                'メール送信をスキップしました（OTPは画面に表示）',
            emailSent: emailSent
        });
        
    } catch (error) {
        console.error('[Upload Error]', error);
        return res.status(500).json({ error: error.message });
    }
};
