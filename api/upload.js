const multer = require('multer');
const crypto = require('crypto');

// グローバルストレージ
global.fileStore = global.fileStore || new Map();
global.otpStore = global.otpStore || new Map();

const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 4 * 1024 * 1024 }
}).single('file');

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateFileId() {
    return crypto.randomBytes(16).toString('hex');
}

// SendGrid設定（オプション）
let sgMail = null;
try {
    sgMail = require('@sendgrid/mail');
    if (process.env.SENDGRID_API_KEY) {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        console.log('SendGrid configured');
    }
} catch (e) {
    console.log('SendGrid not configured - showing OTP on screen');
}

async function sendNotificationEmail(email, otp, link) {
    if (!sgMail || !process.env.SENDGRID_API_KEY) {
        return; // SendGridが設定されていない場合はスキップ
    }
    
    try {
        const msg = {
            to: email,
            from: process.env.EMAIL_FROM || 'noreply@datagate.com',
            subject: '[DataGate] ファイルが届いています',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">DataGate - セキュアファイル転送</h2>
                    <p>ファイルが届いています。以下の認証コードを使用してダウンロードしてください。</p>
                    <div style="background: #f5f5f5; padding: 20px; margin: 20px 0; text-align: center;">
                        <p>認証コード（OTP）</p>
                        <div style="font-size: 32px; font-weight: bold; color: #e74c3c; letter-spacing: 5px;">
                            ${otp}
                        </div>
                    </div>
                    <p>ダウンロードリンク:</p>
                    <a href="${link}" style="color: #667eea;">${link}</a>
                </div>
            `,
            text: `DataGate - ファイルが届いています\n\n認証コード: ${otp}\nダウンロード: ${link}`
        };
        
        await sgMail.send(msg);
        console.log('Email sent to:', email);
    } catch (error) {
        console.error('Email send error:', error.message);
    }
}

module.exports = async (req, res) => {
    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    upload(req, res, async (err) => {
        if (err) {
            console.error('Upload error:', err);
            return res.status(400).json({ 
                success: false, 
                error: 'ファイルのアップロードに失敗しました' 
            });
        }
        
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'ファイルが選択されていません' 
            });
        }
        
        const fileId = generateFileId();
        const otp = generateOTP();
        const recipientEmail = req.body.recipientEmail;
        
        // ファイル情報を保存
        global.fileStore.set(fileId, {
            buffer: req.file.buffer,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
            downloadCount: 0,
            maxDownloads: 3
        });
        
        global.otpStore.set(fileId, otp);
        
        // 24時間後に自動削除
        setTimeout(() => {
            global.fileStore.delete(fileId);
            global.otpStore.delete(fileId);
        }, 24 * 60 * 60 * 1000);
        
        const downloadLink = `https://datagate-poc.vercel.app/download/${fileId}`;
        
        // メール送信（設定されている場合）
        if (recipientEmail && recipientEmail.includes('@')) {
            sendNotificationEmail(recipientEmail, otp, downloadLink).catch(console.error);
        }
        
        console.log(`File uploaded: ${fileId}, OTP: ${otp}`);
        
        res.status(200).json({
            success: true,
            fileId: fileId,
            otp: otp,
            downloadLink: downloadLink,
            message: 'ファイルがアップロードされました'
        });
    });
};
