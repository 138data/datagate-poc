const { IncomingForm } = require('formidable');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// OTP生成
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ファイルID生成
function generateFileId() {
  return `file_${crypto.randomBytes(8).toString('hex')}`;
}

// 削除キー生成
function generateDeleteKey() {
  return `del_${crypto.randomBytes(12).toString('hex')}`;
}

// メール送信関数
async function sendEmails(fileId, otp, recipientEmail, senderEmail, senderName, subject, message, deleteKey) {
  console.log('Preparing to send emails...');
  
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
  const downloadUrl = `${baseUrl}/download.html?id=${fileId}`;

  try {
    // 1. ダウンロードリンクメール
    await transporter.sendMail({
      from: `${process.env.FROM_NAME || 'DataGate'} <${process.env.FROM_EMAIL}>`,
      to: recipientEmail,
      subject: `[1/2] ${subject} - ダウンロードリンク`,
      html: `
        <h3>${senderName}様からファイルが送信されました</h3>
        <p>${message}</p>
        <p><strong>ダウンロードリンク：</strong></p>
        <p><a href="${downloadUrl}">ファイルをダウンロード</a></p>
      `,
    });

    // 2. OTPコードメール
    await transporter.sendMail({
      from: `${process.env.FROM_NAME || 'DataGate'} <${process.env.FROM_EMAIL}>`,
      to: recipientEmail,
      subject: `[2/2] ${subject} - セキュリティコード`,
      html: `
        <h3>セキュリティコード</h3>
        <h1 style="font-family: monospace;">${otp}</h1>
      `,
    });

    // 3. 管理メール
    await transporter.sendMail({
      from: `${process.env.FROM_NAME || 'DataGate'} <${process.env.FROM_EMAIL}>`,
      to: senderEmail,
      subject: `[送信完了] ${subject}`,
      html: `
        <h3>送信完了</h3>
        <p>File ID: ${fileId}</p>
        <p>OTP: ${otp}</p>
        <p>削除キー: ${deleteKey}</p>
      `,
    });

    return { downloadLink: '送信済み', otp: '送信済み', management: '送信済み' };
  } catch (error) {
    console.error('Email error:', error.message);
    return { downloadLink: '失敗', otp: '失敗', management: '失敗' };
  }
}

module.exports = async (req, res) => {
  console.log('=== Upload Request ===');
  
  // CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    // FormDataを解析
    const form = new IncomingForm({
      maxFileSize: 100 * 1024 * 1024,
      keepExtensions: true,
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    // ファイル取得
    const file = files.file?.[0] || files.file;
    if (!file) throw new Error('No file uploaded');

    // フィールド取得
    const getValue = (field) => Array.isArray(field) ? field[0] : field;
    
    const recipientEmail = getValue(fields.recipientEmail) || '138data@gmail.com';
    const senderEmail = getValue(fields.senderEmail) || '138data@gmail.com';
    const senderName = getValue(fields.senderName) || '送信者';
    const subject = getValue(fields.subject) || 'ファイル送信';
    const message = getValue(fields.message) || '';

    // ID生成
    const fileId = generateFileId();
    const otp = generateOTP();
    const deleteKey = generateDeleteKey();

    // ストレージ
    const storageDir = path.join(process.cwd(), 'storage');
    await fs.mkdir(storageDir, { recursive: true });

    // ファイル保存
    const fileBuffer = await fs.readFile(file.filepath);
    const fileName = file.originalFilename || file.newFilename;
    const filePath = path.join(storageDir, `${fileId}_${fileName}`);
    await fs.writeFile(filePath, fileBuffer);

    // メタデータ保存
    const metadata = {
      fileId, fileName, otp, deleteKey,
      recipientEmail, senderEmail, senderName,
      uploadedAt: new Date().toISOString(),
      downloadCount: 0,
      maxDownloads: 3,
    };

    await fs.writeFile(
      path.join(storageDir, `${fileId}.json`),
      JSON.stringify(metadata, null, 2)
    );

    // メール送信
    let emails = { downloadLink: '未送信', otp: '未送信', management: '未送信' };
    try {
      emails = await sendEmails(fileId, otp, recipientEmail, senderEmail, senderName, subject, message, deleteKey);
    } catch (e) {
      console.error('Mail failed:', e.message);
    }

    // レスポンス
    const response = {
      success: true,
      message: 'アップロード完了',
      fileId,
      downloadUrl: `http://localhost:3000/download.html?id=${fileId}`,
      otp,
      deleteKey,
      emails,
    };

    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));

  } catch (error) {
    console.error('Error:', error);
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
};
