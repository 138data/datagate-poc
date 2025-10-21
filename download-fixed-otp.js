// api/download.js
// ファイルダウンロードAPI - 3段階認証版（OTPファイル保存版）

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const STORAGE_DIR = path.join(process.cwd(), 'storage');
const OTP_DIR = path.join(process.cwd(), 'temp-otp');

// OTPディレクトリを作成
if (!fs.existsSync(OTP_DIR)) {
    fs.mkdirSync(OTP_DIR, { recursive: true });
}

// メール送信設定
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: '138data@gmail.com',
        pass: 'vwfpoehwgmckyqek'
    }
});

// OTPコードを生成（6桁の数字）
function generateOTP() {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('Generated OTP:', otp);
    return otp;
}

// OTPを保存
function saveOTP(fileId, email, otp, metadata) {
    const otpKey = `${fileId}_${email.replace('@', '_at_')}`;
    const otpPath = path.join(OTP_DIR, `${otpKey}.json`);
    
    const otpData = {
        otp: otp,
        email: email,
        fileId: fileId,
        createdAt: Date.now(),
        expiresAt: Date.now() + (10 * 60 * 1000), // 10分後
        metadata: metadata
    };
    
    fs.writeFileSync(otpPath, JSON.stringify(otpData, null, 2));
    console.log(`OTP saved to file: ${otpPath}`);
    console.log(`OTP content:`, otpData.otp);
    
    // 10分後に自動削除
    setTimeout(() => {
        if (fs.existsSync(otpPath)) {
            fs.unlinkSync(otpPath);
            console.log(`OTP file expired and deleted: ${otpPath}`);
        }
    }, 10 * 60 * 1000);
    
    return true;
}

// OTPを取得
function getOTP(fileId, email) {
    const otpKey = `${fileId}_${email.replace('@', '_at_')}`;
    const otpPath = path.join(OTP_DIR, `${otpKey}.json`);
    
    console.log(`Looking for OTP file: ${otpPath}`);
    
    if (!fs.existsSync(otpPath)) {
        console.log('OTP file not found');
        return null;
    }
    
    try {
        const otpData = JSON.parse(fs.readFileSync(otpPath, 'utf8'));
        console.log('OTP file found, content:', otpData.otp);
        
        // 有効期限チェック
        if (Date.now() > otpData.expiresAt) {
            console.log('OTP expired');
            fs.unlinkSync(otpPath);
            return null;
        }
        
        return otpData;
    } catch (error) {
        console.error('OTP read error:', error);
        return null;
    }
}

// OTPを削除
function deleteOTP(fileId, email) {
    const otpKey = `${fileId}_${email.replace('@', '_at_')}`;
    const otpPath = path.join(OTP_DIR, `${otpKey}.json`);
    
    if (fs.existsSync(otpPath)) {
        fs.unlinkSync(otpPath);
        console.log('OTP deleted after use');
    }
}

// 期限切れOTPをクリーンアップ
function cleanupExpiredOTPs() {
    if (!fs.existsSync(OTP_DIR)) return;
    
    const files = fs.readdirSync(OTP_DIR);
    const now = Date.now();
    
    files.forEach(file => {
        if (file.endsWith('.json')) {
            const filePath = path.join(OTP_DIR, file);
            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                if (now > data.expiresAt) {
                    fs.unlinkSync(filePath);
                    console.log('Cleaned up expired OTP:', file);
                }
            } catch (error) {
                // エラーの場合は古いファイルとして削除
                fs.unlinkSync(filePath);
            }
        }
    });
}

// 定期的にクリーンアップ（5分ごと）
setInterval(cleanupExpiredOTPs, 5 * 60 * 1000);

