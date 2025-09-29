// DataGate Upload API v4 - メールテスト機能付き
const crypto = require('crypto');

// グローバルストレージ
global.fileStorage = global.fileStorage || new Map();

// テストファイル初期化
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
    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // OPTIONSリクエスト処理
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // GETリクエスト: メールテスト機能
    if (req.method === 'GET') {
        // メールテストモード確認
        if (req.query.test === 'email') {
            const testEmail = req.query.email || '138data@gmail.com';
            
            console.log('[EmailTest] Attempting to send email to:', testEmail);
            
            try {
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
                    to: testEmail,
                    subject: 'DataGate テストメール ' + new Date().toLocaleString('ja-JP'),
                    text: 'DataGate メールテスト\n\nテストOTP: 123456\n\nこのメールが届いていれば送信機能は正常です。',
                    html: '<div style="font-family:Arial,sans-serif;padding:20px;"><h2 style="color:#667eea;">DataGate メールテスト</h2><p>このメールが届いていれば送信機能は正常です。</p><div style="background:#f0f0f0;padding:20px;margin:20px 0;border-radius:8px;text-align:center;"><p>テストOTP:</p><h1 style="color:#e74c3c;font-size:48px;letter-spacing:10px;">123456</h1></div><p style="color:#666;font-size:12px;">送信時刻: ' + new Date().toLocaleString('ja-JP') + '<br>送信先: ' + testEmail + '</p></div>'
                };
                
                const info = await transporter.sendMail(mailOptions);
                console.log('[EmailTest] Success! MessageId:', info.messageId);
                
                return res.status(200).json({
                    success: true,
                    message: 'メール送信成功',
                    messageId: info.messageId,
                    to: testEmail,
                    timestamp: new Date().toISOString()
                });
                
            } catch (error) {
                console.error('[EmailTest] Error:', error.message);
                return res.status(200).json({
                    success: false,
                    error: error.message,
                    to: testEmail
                });
            }
        }
        
        // 通常のGETリクエスト（情報表示）
        return res.status(200).json({
            success: true,
            message: 'DataGate Upload API v4',
            endpoints: {
                upload: 'POST /api/upload',
                emailTest: 'GET /api/upload?test=email&email=your@email.com'
            }
        });
    }
    
    // POSTリクエスト: ファイルアップロード処理
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use POST for upload or GET with ?test=email for email test.'
        });
    }
    
    // アップロード処理
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
        
        console.log('[Upload] File saved:', fileId);
        
        const baseUrl = 'https://datagate-poc.vercel.app';
        const downloadLink = baseUrl + '/download.html?id=' + fileId;
        
        return res.status(200).json({
            success: true,
            message: 'ファイルアップロード成功',
            fileId: fileId,
            downloadLink: downloadLink,
            otp: otp,
            fileName: 'uploaded-file.dat',
            fileSize: buffer.length
        });
        
    } catch (error) {
        console.error('[Upload] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};