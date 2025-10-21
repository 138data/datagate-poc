// api/upload.js
// 138DataGate - ファイルアップロードAPI（Formidable版）

import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

// 設定ファイルのパス
const SETTINGS_FILE = path.join(process.cwd(), 'config', 'settings.json');

// デフォルト設定
const DEFAULT_SETTINGS = {
    maxDownloads: 5,
    retentionHours: 72,
    maxFileSize: 100,
    autoDelete: true
};

// 設定を読み込む
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('設定ファイルの読み込みエラー:', error);
    }
    return DEFAULT_SETTINGS;
}

// アップロード先のディレクトリ
const uploadDir = path.join(process.cwd(), 'storage');

// ディレクトリが存在しない場合は作成
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ユニークなIDを生成
function generateUniqueId() {
    return crypto.randomBytes(16).toString('hex');
}

// セキュリティコードを生成（6桁の数字）
function generateSecurityCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// 削除キーを生成
function generateDeleteKey() {
    return 'del_' + crypto.randomBytes(24).toString('hex');
}

// メール送信設定（ハードコード版）
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: '138data@gmail.com',
        pass: 'vwfpoehwgmckyqek'  // アプリパスワード
    }
});

// HTMLメールテンプレート（削除リンク付き送信完了通知）
function createSenderEmailHTML(fileInfo, deleteKey) {
    const deleteLink = `${fileInfo.baseUrl}/api/delete-link?key=${deleteKey}`;
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { background: white; max-width: 600px; margin: 0 auto; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { padding: 30px; }
        .info-box { background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
        .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
        .delete-button { background: #f44336; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📤 ファイル送信完了</h1>
        </div>
        <div class="content">
            <p><strong>${fileInfo.senderName}</strong> 様</p>
            
            <p>ファイルの送信が完了しました。</p>
            
            <div class="info-box">
                <strong>📧 送信先:</strong> ${fileInfo.recipientEmail}<br>
                <strong>📎 ファイル:</strong> ${fileInfo.fileName}<br>
                <strong>📊 サイズ:</strong> ${(fileInfo.fileSize / 1024 / 1024).toFixed(2)} MB<br>
                <strong>⏰ 有効期限:</strong> ${fileInfo.retentionHours}時間<br>
                <strong>🔄 最大DL回数:</strong> ${fileInfo.maxDownloads}回<br>
                <strong>🕐 送信日時:</strong> ${new Date().toLocaleString('ja-JP')}
            </div>
            
            <div style="text-align: center; margin: 30px 0; padding: 20px; background: #fff3e0; border-radius: 5px;">
                <h3 style="color: #e65100;">⚠️ 重要：ファイル削除リンク</h3>
                <p>以下のリンクから、送信したファイルを即座に削除できます。</p>
                <a href="${deleteLink}" class="button delete-button">🗑️ ファイルを削除</a>
            </div>
        </div>
    </div>
</body>
</html>
    `;
}

// ダウンロードリンクのHTMLメール
function createDownloadEmailHTML(downloadLink, senderName, subject, message) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { background: white; max-width: 600px; margin: 0 auto; border-radius: 10px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { padding: 30px; }
        .button { display: inline-block; padding: 15px 40px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; font-size: 18px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📩 [1/2] ファイルダウンロードリンク</h1>
        </div>
        <div class="content">
            <p><strong>件名:</strong> ${subject}</p>
            <p><strong>送信者:</strong> ${senderName}</p>
            ${message ? `<p><strong>メッセージ:</strong><br>${message}</p>` : ''}
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${downloadLink}" class="button">📥 ファイルをダウンロード</a>
            </div>
        </div>
    </div>
</body>
</html>
    `;
}

// セキュリティコードのHTMLメール
function createSecurityCodeEmailHTML(securityCode, fileName) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { background: white; max-width: 600px; margin: 0 auto; border-radius: 10px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { padding: 30px; }
        .code-box { background: #f8f9fa; border: 2px solid #667eea; padding: 20px; margin: 30px 0; text-align: center; border-radius: 10px; }
        .code { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #667eea; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 [2/2] セキュリティコード</h1>
        </div>
        <div class="content">
            <p>ファイル「<strong>${fileName}</strong>」のセキュリティコードです。</p>
            <div class="code-box">
                <div class="code">${securityCode}</div>
            </div>
        </div>
    </div>
</body>
</html>
    `;
}

// メール送信関数
async function sendEmails(emailData) {
    const baseUrl = 'http://localhost:3000';
    
    try {
        // 1. 送信者への確認メール
        await transporter.sendMail({
            from: '"DataGate System" <138data@gmail.com>',
            to: emailData.senderEmail,
            subject: `[送信完了] ${emailData.subject}`,
            html: createSenderEmailHTML({
                ...emailData,
                baseUrl: baseUrl
            }, emailData.deleteKey)
        });
        console.log('送信者への確認メール送信成功');

        // 2. 受信者へのダウンロードリンクメール
        const downloadLink = `${baseUrl}/api/download?id=${emailData.fileId}`;
        await transporter.sendMail({
            from: '"DataGate System" <138data@gmail.com>',
            to: emailData.recipientEmail,
            subject: `[1/2 Download Link] ${emailData.subject}`,
            html: createDownloadEmailHTML(downloadLink, emailData.senderName, emailData.subject, emailData.message)
        });
        console.log('ダウンロードリンクメール送信成功');

        // 3. 受信者へのセキュリティコードメール
        await transporter.sendMail({
            from: '"DataGate System" <138data@gmail.com>',
            to: emailData.recipientEmail,
            subject: `[2/2 Security Code] ${emailData.subject}`,
            html: createSecurityCodeEmailHTML(emailData.securityCode, emailData.fileName)
        });
        console.log('セキュリティコードメール送信成功');

        return true;
    } catch (error) {
        console.error('メール送信エラー:', error);
        throw error;
    }
}

// メインのハンドラー関数
export default async function handler(req, res) {
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

    // 設定を読み込む
    const settings = loadSettings();
    const maxFileSizeBytes = settings.maxFileSize * 1024 * 1024;

    // Formidableでファイル処理
    const form = formidable({
        uploadDir: uploadDir,
        keepExtensions: true,
        maxFileSize: maxFileSizeBytes
    });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Parse error:', err);
            return res.status(500).json({ error: 'Form parse failed', details: err.message });
        }

        try {
            // ファイルを取得（Formidable v3の書式に対応）
            const file = Array.isArray(files.file) ? files.file[0] : files.file;
            
            if (!file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            // ファイルサイズチェック
            if (file.size > maxFileSizeBytes) {
                // アップロードされたファイルを削除
                fs.unlinkSync(file.filepath);
                return res.status(400).json({ 
                    error: `ファイルサイズが制限（${settings.maxFileSize}MB）を超えています` 
                });
            }

            // ファイルIDを生成
            const fileId = generateUniqueId();
            const securityCode = generateSecurityCode();
            const deleteKey = generateDeleteKey();
            
            // ファイル名を変更
            const originalName = file.originalFilename || 'unknown';
            const fileName = `${fileId}_${originalName}`;
            const newFilePath = path.join(uploadDir, fileName);
            
            // ファイルを移動
            fs.renameSync(file.filepath, newFilePath);

            // フィールドから値を取得（Formidable v3の書式）
            const getFieldValue = (field) => {
                return Array.isArray(field) ? field[0] : field;
            };

            // メタデータを作成
            const metadata = {
                fileId: fileId,
                originalName: originalName,
                fileName: fileName,
                fileSize: file.size,
                mimeType: file.mimetype || 'application/octet-stream',
                uploadedAt: new Date().toISOString(),
                securityCode: securityCode,
                deleteKey: deleteKey,
                downloadCount: 0,
                maxDownloads: settings.maxDownloads,
                retentionHours: settings.retentionHours,
                recipientEmail: getFieldValue(fields.recipientEmail) || '',
                senderEmail: getFieldValue(fields.senderEmail) || '',
                senderName: getFieldValue(fields.senderName) || 'Unknown',
                subject: getFieldValue(fields.subject) || 'ファイル送信',
                message: getFieldValue(fields.message) || ''
            };

            // メタデータをファイルに保存
            const metadataPath = path.join(uploadDir, `${fileId}.meta.json`);
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

            // メール送信（メールアドレスが指定されている場合のみ）
            if (metadata.recipientEmail && metadata.senderEmail) {
                await sendEmails({
                    ...metadata,
                    fileSize: file.size,
                    baseUrl: 'http://localhost:3000'
                });
            }

            console.log('アップロード成功:', {
                fileId: fileId,
                fileName: originalName,
                size: file.size,
                maxDownloads: settings.maxDownloads,
                retentionHours: settings.retentionHours
            });

            res.status(200).json({
                success: true,
                message: 'File uploaded successfully',
                fileId: fileId,
                fileName: originalName,
                maxDownloads: settings.maxDownloads,
                retentionHours: settings.retentionHours
            });

        } catch (error) {
            console.error('処理エラー:', error);
            res.status(500).json({ 
                error: 'Internal server error',
                details: error.message
            });
        }
    });
}

export const config = {
    api: {
        bodyParser: false,
    },
};
