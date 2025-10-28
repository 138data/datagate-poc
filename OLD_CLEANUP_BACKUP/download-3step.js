// api/download.js
// ファイルダウンロードAPI - 3段階認証版（メールアドレス確認 + OTP）

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const STORAGE_DIR = path.join(process.cwd(), 'storage');
const OTP_STORAGE = new Map(); // OTP一時保存（本番環境ではRedis等を使用推奨）

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

// OTPコードを生成（6桁の数字）
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

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
        .warning { color: #ff5722; font-weight: bold; }
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
            
            <p class="warning">
                ⚠️ このコードを他の人と共有しないでください。
            </p>
            
            <p style="color: #666; font-size: 14px;">
                ※ このメールに心当たりがない場合は、無視してください。<br>
                ※ コードは10分後に無効になります。
            </p>
        </div>
        <div class="footer">
            <p>138DataGate セキュアファイル転送システム</p>
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
        .container { background: white; max-width: 600px; margin: 0 auto; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { padding: 30px; }
        .info-box { background: #f0f8ff; border-left: 4px solid #4CAF50; padding: 15px; margin: 20px 0; }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        .stat-box { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; color: #333; }
        .stat-label { font-size: 12px; color: #666; margin-top: 5px; }
        .warning-box { background: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .verified { color: #4CAF50; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📬 ファイルが開封されました</h1>
        </div>
        
        <div class="content">
            <p><strong>${fileInfo.senderName}</strong> 様</p>
            
            <p>以下のファイルがダウンロードされました。</p>
            
            <div class="info-box">
                <strong>📎 ファイル名:</strong> ${fileInfo.originalName}<br>
                <strong>📧 ダウンロード者:</strong> <span class="verified">${fileInfo.verifiedEmail}</span><br>
                <strong>✅ 認証方法:</strong> メールアドレス確認 + OTP認証<br>
                <strong>📥 ダウンロード日時:</strong> ${downloadTime}<br>
                <strong>📄 件名:</strong> ${fileInfo.subject || 'なし'}
            </div>
            
            <div class="stats-grid">
                <div class="stat-box">
                    <div class="stat-value">${fileInfo.downloadCount}</div>
                    <div class="stat-label">現在のダウンロード回数</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${remainingDownloads}</div>
                    <div class="stat-label">残りダウンロード可能回数</div>
                </div>
            </div>
            
            ${fileInfo.verifiedEmail !== fileInfo.recipientEmail ? `
            <div class="warning-box">
                <strong>⚠️ 注意：想定外の受信者</strong><br>
                ダウンロード者: ${fileInfo.verifiedEmail}<br>
                想定受信者: ${fileInfo.recipientEmail}<br>
                想定とは異なるメールアドレスからダウンロードされました。
            </div>
            ` : ''}
            
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
                ※ ダウンロード者のメールアドレスは認証済みです。
            </p>
        </div>
        
        <div class="footer">
            <p>138DataGate セキュアファイル転送システム</p>
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

// 開封通知メールを送信（メールアドレス認証済み版）
async function sendOpenNotification(metadata, verifiedEmail) {
    try {
        if (!metadata.senderEmail) {
            console.log('送信者メールアドレスが設定されていないため、開封通知をスキップ');
            return;
        }

        const notificationData = {
            ...metadata,
            verifiedEmail: verifiedEmail  // 認証されたメールアドレスを追加
        };

        const subject = metadata.downloadCount === 1 
            ? `[初回開封] ${metadata.originalName}` 
            : `[${metadata.downloadCount}回目] ${metadata.originalName}`;

        await transporter.sendMail({
            from: '"DataGate System" <138data@gmail.com>',
            to: metadata.senderEmail,
            subject: subject,
            html: createOpenNotificationHTML(notificationData)
        });

        console.log(`開封通知メール送信成功: ${metadata.senderEmail}`);
        return true;
    } catch (error) {
        console.error('開封通知メール送信エラー:', error);
        return false;
    }
}

// ダウンロードページのHTML（メールアドレス入力版）
function getDownloadPageHTML(fileId) {
    return `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ファイルダウンロード - 138DataGate</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
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
        
        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
        }
        
        .header p {
            opacity: 0.9;
            font-size: 14px;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .step-indicator {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
        }
        
        .step {
            flex: 1;
            text-align: center;
            position: relative;
        }
        
        .step::after {
            content: '';
            position: absolute;
            top: 15px;
            right: -50%;
            width: 100%;
            height: 2px;
            background: #e0e0e0;
            z-index: -1;
        }
        
        .step:last-child::after {
            display: none;
        }
        
        .step.active .step-number {
            background: #667eea;
            color: white;
        }
        
        .step.completed .step-number {
            background: #4CAF50;
            color: white;
        }
        
        .step-number {
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background: #e0e0e0;
            color: #999;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 8px;
            font-weight: bold;
            font-size: 14px;
        }
        
        .step-label {
            font-size: 12px;
            color: #666;
        }
        
        .form-group {
            margin-bottom: 25px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: 500;
            font-size: 14px;
        }
        
        .input-wrapper {
            position: relative;
        }
        
        .icon {
            position: absolute;
            left: 15px;
            top: 50%;
            transform: translateY(-50%);
            color: #999;
            font-size: 20px;
        }
        
        input {
            width: 100%;
            padding: 15px 15px 15px 45px;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            font-size: 16px;
            transition: all 0.3s;
        }
        
        input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        .security-code-input {
            text-align: center;
            font-size: 24px;
            letter-spacing: 10px;
            padding-left: 15px;
            font-weight: bold;
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
            transition: transform 0.2s;
            margin-top: 20px;
        }
        
        .button:hover {
            transform: translateY(-2px);
        }
        
        .button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }
        
        .button.secondary {
            background: #f5f5f5;
            color: #333;
            margin-top: 10px;
        }
        
        .error-message {
            background: #fee;
            color: #c33;
            padding: 12px;
            border-radius: 8px;
            margin-top: 20px;
            display: none;
            font-size: 14px;
        }
        
        .success-message {
            background: #efe;
            color: #3a3;
            padding: 12px;
            border-radius: 8px;
            margin-top: 20px;
            display: none;
            font-size: 14px;
        }
        
        .info-box {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin-bottom: 25px;
            border-radius: 5px;
        }
        
        .info-box p {
            color: #666;
            font-size: 14px;
            line-height: 1.6;
        }
        
        .loading {
            display: none;
            text-align: center;
            color: #667eea;
            margin-top: 20px;
        }
        
        .hidden {
            display: none;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .spinner {
            display: inline-block;
            width: 30px;
            height: 30px;
            border: 3px solid #e0e0e0;
            border-top-color: #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
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
            <!-- ステップインジケーター -->
            <div class="step-indicator">
                <div class="step active" id="step1">
                    <div class="step-number">1</div>
                    <div class="step-label">メール確認</div>
                </div>
                <div class="step" id="step2">
                    <div class="step-number">2</div>
                    <div class="step-label">認証コード</div>
                </div>
                <div class="step" id="step3">
                    <div class="step-number">3</div>
                    <div class="step-label">ダウンロード</div>
                </div>
            </div>
            
            <!-- Step 1: メールアドレス入力 -->
            <div id="emailSection">
                <div class="info-box">
                    <p>📧 ファイルを受信したメールアドレスを入力してください。</p>
                    <p>認証コードをメールでお送りします。</p>
                </div>
                
                <form id="emailForm">
                    <input type="hidden" id="fileId" value="${fileId}">
                    
                    <div class="form-group">
                        <label for="email">メールアドレス</label>
                        <div class="input-wrapper">
                            <span class="icon">📧</span>
                            <input 
                                type="email" 
                                id="email" 
                                placeholder="your@email.com"
                                required
                                autocomplete="email"
                            >
                        </div>
                    </div>
                    
                    <button type="submit" class="button">
                        認証コードを送信
                    </button>
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
                        <div class="input-wrapper">
                            <span class="icon">🔑</span>
                            <input 
                                type="text" 
                                id="otp" 
                                maxlength="6" 
                                pattern="[0-9]{6}" 
                                class="security-code-input"
                                placeholder="000000"
                                required
                                autocomplete="off"
                            >
                        </div>
                    </div>
                    
                    <button type="submit" class="button">
                        ダウンロード
                    </button>
                    <button type="button" class="button secondary" onclick="resetToEmail()">
                        メールアドレスを変更
                    </button>
                </form>
            </div>
            
            <div id="errorMessage" class="error-message"></div>
            <div id="successMessage" class="success-message"></div>
            <div id="loading" class="loading">
                <div class="spinner"></div>
                <p>処理中...</p>
            </div>
        </div>
    </div>
    
    <script>
        let currentEmail = '';
        let currentFileId = document.getElementById('fileId').value;
        
        // メールアドレス送信
        document.getElementById('emailForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const button = e.target.querySelector('button');
            const loading = document.getElementById('loading');
            
            button.disabled = true;
            loading.style.display = 'block';
            hideMessages();
            
            try {
                const response = await fetch('/api/download', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'requestOTP',
                        fileId: currentFileId,
                        email: email
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    currentEmail = email;
                    showOTPSection(email);
                    showSuccess('認証コードをメールで送信しました');
                } else {
                    showError(data.error || 'エラーが発生しました');
                }
            } catch (error) {
                showError('ネットワークエラーが発生しました');
                console.error(error);
            } finally {
                button.disabled = false;
                loading.style.display = 'none';
            }
        });
        
        // OTP送信
        document.getElementById('otpForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const otp = document.getElementById('otp').value;
            
            if (otp.length !== 6 || !/^\\d{6}$/.test(otp)) {
                showError('6桁の数字を入力してください');
                return;
            }
            
            const button = e.target.querySelector('button[type="submit"]');
            const loading = document.getElementById('loading');
            
            button.disabled = true;
            loading.style.display = 'block';
            hideMessages();
            
            try {
                const response = await fetch('/api/download', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
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
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    
                    showSuccess('ダウンロードを開始しました');
                    document.getElementById('step3').classList.add('completed');
                } else {
                    const error = await response.json();
                    showError(error.error || 'ダウンロードに失敗しました');
                }
            } catch (error) {
                showError('ネットワークエラーが発生しました');
                console.error(error);
            } finally {
                button.disabled = false;
                loading.style.display = 'none';
            }
        });
        
        function showOTPSection(email) {
            document.getElementById('emailSection').classList.add('hidden');
            document.getElementById('otpSection').classList.remove('hidden');
            document.getElementById('emailDisplay').textContent = '送信先: ' + email;
            document.getElementById('step1').classList.remove('active');
            document.getElementById('step1').classList.add('completed');
            document.getElementById('step2').classList.add('active');
            document.getElementById('otp').focus();
        }
        
        function resetToEmail() {
            document.getElementById('emailSection').classList.remove('hidden');
            document.getElementById('otpSection').classList.add('hidden');
            document.getElementById('step1').classList.add('active');
            document.getElementById('step1').classList.remove('completed');
            document.getElementById('step2').classList.remove('active');
            document.getElementById('otp').value = '';
            hideMessages();
        }
        
        function showError(message) {
            const errorDiv = document.getElementById('errorMessage');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
        
        function showSuccess(message) {
            const successDiv = document.getElementById('successMessage');
            successDiv.textContent = message;
            successDiv.style.display = 'block';
        }
        
        function hideMessages() {
            document.getElementById('errorMessage').style.display = 'none';
            document.getElementById('successMessage').style.display = 'none';
        }
        
        // 数字のみ入力可能にする
        document.getElementById('otp').addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
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

    // GETリクエスト: ダウンロードページを表示
    if (req.method === 'GET') {
        const { id } = req.query;
        
        if (!id) {
            return res.status(400).send('ファイルIDが指定されていません');
        }

        // ダウンロードページのHTMLを返す
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(getDownloadPageHTML(id));
    }

    // POSTリクエスト: アクションに応じて処理
    if (req.method === 'POST') {
        const { action } = req.body;

        // OTP送信リクエスト
        if (action === 'requestOTP') {
            try {
                const { fileId, email } = req.body;

                if (!fileId || !email) {
                    return res.status(400).json({ 
                        error: 'ファイルIDとメールアドレスが必要です' 
                    });
                }

                // メタデータの存在確認
                const metadataPath = path.join(STORAGE_DIR, `${fileId}.meta.json`);
                const metadataPath2 = path.join(STORAGE_DIR, `${fileId}.json`);

                let metadata;
                if (fs.existsSync(metadataPath)) {
                    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                } else if (fs.existsSync(metadataPath2)) {
                    metadata = JSON.parse(fs.readFileSync(metadataPath2, 'utf8'));
                } else {
                    return res.status(404).json({ 
                        error: 'ファイルが見つかりません' 
                    });
                }

                // OTPを生成
                const otp = generateOTP();
                const otpKey = `${fileId}_${email}`;
                
                // OTPを保存（10分間有効）
                OTP_STORAGE.set(otpKey, {
                    otp: otp,
                    email: email,
                    fileId: fileId,
                    createdAt: Date.now(),
                    metadata: metadata
                });

                // 10分後に自動削除
                setTimeout(() => {
                    OTP_STORAGE.delete(otpKey);
                }, 10 * 60 * 1000);

                // OTPをメールで送信
                const sent = await sendOTP(email, otp, metadata.originalName);
                
                if (sent) {
                    console.log(`OTP送信: ${email} (ファイル: ${metadata.originalName})`);
                    return res.status(200).json({ 
                        success: true,
                        message: '認証コードを送信しました' 
                    });
                } else {
                    return res.status(500).json({ 
                        error: 'メール送信に失敗しました' 
                    });
                }

            } catch (error) {
                console.error('OTP送信エラー:', error);
                return res.status(500).json({ 
                    error: 'サーバーエラーが発生しました' 
                });
            }
        }

        // OTP検証とダウンロード
        if (action === 'verifyAndDownload') {
            try {
                const { fileId, email, otp } = req.body;

                if (!fileId || !email || !otp) {
                    return res.status(400).json({ 
                        error: '必要な情報が不足しています' 
                    });
                }

                // OTPの検証
                const otpKey = `${fileId}_${email}`;
                const otpData = OTP_STORAGE.get(otpKey);

                if (!otpData) {
                    return res.status(401).json({ 
                        error: '認証コードが無効または期限切れです' 
                    });
                }

                if (otpData.otp !== otp) {
                    return res.status(401).json({ 
                        error: '認証コードが正しくありません' 
                    });
                }

                // OTP使用済みとして削除
                OTP_STORAGE.delete(otpKey);

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
                    return res.status(404).json({ 
                        error: 'ファイルが見つかりません' 
                    });
                }

                // ダウンロード回数を増やす
                metadata.downloadCount = (metadata.downloadCount || 0) + 1;
                metadata.lastDownloadedAt = new Date().toISOString();
                metadata.lastDownloadedBy = email;  // ダウンロード者を記録
                
                // メタデータを更新
                const metadataPath = path.join(STORAGE_DIR, `${fileId}.meta.json`);
                const metadataPath2 = path.join(STORAGE_DIR, `${fileId}.json`);
                
                if (fs.existsSync(metadataPath)) {
                    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
                } else {
                    fs.writeFileSync(metadataPath2, JSON.stringify(metadata, null, 2));
                }

                console.log(`ダウンロード成功: ${metadata.originalName} by ${email} (${metadata.downloadCount}/${maxDownloads})`);

                // 開封通知メールを送信（認証されたメールアドレスを含む）
                sendOpenNotification(metadata, email).catch(error => {
                    console.error('開封通知送信エラー（ダウンロードは成功）:', error);
                });

                // ファイルを送信
                const fileContent = fs.readFileSync(filePath);
                res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
                res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName}"`);
                res.setHeader('Content-Length', fileContent.length);
                
                return res.status(200).send(fileContent);

            } catch (error) {
                console.error('ダウンロードエラー:', error);
                return res.status(500).json({ 
                    error: 'サーバーエラーが発生しました' 
                });
            }
        }

        // 不明なアクション
        return res.status(400).json({ 
            error: '不明なアクションです' 
        });
    }

    // その他のメソッドは許可しない
    return res.status(405).json({ 
        error: 'Method not allowed' 
    });
}
