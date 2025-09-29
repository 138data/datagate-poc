// DataGate Upload API - Phase 3 完全版（メール送信機能付き）
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');
const Redis = require('@upstash/redis').Redis;

// SendGrid初期化
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('[SendGrid] APIキー設定完了');
} else {
    console.warn('[SendGrid] APIキーが設定されていません');
}

// Redis初期化
let redis;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log('[Redis] 接続設定完了');
}

// メール送信関数
async function sendOTPEmail(recipientEmail, otp, fileName, fileId, downloadLink) {
    if (!process.env.SENDGRID_API_KEY) {
        console.log('[Email] SendGrid未設定のため、メール送信をスキップ');
        return false;
    }

    const msg = {
        to: recipientEmail,
        from: process.env.SENDER_EMAIL || '138data@gmail.com',
        subject: '【DataGate】ファイルダウンロード通知',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
                    <h1 style="color: white; margin: 0; text-align: center;">🔐 DataGate</h1>
                    <p style="color: white; text-align: center; margin-top: 10px;">セキュアファイル転送サービス</p>
                </div>
                
                <div style="background: #f8f9fa; padding: 30px; border: 1px solid #dee2e6;">
                    <h2 style="color: #333; margin-bottom: 20px;">ファイルが送信されました</h2>
                    
                    <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                        <p><strong>ファイル名:</strong> ${fileName}</p>
                        <p><strong>ファイルID:</strong> <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">${fileId.substring(0, 16)}...</code></p>
                    </div>
                    
                    <div style="background: #fff3cd; padding: 20px; border-radius: 8px; border: 2px solid #ffc107; text-align: center; margin-bottom: 20px;">
                        <p style="margin: 0; color: #856404;"><strong>ワンタイムパスワード (OTP)</strong></p>
                        <div style="font-size: 36px; font-weight: bold; color: #dc3545; letter-spacing: 8px; margin: 15px 0;">
                            ${otp}
                        </div>
                        <p style="margin: 0; color: #856404; font-size: 14px;">このコードはダウンロード時に必要です</p>
                    </div>
                    
                    <div style="text-align: center; margin-bottom: 20px;">
                        <a href="${downloadLink}" style="display: inline-block; background: #667eea; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                            📥 ダウンロードページを開く
                        </a>
                    </div>
                    
                    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px;">
                        <p style="margin: 0; font-size: 14px; color: #666;">
                            <strong>ご注意:</strong><br>
                            • ダウンロードは3回まで可能です<br>
                            • ファイルは7日間保存されます<br>
                            • OTPは他人に教えないでください
                        </p>
                    </div>
                </div>
                
                <div style="background: #343a40; color: #adb5bd; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
                    <p style="margin: 0; font-size: 12px;">
                        © 2025 DataGate - Secure File Transfer<br>
                        このメールは自動送信されています
                    </p>
                </div>
            </div>
        `
    };

    try {
        await sgMail.send(msg);
        console.log(`[Email] メール送信成功: ${recipientEmail}`);
        return true;
    } catch (error) {
        console.error('[Email] メール送信エラー:', error.response?.body || error.message);
        return false;
    }
}

// ファイルアップロード処理
module.exports = async (req, res) => {
    // CORS設定
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
        // リクエストボディの処理
        const chunks = [];
        let totalSize = 0;
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        
        await new Promise((resolve, reject) => {
            req.on('data', chunk => {
                totalSize += chunk.length;
                if (totalSize > MAX_FILE_SIZE) {
                    reject(new Error('ファイルサイズが10MBを超えています'));
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', resolve);
            req.on('error', reject);
        });
        
        const buffer = Buffer.concat(chunks);
        const bodyString = buffer.toString();
        
        // マルチパートフォームデータの解析
        let fileName = 'uploaded-file';
        let fileData = buffer;
        let recipientEmail = '';
        let mimeType = 'application/octet-stream';
        
        // Content-Typeからboundaryを取得
        const boundary = req.headers['content-type']?.split('boundary=')[1];
        
        if (boundary) {
            const parts = bodyString.split(`--${boundary}`);
            
            for (const part of parts) {
                if (part.includes('Content-Disposition')) {
                    // ファイル名の取得
                    const filenameMatch = part.match(/filename="([^"]+)"/);
                    if (filenameMatch) {
                        fileName = filenameMatch[1];
                        
                        // MIMEタイプの取得
                        const mimeMatch = part.match(/Content-Type:\s*([^\r\n]+)/);
                        if (mimeMatch) {
                            mimeType = mimeMatch[1];
                        }
                        
                        // ファイルデータの取得
                        const dataStart = part.indexOf('\r\n\r\n') + 4;
                        const dataEnd = part.lastIndexOf('\r\n');
                        
                        if (dataStart > 3 && dataEnd > dataStart) {
                            const startIndex = bodyString.indexOf(part) + dataStart;
                            const endIndex = bodyString.indexOf(part) + dataEnd;
                            fileData = buffer.slice(startIndex, endIndex);
                        }
                    }
                    
                    // メールアドレスの取得
                    if (part.includes('name="recipientEmail"')) {
                        const emailMatch = part.match(/\r\n\r\n(.+)\r\n/);
                        if (emailMatch) {
                            recipientEmail = emailMatch[1].trim();
                        }
                    }
                }
            }
        }
        
        // ファイルID とOTP生成
        const fileId = crypto.randomBytes(32).toString('hex');
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // ファイル情報
        const fileInfo = {
            fileName: fileName,
            fileData: fileData.toString('base64'), // Base64エンコード
            fileSize: fileData.length,
            mimeType: mimeType,
            otp: otp,
            recipientEmail: recipientEmail || 'noreply@datagate.com',
            uploadTime: new Date().toISOString(),
            downloadCount: 0,
            maxDownloads: 3,
            expiryTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };
        
        // Redisに保存
        if (redis) {
            try {
                await redis.set(`file:${fileId}`, JSON.stringify(fileInfo), {
                    ex: 7 * 24 * 60 * 60 // 7日間
                });
                console.log(`[Redis] ファイル保存成功: ${fileId}`);
            } catch (error) {
                console.error('[Redis] 保存エラー:', error);
                // Redisエラーでも処理は継続
            }
        } else {
            console.log('[Redis] 接続なし - ファイルは一時的にしか保存されません');
        }
        
        // ダウンロードリンク生成
        const baseUrl = process.env.BASE_URL || 'https://datagate-poc.vercel.app';
        const downloadLink = `${baseUrl}/download.html?id=${fileId}`;
        
        // メール送信（非同期で実行）
        let emailSent = false;
        if (recipientEmail && recipientEmail.includes('@')) {
            emailSent = await sendOTPEmail(
                recipientEmail,
                otp,
                fileName,
                fileId,
                downloadLink
            );
        }
        
        // レスポンス
        const response = {
            success: true,
            message: emailSent 
                ? 'ファイルがアップロードされ、メールが送信されました' 
                : 'ファイルがアップロードされました（メール送信はスキップ）',
            fileId: fileId,
            downloadLink: downloadLink,
            fileName: fileName,
            fileSize: fileInfo.fileSize,
            expiryDate: fileInfo.expiryTime,
            emailSent: emailSent
        };
        
        // メール送信に失敗した場合、OTPを画面に表示（開発/テスト用）
        if (!emailSent) {
            response.otp = otp;
            response.testMode = true;
            response.hint = 'メールが送信されなかったため、OTPを画面に表示しています';
        }
        
        console.log(`[Upload] 完了 - ID: ${fileId}, Email: ${emailSent ? '送信済み' : 'スキップ'}`);
        
        return res.status(200).json(response);
        
    } catch (error) {
        console.error('[Upload Error]', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'アップロードに失敗しました'
        });
    }
};
