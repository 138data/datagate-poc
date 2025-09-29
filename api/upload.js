const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');
const Redis = require('@upstash/redis').Redis;

// SendGrid初期化
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('[SendGrid] API key configured');
} else {
    console.warn('[SendGrid] API key not configured');
}

// Redis初期化
let redis;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log('[Redis] Connected');
}

// メール送信関数
async function sendOTPEmail(recipientEmail, otp, fileName, fileId, downloadLink) {
    if (!process.env.SENDGRID_API_KEY) {
        console.log('[Email] SendGrid not configured, skipping email');
        return false;
    }

    const msg = {
        to: recipientEmail,
        from: process.env.SENDER_EMAIL || '138data@gmail.com',
        subject: '[DataGate] File Download Notification',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #667eea; padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">DataGate</h1>
                    <p style="color: white;">Secure File Transfer</p>
                </div>
                <div style="background: #f8f9fa; padding: 30px;">
                    <h2>File Ready for Download</h2>
                    <p><strong>File Name:</strong> ${fileName}</p>
                    <p><strong>File ID:</strong> ${fileId.substring(0, 16)}...</p>
                    <div style="background: #fff3cd; padding: 20px; margin: 20px 0; text-align: center;">
                        <p><strong>Your OTP Code:</strong></p>
                        <div style="font-size: 36px; font-weight: bold; color: #dc3545; letter-spacing: 8px;">
                            ${otp}
                        </div>
                    </div>
                    <div style="text-align: center;">
                        <a href="${downloadLink}" style="background: #667eea; color: white; padding: 15px 40px; text-decoration: none; display: inline-block;">
                            Download File
                        </a>
                    </div>
                    <div style="margin-top: 20px; padding: 15px; background: #f0f0f0;">
                        <p><strong>Notice:</strong></p>
                        <ul>
                            <li>Maximum 3 downloads allowed</li>
                            <li>File expires in 7 days</li>
                            <li>Keep OTP confidential</li>
                        </ul>
                    </div>
                </div>
            </div>
        `
    };

    try {
        await sgMail.send(msg);
        console.log(`[Email] Sent successfully to: ${recipientEmail}`);
        return true;
    } catch (error) {
        console.error('[Email] Send error:', error.message);
        return false;
    }
}

// メイン処理
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
            error: 'Method not allowed'
        });
    }
    
    try {
        const chunks = [];
        let totalSize = 0;
        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        
        await new Promise((resolve, reject) => {
            req.on('data', chunk => {
                totalSize += chunk.length;
                if (totalSize > MAX_FILE_SIZE) {
                    reject(new Error('File size exceeds 10MB'));
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', resolve);
            req.on('error', reject);
        });
        
        const buffer = Buffer.concat(chunks);
        const bodyString = buffer.toString();
        
        let fileName = 'uploaded-file';
        let fileData = buffer;
        let recipientEmail = '';
        let mimeType = 'application/octet-stream';
        
        const boundary = req.headers['content-type']?.split('boundary=')[1];
        
        if (boundary) {
            const parts = bodyString.split(`--${boundary}`);
            
            for (const part of parts) {
                if (part.includes('Content-Disposition')) {
                    const filenameMatch = part.match(/filename="([^"]+)"/);
                    if (filenameMatch) {
                        fileName = filenameMatch[1];
                        
                        const mimeMatch = part.match(/Content-Type:\s*([^\r\n]+)/);
                        if (mimeMatch) {
                            mimeType = mimeMatch[1];
                        }
                        
                        const dataStart = part.indexOf('\r\n\r\n') + 4;
                        const dataEnd = part.lastIndexOf('\r\n');
                        
                        if (dataStart > 3 && dataEnd > dataStart) {
                            const startIndex = bodyString.indexOf(part) + dataStart;
                            const endIndex = bodyString.indexOf(part) + dataEnd;
                            fileData = buffer.slice(startIndex, endIndex);
                        }
                    }
                    
                    if (part.includes('name="recipientEmail"')) {
                        const emailMatch = part.match(/\r\n\r\n(.+)\r\n/);
                        if (emailMatch) {
                            recipientEmail = emailMatch[1].trim();
                        }
                    }
                }
            }
        }
        
        const fileId = crypto.randomBytes(32).toString('hex');
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        const fileInfo = {
            fileName: fileName,
            fileData: fileData.toString('base64'),
            fileSize: fileData.length,
            mimeType: mimeType,
            otp: otp,
            recipientEmail: recipientEmail || 'noreply@datagate.com',
            uploadTime: new Date().toISOString(),
            downloadCount: 0,
            maxDownloads: 3,
            expiryTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };
        
        if (redis) {
            try {
                await redis.set(`file:${fileId}`, JSON.stringify(fileInfo), {
                    ex: 7 * 24 * 60 * 60
                });
                console.log(`[Redis] File saved: ${fileId}`);
            } catch (error) {
                console.error('[Redis] Save error:', error);
            }
        }
        
        const baseUrl = process.env.BASE_URL || 'https://datagate-poc.vercel.app';
        const downloadLink = `${baseUrl}/download.html?id=${fileId}`;
        
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
        
        const response = {
            success: true,
            message: emailSent ? 'File uploaded and email sent' : 'File uploaded (email skipped)',
            fileId: fileId,
            downloadLink: downloadLink,
            fileName: fileName,
            fileSize: fileInfo.fileSize,
            expiryDate: fileInfo.expiryTime,
            emailSent: emailSent
        };
        
        if (!emailSent) {
            response.otp = otp;
            response.testMode = true;
            response.hint = 'Email not sent, showing OTP on screen';
        }
        
        console.log(`[Upload] Complete - ID: ${fileId}, Email: ${emailSent ? 'sent' : 'skipped'}`);
        
        return res.status(200).json(response);
        
    } catch (error) {
        console.error('[Upload Error]', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Upload failed'
        });
    }
};
