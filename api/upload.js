// DataGate Upload API - メール送信対応版
const crypto = require('crypto');

// グローバルストレージ
global.fileStorage = global.fileStorage || new Map();

// テストファイル
if (!global.fileStorage.has('test123')) {
    global.fileStorage.set('test123', {
        fileName: 'test-file.txt',
        fileData: Buffer.from('This is a test file content'),
        fileSize: 27,
        mimeType: 'text/plain',
        otp: '123456',
        uploadTime: new Date().toISOString(),
        downloadCount: 0,
        maxDownloads: 100
    });
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // メールテストモード（GET: /api/upload?test=email）
    if (req.method === 'GET' && req.query.test === 'email') {
        const testEmail = req.query.email || '138data@gmail.com';
        
        console.log('[EmailTest] Starting email test to:', testEmail);
        
        try {
            const nodemailer = require('nodemailer');
            
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: '138data@gmail.com',
                    pass: 'xaov vyif bulp rxnl'
                }
            });
            
            const info = await transporter.sendMail({
                from: '138data@gmail.com',
                to: testEmail,
                subject: 'DataGate メールテスト - ' + new Date().toLocaleString('ja-JP'),
                text: 'DataGateのテストメールです。\n\nテストOTP: 123456\n\nこのメールが届いていればメール送信機能は正常です。',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                            <h1 style="color: white; margin: 0;">🔐 DataGate</h1>
                            <p style="color: white; margin: 10px 0 0 0;">メール送信テスト</p>
                        </div>
                        
                        <div style="padding: 30px; background: #f9f9f9;">
                            <h2 style="color: #333;">メールテスト成功！</h2>
                            
                            <p style="color: #666; line-height: 1.6;">
                                このメールが届いていれば、DataGateのメール送信機能は正常に動作しています。
                            </p>
                            
                            <div style="background: #fff3cd; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0; border: 2px solid #ffc107;">
                                <p style="margin: 0; color: #856404; font-size: 14px;">テスト用OTP</p>
                                <h1 style="color: #e74c3c; font-size: 48px; letter-spacing: 10px; margin: 10px 0;">123456</h1>
                            </div>
                            
                            <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                <p style="margin: 5px 0;"><strong>送信時刻:</strong> ${new Date().toLocaleString('ja-JP')}</p>
                                <p style="margin: 5px 0;"><strong>送信先:</strong> ${testEmail}</p>
                                <p style="margin: 5px 0;"><strong>送信元:</strong> 138data@gmail.com</p>
                            </div>
                            
                            <div style="background: #d1ecf1; padding: 15px; border-radius: 8px; border: 1px solid #bee5eb;">
                                <p style="color: #0c5460; margin: 0;">
                                    ✅ Gmail SMTP設定: 正常<br>
                                    ✅ nodemailer: 動作中<br>
                                    ✅ Vercel Functions: 正常
                                </p>
                            </div>
                        </div>
                        
                        <div style="background: #333; padding: 20px; text-align: center; color: #999; font-size: 12px; border-radius: 0 0 10px 10px;">
                            <p style="margin: 0;">© 2025 DataGate - Phase 4 Email Implementation</p>
                        </div>
                    </div>
                `
            });
            
            console.log('[EmailTest] Success:', info.messageId);
            
            return res.status(200).json({
                success: true,
                message: 'メール送信成功',
                messageId: info.messageId,
                accepted: info.accepted,
                to: testEmail,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('[EmailTest] Error:', error);
            return res.status(200).json({
                success: false,
                error: error.message,
                code: error.code,
                to: testEmail,
                hint: 'Gmailの設定を確認してください'
            });
        }
    }
    
    // 通常のアップロード処理（POST）
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use POST for upload, GET with ?test=email for email test.'
        });
    }
    
    try {
        const chunks = [];
        let totalSize = 0;
        
        await new Promise((resolve, reject) => {
            req.on('data', chunk => {
                totalSize += chunk.length;
                if (totalSize > MAX_FILE_SIZE) {
                    reject(new Error('File size exceeds 10MB limit'));
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', resolve);
            req.on('error', reject);
        });
        
        const buffer = Buffer.concat(chunks);
        const fileId = crypto.randomBytes(16).toString('hex');
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        global.fileStorage.set(fileId, {
            fileName: 'uploaded-file.dat',
            fileData: buffer,
            fileSize: buffer.length,
            mimeType: 'application/octet-stream',
            otp: otp,
            uploadTime: new Date().toISOString(),
            downloadCount: 0,
            maxDownloads: 3
        });
        
        const baseUrl = 'https://datagate-poc.vercel.app';
        const downloadLink = `${baseUrl}/download.html?id=${fileId}`;
        
        return res.status(200).json({
            success: true,
            message: 'ファイルが正常にアップロードされました',
            fileId: fileId,
            downloadLink: downloadLink,
            otp: otp,
            fileName: 'uploaded-file.dat',
            fileSize: buffer.length
        });
        
    } catch (error) {
        console.error('[Upload Error]', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Upload failed'
        });
    }
};
