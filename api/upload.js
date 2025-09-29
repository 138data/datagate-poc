// DataGate Upload API - メール送信対応版
const crypto = require('crypto');

// メール送信モジュールをインポート（エラー処理付き）
let sendOTPEmail;
try {
    const emailModule = require('./send-email');
    sendOTPEmail = emailModule.sendOTPEmail;
} catch (e) {
    console.log('Email module not loaded:', e.message);
    sendOTPEmail = null;
}

// グローバルストレージ
global.fileStorage = global.fileStorage || new Map();

// テストファイルを常に利用可能に
if (!global.fileStorage.has('test123')) {
    global.fileStorage.set('test123', {
        fileName: 'test-file.txt',
        fileData: Buffer.from('This is a test file content'),
        fileSize: 27,
        mimeType: 'text/plain',
        otp: '123456',
        uploadTime: new Date().toISOString(),
        downloadCount: 0,
        maxDownloads: 100,
        recipientEmail: 'test@example.com'
    });
    console.log('Test file created with ID: test123');
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use POST.'
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
        const bodyString = buffer.toString();
        
        // デフォルト値
        let fileName = 'uploaded-file.dat';
        let recipientEmail = '';
        let fileData = buffer;
        
        // マルチパートデータの解析
        const boundary = req.headers['content-type']?.split('boundary=')[1];
        
        if (boundary) {
            const parts = bodyString.split(`--${boundary}`);
            
            for (const part of parts) {
                // メールアドレスの取得
                if (part.includes('name="recipientEmail"')) {
                    const emailMatch = part.match(/\r\n\r\n(.+)\r\n/);
                    if (emailMatch) {
                        recipientEmail = emailMatch[1].trim();
                    }
                }
                
                // ファイル名の取得
                if (part.includes('filename="')) {
                    const filenameMatch = part.match(/filename="([^"]+)"/);
                    if (filenameMatch) {
                        fileName = filenameMatch[1];
                    }
                }
            }
        }
        
        // ファイルIDとOTP生成
        const fileId = crypto.randomBytes(16).toString('hex');
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // ファイル情報を保存
        const fileInfo = {
            fileName: fileName,
            fileData: fileData,
            fileSize: fileData.length,
            mimeType: 'application/octet-stream',
            otp: otp,
            recipientEmail: recipientEmail || 'noreply@datagate.com',
            uploadTime: new Date().toISOString(),
            downloadCount: 0,
            maxDownloads: 3,
            expiryTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };
        
        global.fileStorage.set(fileId, fileInfo);
        
        console.log(`[Upload] File saved: ${fileId} - ${fileName}`);
        console.log(`[Upload] OTP: ${otp} for ${recipientEmail}`);
        
        // ダウンロードリンク生成
        const baseUrl = 'https://datagate-poc.vercel.app';
        const downloadLink = `${baseUrl}/download.html?id=${fileId}`;
        
        // メール送信処理
        let emailSent = false;
        let emailError = null;
        
        if (sendOTPEmail && recipientEmail && recipientEmail.includes('@')) {
            try {
                console.log(`[Email] Attempting to send to ${recipientEmail}...`);
                const emailResult = await sendOTPEmail(recipientEmail, otp, fileName, downloadLink);
                
                if (emailResult.success) {
                    emailSent = true;
                    console.log(`[Email] Successfully sent to ${recipientEmail}`);
                } else {
                    emailError = emailResult.error;
                    console.error(`[Email] Failed: ${emailError}`);
                }
            } catch (err) {
                emailError = err.message;
                console.error('[Email] Exception:', err);
            }
        } else {
            console.log('[Email] Skipped - No valid email or module not loaded');
        }
        
        // レスポンス返却
        return res.status(200).json({
            success: true,
            message: emailSent ? 
                'ファイルがアップロードされ、認証コードをメール送信しました' : 
                'ファイルが正常にアップロードされました（メール未送信）',
            fileId: fileId,
            downloadLink: downloadLink,
            otp: otp, // 開発環境用表示
            fileName: fileName,
            fileSize: fileInfo.fileSize,
            expiryDate: fileInfo.expiryTime,
            emailSent: emailSent,
            emailError: emailError,
            recipientEmail: recipientEmail,
            testLink: `${baseUrl}/download.html?id=test123` // テスト用
        });
        
    } catch (error) {
        console.error('[Upload Error]', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Upload failed'
        });
    }
};