// DataGate SMTP Upload API v3 (Gmail App Password)
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: '.env.local' });

// Global storage
global.fileStorage = global.fileStorage || new Map();

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Recipient-Email, X-Subject, X-Sender-Email, X-Sender-Name, X-Body');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    
    try {
        // Get headers
        const recipientEmail = req.headers['x-recipient-email'];
        const senderEmail = req.headers['x-sender-email'];
        const senderName = req.headers['x-sender-name'] || 'Sender';
        const subject = req.headers['x-subject'] || 'Secure File Transfer';
        const bodyMessage = req.headers['x-body'] || '';
        const uploadToken = req.headers['authorization']?.replace('Bearer ', '');
        
        console.log('[Upload-SMTP] Request received');
        
        // Token validation
        const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN || 'test-upload-token-138data';
        if (uploadToken !== UPLOAD_TOKEN) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        
        // Required parameters
        if (!recipientEmail || !senderEmail) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required headers: X-Recipient-Email and X-Sender-Email' 
            });
        }
        
        // Get file data
        const chunks = [];
        await new Promise((resolve, reject) => {
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', resolve);
            req.on('error', reject);
        });
        
        const fileBuffer = Buffer.concat(chunks);
        const fileId = crypto.randomBytes(16).toString('hex');
        const manageToken = crypto.randomBytes(8).toString('hex');
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save file
        const fileInfo = {
            fileName: 'document.pdf',
            fileData: fileBuffer,
            fileSize: fileBuffer.length,
            mimeType: 'application/octet-stream',
            otp: otp,
            recipientEmail: recipientEmail,
            senderEmail: senderEmail,
            senderName: senderName,
            subject: subject,
            bodyMessage: bodyMessage,
            manageToken: manageToken,
            uploadTime: new Date().toISOString(),
            downloadCount: 0,
            maxDownloads: 3
        };
        
        global.fileStorage.set(fileId, fileInfo);
        console.log(`[Upload-SMTP] File saved: ${fileId}, OTP: ${otp}`);
        
        // URLs
        const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
        const downloadLink = `${baseUrl}/download.html?id=${fileId}`;
        const manageLink = `${baseUrl}/api/delete?id=${fileId}&token=${manageToken}`;
        
        // Gmail transporter with app password
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.SMTP_USER || '138data@gmail.com',
                pass: process.env.SMTP_PASS || 'vwfpoehwgmckyqek'
            }
        });
        
        console.log('[Upload-SMTP] Sending emails via Gmail...');
        
        // Email 1: Download link
        await transporter.sendMail({
            from: '"DataGate System" <138data@gmail.com>',
            to: recipientEmail,
            subject: `[DataGate] ${subject}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 30px; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0;">🔐 セキュアファイル転送</h1>
                    </div>
                    <div style="padding: 30px; background: #f9f9f9;">
                        <p><strong>差出人:</strong> ${senderName} (${senderEmail})</p>
                        <p><strong>件名:</strong> ${subject}</p>
                        ${bodyMessage ? `<p>${bodyMessage}</p>` : ''}
                        
                        <div style="margin: 30px 0; padding: 25px; background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <h2 style="color: #667eea; margin-top: 0;">📥 ファイルダウンロード</h2>
                            <p>以下のボタンからダウンロードページにアクセスしてください：</p>
                            <a href="${downloadLink}" style="display: inline-block; padding: 15px 40px; background: #667eea; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">ダウンロードページへ</a>
                            <p style="margin-top: 20px; color: #e53e3e;">⚠️ ダウンロードにはOTP（ワンタイムパスワード）が必要です</p>
                        </div>
                    </div>
                </div>
            `
        });
        console.log('[Upload-SMTP] Email 1/3 sent');
        
        // Email 2: OTP
        await transporter.sendMail({
            from: '"DataGate Security" <138data@gmail.com>',
            to: recipientEmail,
            subject: '[DataGate] ワンタイムパスワード',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #667eea; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0;">🔑 ワンタイムパスワード</h1>
                    </div>
                    <div style="padding: 40px; background: #f9f9f9; text-align: center;">
                        <p style="font-size: 18px;">ファイルダウンロード用のOTPです：</p>
                        <div style="font-size: 48px; font-weight: bold; color: #667eea; letter-spacing: 8px; margin: 30px 0; padding: 20px; background: white; border-radius: 10px;">
                            ${otp}
                        </div>
                        <p style="color: #666;">このコードは3回まで使用可能です</p>
                    </div>
                </div>
            `
        });
        console.log('[Upload-SMTP] Email 2/3 sent');
        
        // Email 3: Management link
        await transporter.sendMail({
            from: '"DataGate System" <138data@gmail.com>',
            to: senderEmail,
            subject: '[DataGate] ファイル送信完了',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #48bb78; padding: 30px; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0;">✅ 送信完了</h1>
                    </div>
                    <div style="padding: 30px; background: #f9f9f9;">
                        <p>以下の宛先にファイルを送信しました：</p>
                        <p><strong>${recipientEmail}</strong></p>
                        
                        <div style="margin: 30px 0; padding: 20px; background: #fff5f5; border: 2px solid #feb2b2; border-radius: 10px;">
                            <h3 style="color: #e53e3e; margin-top: 0;">⚠️ 誤送信の場合</h3>
                            <p>間違えて送信した場合は、以下のボタンでファイルを削除できます：</p>
                            <a href="${manageLink}" style="display: inline-block; padding: 12px 30px; background: #e53e3e; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">ファイルを削除</a>
                        </div>
                    </div>
                </div>
            `
        });
        console.log('[Upload-SMTP] Email 3/3 sent');
        
        // Success
        console.log('[Upload-SMTP] All emails sent successfully!');
        res.status(200).json({
            success: true,
            message: 'ファイルアップロード完了、メール送信成功！',
            fileId: fileId,
            downloadLink: downloadLink,
            manageLink: manageLink,
            otp: otp,  // テスト用に表示
            recipientEmail: recipientEmail,
            senderEmail: senderEmail
        });
        
    } catch (error) {
        console.error('[Upload-SMTP Error]', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