// OTP送信メールのHTMLテンプレート
function createOTPEmailHTML(otp, fileName) {
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
        .code-box { background: #f8f9fa; border: 2px solid #667eea; padding: 20px; margin: 30px 0; text-align: center; border-radius: 10px; }
        .code { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #667eea; }
        .info { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 ダウンロード認証コード</h1>
        </div>
        <div class="content">
            <p>ファイル「<strong>${fileName}</strong>」をダウンロードするための認証コードです。</p>
            
            <div class="code-box">
                <p style="margin: 0 0 10px 0; color: #666;">認証コード：</p>
                <div class="code">${otp}</div>
                <p style="margin: 10px 0 0 0; color: #999; font-size: 12px;">有効期限：10分間</p>
            </div>
            
            <div class="info">
                <strong>📝 使用方法：</strong><br>
                1. ダウンロードページに戻る<br>
                2. 上記の6桁の認証コードを入力<br>
                3. ファイルのダウンロードが開始されます
            </div>
        </div>
    </div>
</body>
</html>
    `;
}

// 開封通知メールのHTMLテンプレート
function createOpenNotificationHTML(fileInfo) {
    const downloadTime = new Date().toLocaleString('ja-JP');
    const remainingDownloads = (fileInfo.maxDownloads || 5) - fileInfo.downloadCount;
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { background: white; max-width: 600px; margin: 0 auto; border-radius: 10px; }
        .header { background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { padding: 30px; }
        .info-box { background: #f0f8ff; border-left: 4px solid #4CAF50; padding: 15px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📬 ファイルが開封されました</h1>
        </div>
        <div class="content">
            <p><strong>${fileInfo.senderName}</strong> 様</p>
            <p>ファイルがダウンロードされました。</p>
            
            <div class="info-box">
                <strong>📎 ファイル:</strong> ${fileInfo.originalName}<br>
                <strong>📧 ダウンロード者:</strong> ${fileInfo.verifiedEmail}<br>
                <strong>✅ 認証方法:</strong> メールアドレス確認 + OTP認証<br>
                <strong>📥 日時:</strong> ${downloadTime}<br>
                <strong>📊 回数:</strong> ${fileInfo.downloadCount} / ${fileInfo.maxDownloads || 5}
            </div>
        </div>
    </div>
</body>
</html>
    `;
}

// OTPを送信
async function sendOTP(email, otp, fileName) {
    try {
        await transporter.sendMail({
            from: '"DataGate System" <138data@gmail.com>',
            to: email,
            subject: `[認証コード] ${fileName}`,
            html: createOTPEmailHTML(otp, fileName)
        });
        console.log(`OTP送信成功: ${email}`);
        return true;
    } catch (error) {
        console.error('OTP送信エラー:', error);
        return false;
    }
}

// 開封通知メールを送信
async function sendOpenNotification(metadata, verifiedEmail) {
    try {
        if (!metadata.senderEmail) {
            return;
        }

        const notificationData = {
            ...metadata,
            verifiedEmail: verifiedEmail
        };

        await transporter.sendMail({
            from: '"DataGate System" <138data@gmail.com>',
            to: metadata.senderEmail,
            subject: `[開封通知] ${metadata.originalName}`,
            html: createOpenNotificationHTML(notificationData)
        });

        console.log(`開封通知送信成功: ${metadata.senderEmail}`);
        return true;
    } catch (error) {
        console.error('開封通知エラー:', error);
        return false;
    }
}

// ダウンロードページのHTML
function getDownloadPageHTML(fileId) {
    return `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ファイルダウンロード - 138DataGate</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
            max-width: 500px;
            width: 100%;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 30px;
            text-align: center;
            color: white;
        }
        .content { padding: 40px 30px; }
        .form-group { margin-bottom: 25px; }
        label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: 500;
            font-size: 14px;
        }
        input {
            width: 100%;
            padding: 15px;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            font-size: 16px;
        }
        input:focus {
            outline: none;
            border-color: #667eea;
        }
        .button {
            width: 100%;
            padding: 15px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            margin-top: 20px;
        }
        .button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .error-message, .success-message {
            padding: 12px;
            border-radius: 8px;
            margin-top: 20px;
            display: none;
            font-size: 14px;
        }
        .error-message {
            background: #fee;
            color: #c33;
        }
        .success-message {
            background: #efe;
            color: #3a3;
        }
        .info-box {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin-bottom: 25px;
            border-radius: 5px;
        }
        .hidden { display: none; }
        .security-code-input {
            text-align: center;
            font-size: 24px;
            letter-spacing: 10px;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 セキュアダウンロード</h1>
            <p>ファイルをダウンロードするには認証が必要です</p>
        </div>
        
        <div class="content">
            <!-- Step 1: メールアドレス入力 -->
            <div id="emailSection">
                <div class="info-box">
                    <p>📧 ファイルを受信したメールアドレスを入力してください。</p>
                </div>
                
                <form id="emailForm">
                    <input type="hidden" id="fileId" value="${fileId}">
                    
                    <div class="form-group">
                        <label for="email">メールアドレス</label>
                        <input type="email" id="email" placeholder="your@email.com" required>
                    </div>
                    
                    <button type="submit" class="button">認証コードを送信</button>
                </form>
            </div>
            
            <!-- Step 2: OTP入力 -->
            <div id="otpSection" class="hidden">
                <div class="info-box">
                    <p>🔑 メールで送信された6桁の認証コードを入力してください。</p>
                    <p id="emailDisplay"></p>
                </div>
                
                <form id="otpForm">
                    <div class="form-group">
                        <label for="otp">認証コード（6桁）</label>
                        <input type="text" id="otp" maxlength="6" pattern="[0-9]{6}" 
                               class="security-code-input" placeholder="000000" required>
                    </div>
                    
                    <button type="submit" class="button">ダウンロード</button>
                </form>
            </div>
            
            <div id="errorMessage" class="error-message"></div>
            <div id="successMessage" class="success-message"></div>
        </div>
    </div>
    
    <script>
        let currentEmail = '';
        let currentFileId = document.getElementById('fileId').value;
        
        document.getElementById('emailForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const button = e.target.querySelector('button');
            
            button.disabled = true;
            button.textContent = '送信中...';
            
            try {
                const response = await fetch('/api/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'requestOTP',
                        fileId: currentFileId,
                        email: email
                    })
                });
                
                if (response.ok) {
                    currentEmail = email;
                    document.getElementById('emailSection').classList.add('hidden');
                    document.getElementById('otpSection').classList.remove('hidden');
                    document.getElementById('emailDisplay').textContent = '送信先: ' + email;
                    document.getElementById('otp').focus();
                    showSuccess('認証コードを送信しました');
                } else {
                    const data = await response.json();
                    showError(data.error);
                }
            } catch (error) {
                showError('エラーが発生しました');
            } finally {
                button.disabled = false;
                button.textContent = '認証コードを送信';
            }
        });
        
        document.getElementById('otpForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const otp = document.getElementById('otp').value;
            const button = e.target.querySelector('button');
            
            button.disabled = true;
            button.textContent = 'ダウンロード中...';
            
            try {
                const response = await fetch('/api/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'verifyAndDownload',
                        fileId: currentFileId,
                        email: currentEmail,
                        otp: otp
                    })
                });
                
                if (response.ok) {
                    const blob = await response.blob();
                    const contentDisposition = response.headers.get('Content-Disposition');
                    let fileName = 'download';
                    
                    if (contentDisposition) {
                        const match = contentDisposition.match(/filename="(.+)"/);
                        if (match) fileName = match[1];
                    }
                    
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    
                    showSuccess('ダウンロードを開始しました');
                } else {
                    const error = await response.json();
                    showError(error.error);
                }
            } catch (error) {
                showError('エラーが発生しました');
            } finally {
                button.disabled = false;
                button.textContent = 'ダウンロード';
            }
        });
        
        function showError(message) {
            const errorDiv = document.getElementById('errorMessage');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            setTimeout(() => {
                errorDiv.style.display = 'none';
            }, 5000);
        }
        
        function showSuccess(message) {
            const successDiv = document.getElementById('successMessage');
            successDiv.textContent = message;
            successDiv.style.display = 'block';
            setTimeout(() => {
                successDiv.style.display = 'none';
            }, 5000);
        }
    </script>
</body>
</html>
    `;
}

export default async function handler(req, res) {
    console.log('=== Download Request ===');
    console.log('Method:', req.method);
    
    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GETリクエスト
    if (req.method === 'GET') {
        const { id } = req.query;
        if (!id) {
            return res.status(400).send('ファイルIDが指定されていません');
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(getDownloadPageHTML(id));
    }

    // POSTリクエスト
    if (req.method === 'POST') {
        const { action } = req.body;

        // OTP送信リクエスト
        if (action === 'requestOTP') {
            try {
                const { fileId, email } = req.body;
                console.log(`OTP Request - FileID: ${fileId}, Email: ${email}`);

                if (!fileId || !email) {
                    return res.status(400).json({ error: '必要な情報が不足しています' });
                }

                // メタデータの確認
                const metadataPath = path.join(STORAGE_DIR, `${fileId}.meta.json`);
                const metadataPath2 = path.join(STORAGE_DIR, `${fileId}.json`);

                let metadata;
                if (fs.existsSync(metadataPath)) {
                    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                } else if (fs.existsSync(metadataPath2)) {
                    metadata = JSON.parse(fs.readFileSync(metadataPath2, 'utf8'));
                } else {
                    return res.status(404).json({ error: 'ファイルが見つかりません' });
                }

                // OTPを生成して保存
                const otp = generateOTP();
                saveOTP(fileId, email, otp, metadata);

                // OTPをメールで送信
                const sent = await sendOTP(email, otp, metadata.originalName);
                
                if (sent) {
                    return res.status(200).json({ 
                        success: true,
                        message: '認証コードを送信しました' 
                    });
                } else {
                    return res.status(500).json({ error: 'メール送信に失敗しました' });
                }

            } catch (error) {
                console.error('OTP送信エラー:', error);
                return res.status(500).json({ error: 'サーバーエラーが発生しました' });
            }
        }

        // OTP検証とダウンロード
        if (action === 'verifyAndDownload') {
            try {
                const { fileId, email, otp } = req.body;
                console.log(`OTP Verify - FileID: ${fileId}, Email: ${email}, OTP: ${otp}`);

                if (!fileId || !email || !otp) {
                    return res.status(400).json({ error: '必要な情報が不足しています' });
                }

                // OTPの検証
                const otpData = getOTP(fileId, email);
                
                if (!otpData) {
                    return res.status(401).json({ error: '認証コードが無効または期限切れです' });
                }

                console.log(`Comparing OTP: stored=${otpData.otp}, provided=${otp}`);
                
                if (otpData.otp !== otp) {
                    return res.status(401).json({ error: '認証コードが正しくありません' });
                }

                // OTP使用済みとして削除
                deleteOTP(fileId, email);

                const metadata = otpData.metadata;

                // ダウンロード回数のチェック
                const maxDownloads = metadata.maxDownloads || 5;
                if (metadata.downloadCount >= maxDownloads) {
                    return res.status(403).json({ 
                        error: `ダウンロード回数の上限（${maxDownloads}回）に達しました` 
                    });
                }

                // ファイルの存在確認
                const filePath = path.join(STORAGE_DIR, metadata.fileName);
                if (!fs.existsSync(filePath)) {
                    return res.status(404).json({ error: 'ファイルが見つかりません' });
                }

                // ダウンロード回数を増やす
                metadata.downloadCount = (metadata.downloadCount || 0) + 1;
                metadata.lastDownloadedAt = new Date().toISOString();
                metadata.lastDownloadedBy = email;
                
                // メタデータを更新
                const metadataPath = path.join(STORAGE_DIR, `${fileId}.meta.json`);
                const metadataPath2 = path.join(STORAGE_DIR, `${fileId}.json`);
                
                if (fs.existsSync(metadataPath)) {
                    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
                } else {
                    fs.writeFileSync(metadataPath2, JSON.stringify(metadata, null, 2));
                }

                console.log(`Download success: ${metadata.originalName} by ${email}`);

                // 開封通知メールを送信
                sendOpenNotification(metadata, email).catch(error => {
                    console.error('開封通知エラー:', error);
                });

                // ファイルを送信
                const fileContent = fs.readFileSync(filePath);
                res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
                res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName}"`);
                res.setHeader('Content-Length', fileContent.length);
                
                return res.status(200).send(fileContent);

            } catch (error) {
                console.error('ダウンロードエラー:', error);
                return res.status(500).json({ error: 'サーバーエラーが発生しました' });
            }
        }

        return res.status(400).json({ error: '不明なアクションです' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
