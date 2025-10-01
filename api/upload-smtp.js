const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// ストレージクラス
class FileStorage {
  constructor() {
    this.storagePath = path.join(process.cwd(), 'storage');
    this.files = new Map();
  }

  async ensureStorageExists() {
    try {
      await fs.access(this.storagePath);
    } catch {
      await fs.mkdir(this.storagePath, { recursive: true });
    }
  }

  async saveFile(fileData) {
    await this.ensureStorageExists();
    
    const fileId = crypto.randomBytes(16).toString('hex');
    const filePath = path.join(this.storagePath, `${fileId}_${fileData.fileName}`);
    
    const buffer = Buffer.from(fileData.fileData, 'base64');
    await fs.writeFile(filePath, buffer);
    
    const metadata = {
      id: fileId,
      originalName: fileData.fileName,
      mimeType: fileData.mimeType,
      size: buffer.length,
      path: filePath,
      recipientEmail: fileData.recipientEmail,
      senderEmail: fileData.senderEmail,
      senderName: fileData.senderName,
      subject: fileData.subject,
      message: fileData.message,
      otp: fileData.otp,
      uploadDate: new Date().toISOString(),
      downloadCount: 0,
      maxDownloads: 3,
      deleteKey: fileData.deleteKey,
      deleted: false
    };
    
    this.files.set(fileId, metadata);
    
    const metaPath = path.join(this.storagePath, `${fileId}.json`);
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
    
    return metadata;
  }
}

const storage = new FileStorage();

module.exports = async function handler(req, res) {
  console.log('========================================');
  console.log('[Upload-SMTP] Request received');
  console.log('[Upload-SMTP] Method:', req.method);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // トークン検証
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.UPLOAD_TOKEN || 'test-upload-token-138data';
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization required' });
    }
    
    if (authHeader.slice(7) !== expectedToken) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    console.log('[Upload-SMTP] Token validated');
    
    // リクエストボディの検証
    const requiredFields = ['fileName', 'mimeType', 'fileData', 'recipientEmail', 'senderEmail', 'senderName'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        details: missingFields.join(', ') 
      });
    }
    
    const {
      fileName,
      mimeType,
      fileData,
      recipientEmail,
      senderEmail,
      senderName,
      subject = 'ファイル送信',
      message = 'ファイルが送信されました。'
    } = req.body;
    
    console.log('[Upload-SMTP] Processing:', fileName);
    console.log('[Upload-SMTP] To:', recipientEmail);
    
    // OTPとDelete Key生成
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const deleteKey = crypto.randomBytes(32).toString('hex');
    
    console.log('[Upload-SMTP] OTP:', otp);
    
    // ファイル保存
    const fileInfo = await storage.saveFile({
      fileName,
      mimeType,
      fileData,
      recipientEmail,
      senderEmail,
      senderName,
      subject,
      message,
      otp,
      deleteKey
    });
    
    console.log('[Upload-SMTP] Saved:', fileInfo.id);
    
    // URL生成
    const baseUrl = process.env.PUBLIC_BASE_URL || `http://${req.headers.host}`;
    const downloadUrl = `${baseUrl}/download.html?id=${fileInfo.id}`;
    
    // メール送信
    if (process.env.SMTP_PASS) {
      try {
        console.log('[Upload-SMTP] Creating mail transporter...');
        
        // 正しい関数名: createTransport (createTransporterではない！)
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: false,
          auth: {
            user: process.env.SMTP_USER || '138data@gmail.com',
            pass: process.env.SMTP_PASS
          },
          tls: {
            rejectUnauthorized: false
          }
        });
        
        console.log('[Upload-SMTP] Sending email 1/3...');
        
        // 1. 受信者へダウンロードリンク
        await transporter.sendMail({
          from: `"${senderName}" <${process.env.FROM_EMAIL || senderEmail}>`,
          to: recipientEmail,
          subject: subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">ファイルが送信されました</h2>
              <p>${message}</p>
              <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>送信者:</strong> ${senderName} (${senderEmail})</p>
                <p><strong>ファイル名:</strong> ${fileName}</p>
              </div>
              <p style="margin: 20px 0;">
                <a href="${downloadUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                  ダウンロードページを開く
                </a>
              </p>
              <p style="color: #666; font-size: 14px;">
                ※ダウンロードには次のメールで送信される認証コードが必要です。
              </p>
            </div>
          `
        });
        
        console.log('[Upload-SMTP] Sending email 2/3...');
        
        // 2. 受信者へOTP
        await transporter.sendMail({
          from: `"DataGate System" <${process.env.FROM_EMAIL || senderEmail}>`,
          to: recipientEmail,
          subject: `認証コード: ${subject}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">ダウンロード認証コード</h2>
              <div style="background: #fff3cd; border: 2px solid #ffc107; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center;">
                <p style="margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 5px;">
                  ${otp}
                </p>
              </div>
              <p style="color: #666;">
                このコードをダウンロードページで入力してください。
              </p>
            </div>
          `
        });
        
        console.log('[Upload-SMTP] Sending email 3/3...');
        
        // 3. 送信者へ管理情報
        await transporter.sendMail({
          from: `"DataGate System" <${process.env.FROM_EMAIL || senderEmail}>`,
          to: senderEmail,
          subject: `送信完了: ${subject}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #28a745;">✅ ファイル送信完了</h2>
              <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>ファイル名:</strong> ${fileName}</p>
                <p><strong>受信者:</strong> ${recipientEmail}</p>
                <p><strong>送信日時:</strong> ${new Date().toLocaleString('ja-JP')}</p>
              </div>
              <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>ダウンロードURL:</strong><br>
                <a href="${downloadUrl}">${downloadUrl}</a></p>
                <p><strong>削除キー:</strong><br>
                <code style="background: #fff; padding: 5px; border: 1px solid #ddd;">${deleteKey}</code></p>
              </div>
              <p style="color: #dc3545; font-size: 14px;">
                ※削除キーは大切に保管してください。
              </p>
            </div>
          `
        });
        
        console.log('[Upload-SMTP] ✅ All emails sent successfully!');
        
      } catch (emailError) {
        console.error('[Upload-SMTP] Email error:', emailError.message);
        // エラーの詳細
        if (emailError.responseCode) {
          console.error('[Upload-SMTP] SMTP Response:', emailError.responseCode);
        }
        if (emailError.command) {
          console.error('[Upload-SMTP] SMTP Command:', emailError.command);
        }
      }
    } else {
      console.log('[Upload-SMTP] SMTP_PASS not set, skipping email');
    }
    
    console.log('[Upload-SMTP] Returning success response');
    console.log('========================================');
    
    return res.status(200).json({
      success: true,
      fileId: fileInfo.id,
      downloadUrl: downloadUrl,
      deleteKey: deleteKey,
      otp: otp // デバッグ用
    });
    
  } catch (error) {
    console.error('[Upload-SMTP] Error:', error.message);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}