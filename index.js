const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();

class DataGateOTPServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        
        // データストア（メモリベース）
        this.secureLinkStore = new Map();
        this.otpStore = new Map();
        this.rateLimitStore = new Map();
        
        // ベースURL設定
        this.baseUrl = process.env.BASE_URL || 'https://datagate-poc-production.up.railway.app';
        
        // メール送信設定（環境変数から取得）
        this.mailTransporter = this.setupMailer();
        
        // ファイルアップロード設定
        const storage = multer.memoryStorage();
        this.upload = multer({
            storage: storage,
            limits: { fileSize: 10 * 1024 * 1024 } // 10MB
        });
        
        this.setupMiddleware();
        this.setupRoutes();
        this.startCleanupTimer();
        
        console.log('DataGate OTP Server v1.0.0 starting...');
    }
    
    setupMailer() {
        // Gmail/SendGrid設定（環境変数で切り替え）
        if (process.env.MAIL_SERVICE === 'gmail') {
            return nodemailer.createTransporter({
                service: 'gmail',
                auth: {
                    user: process.env.GMAIL_USER,
                    pass: process.env.GMAIL_APP_PASSWORD
                }
            });
        } else {
            // SendGrid設定
            return nodemailer.createTransporter({
                host: 'smtp.sendgrid.net',
                port: 587,
                auth: {
                    user: 'apikey',
                    pass: process.env.SENDGRID_API_KEY || 'dummy-key'
                }
            });
        }
    }
    
    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
    }
    
    setupRoutes() {
        // メインダッシュボード
        this.app.get('/', (req, res) => {
            res.send(`
                <!DOCTYPE html>
                <html lang="ja">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>DataGate v1.0 - OTP認証システム</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body {
                            font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            min-height: 100vh;
                            padding: 20px;
                        }
                        .container {
                            max-width: 800px;
                            margin: 0 auto;
                        }
                        .card {
                            background: white;
                            border-radius: 15px;
                            padding: 30px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                            margin-bottom: 20px;
                        }
                        h1 {
                            color: #333;
                            margin-bottom: 10px;
                            display: flex;
                            align-items: center;
                            gap: 10px;
                        }
                        .version-badge {
                            background: #ef4444;
                            color: white;
                            padding: 5px 15px;
                            border-radius: 20px;
                            font-size: 14px;
                        }
                        .form-group {
                            margin-bottom: 20px;
                        }
                        label {
                            display: block;
                            margin-bottom: 5px;
                            color: #555;
                            font-weight: 500;
                        }
                        input[type="email"],
                        input[type="text"],
                        textarea {
                            width: 100%;
                            padding: 12px;
                            border: 2px solid #e5e5e5;
                            border-radius: 8px;
                            font-size: 16px;
                            transition: border-color 0.3s;
                        }
                        input:focus,
                        textarea:focus {
                            outline: none;
                            border-color: #667eea;
                        }
                        .file-input {
                            padding: 10px;
                            border: 2px dashed #667eea;
                            border-radius: 8px;
                            background: #f8f8ff;
                            cursor: pointer;
                        }
                        .submit-btn {
                            background: #667eea;
                            color: white;
                            padding: 14px 30px;
                            border: none;
                            border-radius: 8px;
                            font-size: 16px;
                            font-weight: 600;
                            cursor: pointer;
                            width: 100%;
                            transition: background 0.3s;
                        }
                        .submit-btn:hover {
                            background: #5a67d8;
                        }
                        .feature-list {
                            list-style: none;
                            margin-top: 20px;
                        }
                        .feature-list li {
                            padding: 10px 0;
                            border-bottom: 1px solid #eee;
                            display: flex;
                            align-items: center;
                            gap: 10px;
                        }
                        .feature-list li:before {
                            content: "✅";
                            font-size: 18px;
                        }
                        .status-box {
                            background: #f0fdf4;
                            border: 1px solid #86efac;
                            padding: 15px;
                            border-radius: 8px;
                            margin-bottom: 20px;
                        }
                        .warning-box {
                            background: #fef3c7;
                            border: 1px solid #fbbf24;
                            padding: 15px;
                            border-radius: 8px;
                            margin-top: 20px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="card">
                            <h1>
                                🔐 DataGate
                                <span class="version-badge">v1.0.0 OTP</span>
                            </h1>
                            <p style="color: #666; margin-bottom: 20px;">
                                セキュアファイル転送システム - OTP認証版
                            </p>
                            
                            <div class="status-box">
                                <strong>システムステータス:</strong> ✅ 稼働中<br>
                                <strong>認証方式:</strong> メールOTP（ワンタイムパスワード）<br>
                                <strong>アクティブリンク:</strong> ${this.secureLinkStore.size}件
                            </div>
                            
                            <form action="/upload" method="POST" enctype="multipart/form-data">
                                <div class="form-group">
                                    <label for="sender">送信者メールアドレス</label>
                                    <input type="email" id="sender" name="sender" required 
                                           placeholder="sender@example.com">
                                </div>
                                
                                <div class="form-group">
                                    <label for="receiver">受信者メールアドレス</label>
                                    <input type="email" id="receiver" name="receiver" required 
                                           placeholder="receiver@example.com">
                                </div>
                                
                                <div class="form-group">
                                    <label for="subject">件名</label>
                                    <input type="text" id="subject" name="subject" required 
                                           placeholder="重要書類の送付">
                                </div>
                                
                                <div class="form-group">
                                    <label for="message">メッセージ（任意）</label>
                                    <textarea id="message" name="message" rows="3" 
                                              placeholder="ファイルの説明など"></textarea>
                                </div>
                                
                                <div class="form-group">
                                    <label for="file">添付ファイル</label>
                                    <input type="file" id="file" name="file" required 
                                           class="file-input">
                                </div>
                                
                                <button type="submit" class="submit-btn">
                                    📤 セキュア送信
                                </button>
                            </form>
                            
                            <div class="warning-box">
                                <strong>⚠️ テスト環境の制限:</strong><br>
                                • メール送信は環境変数設定が必要です<br>
                                • 現在はシミュレーションモードで動作<br>
                                • サーバー再起動でデータは消去されます
                            </div>
                        </div>
                        
                        <div class="card">
                            <h2 style="color: #667eea; margin-bottom: 15px;">
                                🚀 新機能：OTP認証
                            </h2>
                            <ul class="feature-list">
                                <li>メールアドレス確認による誤送信防止</li>
                                <li>ワンタイムパスワードでセキュア認証</li>
                                <li>パスワード別送不要</li>
                                <li>10分間の時限付きOTP</li>
                                <li>メールアドレス部分マスキング</li>
                            </ul>
                        </div>
                    </div>
                </body>
                </html>
            `);
        });
        
        // ファイルアップロード処理
        this.app.post('/upload', this.upload.single('file'), async (req, res) => {
            try {
                const { sender, receiver, subject, message } = req.body;
                const file = req.file;
                
                if (!file) {
                    throw new Error('ファイルがアップロードされていません');
                }
                
                // セキュアリンク生成
                const linkId = 'DG' + crypto.randomBytes(6).toString('hex').toUpperCase();
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 7); // 7日間有効
                
                // ファイルデータを保存（Base64）
                const fileData = file.buffer.toString('base64');
                
                this.secureLinkStore.set(linkId, {
                    linkId,
                    sender,
                    receiver,
                    subject,
                    message,
                    fileName: file.originalname,
                    fileData,
                    fileSize: file.size,
                    createdAt: new Date(),
                    expiresAt,
                    status: 'pending',
                    downloadCount: 0
                });
                
                // 通知メール送信（シミュレーション）
                const secureUrl = `${this.baseUrl}/secure/${linkId}`;
                await this.sendNotificationEmail(receiver, subject, secureUrl);
                
                // 結果画面表示
                res.send(`
                    <!DOCTYPE html>
                    <html lang="ja">
                    <head>
                        <meta charset="UTF-8">
                        <title>送信完了 - DataGate</title>
                        <style>
                            body {
                                font-family: 'Segoe UI', sans-serif;
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                min-height: 100vh;
                                display: flex;
                                justify-content: center;
                                align-items: center;
                                padding: 20px;
                            }
                            .success-card {
                                background: white;
                                padding: 40px;
                                border-radius: 15px;
                                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                                max-width: 600px;
                                text-align: center;
                            }
                            .success-icon {
                                font-size: 48px;
                                margin-bottom: 20px;
                            }
                            h1 {
                                color: #10b981;
                                margin-bottom: 20px;
                            }
                            .info-box {
                                background: #f3f4f6;
                                padding: 20px;
                                border-radius: 8px;
                                margin: 20px 0;
                                text-align: left;
                            }
                            .info-box p {
                                margin: 8px 0;
                                color: #555;
                            }
                            .link-box {
                                background: #fef3c7;
                                border: 1px solid #fbbf24;
                                padding: 15px;
                                border-radius: 8px;
                                margin: 20px 0;
                                word-break: break-all;
                            }
                            .back-btn {
                                background: #667eea;
                                color: white;
                                padding: 12px 30px;
                                border-radius: 8px;
                                text-decoration: none;
                                display: inline-block;
                                margin-top: 20px;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="success-card">
                            <div class="success-icon">✅</div>
                            <h1>送信完了</h1>
                            <p>セキュアリンクを生成し、受信者に通知しました</p>
                            
                            <div class="info-box">
                                <p><strong>受信者:</strong> ${receiver}</p>
                                <p><strong>件名:</strong> ${subject}</p>
                                <p><strong>ファイル:</strong> ${file.originalname}</p>
                                <p><strong>有効期限:</strong> 7日間</p>
                            </div>
                            
                            <div class="link-box">
                                <strong>🔗 生成されたリンク（テスト用）:</strong><br>
                                <a href="${secureUrl}" target="_blank">${secureUrl}</a>
                            </div>
                            
                            <a href="/" class="back-btn">新規送信</a>
                        </div>
                    </body>
                    </html>
                `);
                
            } catch (error) {
                console.error('Upload error:', error);
                res.status(500).send(`エラー: ${error.message}`);
            }
        });
        
        // セキュアリンクアクセス（メールアドレス入力画面）
        this.app.get('/secure/:linkId', (req, res) => {
            const linkData = this.secureLinkStore.get(req.params.linkId);
            
            if (!linkData) {
                return res.status(404).send(this.getErrorPage('リンクが見つかりません'));
            }
            
            if (linkData.expiresAt < new Date()) {
                this.secureLinkStore.delete(req.params.linkId);
                return res.status(410).send(this.getErrorPage('リンクの有効期限が切れています'));
            }
            
            // 送信者メールをマスキング
            const maskedSender = this.maskEmail(linkData.sender);
            
            res.send(`
                <!DOCTYPE html>
                <html lang="ja">
                <head>
                    <meta charset="UTF-8">
                    <title>セキュアダウンロード - DataGate</title>
                    <style>
                        body {
                            font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            min-height: 100vh;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            padding: 20px;
                        }
                        .auth-card {
                            background: white;
                            padding: 40px;
                            border-radius: 15px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                            max-width: 500px;
                            width: 100%;
                        }
                        h1 {
                            color: #333;
                            margin-bottom: 30px;
                            font-size: 24px;
                        }
                        .file-info {
                            background: #f3f4f6;
                            padding: 20px;
                            border-radius: 8px;
                            margin-bottom: 30px;
                        }
                        .file-info p {
                            margin: 8px 0;
                            color: #555;
                        }
                        .form-group {
                            margin-bottom: 20px;
                        }
                        label {
                            display: block;
                            margin-bottom: 8px;
                            color: #555;
                            font-weight: 500;
                        }
                        input[type="email"] {
                            width: 100%;
                            padding: 12px;
                            border: 2px solid #e5e5e5;
                            border-radius: 8px;
                            font-size: 16px;
                        }
                        input:focus {
                            outline: none;
                            border-color: #667eea;
                        }
                        .submit-btn {
                            background: #667eea;
                            color: white;
                            padding: 14px;
                            border: none;
                            border-radius: 8px;
                            font-size: 16px;
                            font-weight: 600;
                            cursor: pointer;
                            width: 100%;
                            transition: background 0.3s;
                        }
                        .submit-btn:hover {
                            background: #5a67d8;
                        }
                        .security-note {
                            background: #fef3c7;
                            border-left: 4px solid #fbbf24;
                            padding: 15px;
                            margin-top: 20px;
                            border-radius: 4px;
                        }
                        .security-note h3 {
                            color: #92400e;
                            margin-bottom: 8px;
                            font-size: 14px;
                        }
                        .security-note p {
                            color: #78350f;
                            font-size: 13px;
                            line-height: 1.5;
                        }
                    </style>
                </head>
                <body>
                    <div class="auth-card">
                        <h1>🔒 セキュアダウンロード</h1>
                        <p style="color: #666; margin-bottom: 20px;">本人確認を行います</p>
                        
                        <div class="file-info">
                            <p><strong>件名:</strong> ${linkData.subject}</p>
                            <p><strong>送信者:</strong> ${maskedSender}</p>
                            <p><strong>有効期限:</strong> ${linkData.expiresAt.toLocaleString('ja-JP')}</p>
                        </div>
                        
                        <form action="/secure/${req.params.linkId}/verify" method="POST">
                            <div class="form-group">
                                <label for="email">あなたのメールアドレスを入力してください</label>
                                <input type="email" id="email" name="email" required 
                                       placeholder="receiver@example.com" autofocus>
                            </div>
                            
                            <button type="submit" class="submit-btn">
                                📧 ワンタイムパスワード送信
                            </button>
                        </form>
                        
                        <div class="security-note">
                            <h3>🔒 セキュリティ保護</h3>
                            <p>
                                このシステムは誤送信を防ぐため、登録されたメールアドレスの確認を行います。
                                メールアドレスが一致しない場合、アクセスできません。
                            </p>
                        </div>
                    </div>
                </body>
                </html>
            `);
        });
        
        // メールアドレス検証とOTP送信
        this.app.post('/secure/:linkId/verify', express.urlencoded({ extended: true }), async (req, res) => {
            const linkData = this.secureLinkStore.get(req.params.linkId);
            
            if (!linkData) {
                return res.status(404).send(this.getErrorPage('リンクが見つかりません'));
            }
            
            const { email } = req.body;
            
            // メールアドレス確認
            if (email.toLowerCase() !== linkData.receiver.toLowerCase()) {
                return res.status(403).send(this.getErrorPage('メールアドレスが一致しません'));
            }
            
            // レート制限チェック
            if (this.isRateLimited(email)) {
                return res.status(429).send(this.getErrorPage('送信回数の制限に達しました。5分後に再試行してください'));
            }
            
            // OTP生成（6桁）
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const otpExpires = new Date();
            otpExpires.setMinutes(otpExpires.getMinutes() + 10); // 10分有効
            
            // OTP保存
            const otpKey = `${req.params.linkId}_${email}`;
            this.otpStore.set(otpKey, {
                code: otp,
                expiresAt: otpExpires,
                attempts: 0
            });
            
            // OTPメール送信（シミュレーション）
            await this.sendOTPEmail(email, linkData.subject, otp);
            
            // OTP入力画面表示
            const maskedSender = this.maskEmail(linkData.sender);
            
            res.send(`
                <!DOCTYPE html>
                <html lang="ja">
                <head>
                    <meta charset="UTF-8">
                    <title>認証コード入力 - DataGate</title>
                    <style>
                        body {
                            font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            min-height: 100vh;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            padding: 20px;
                        }
                        .otp-card {
                            background: white;
                            padding: 40px;
                            border-radius: 15px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                            max-width: 500px;
                            width: 100%;
                        }
                        h1 {
                            color: #333;
                            margin-bottom: 20px;
                            font-size: 24px;
                        }
                        .success-message {
                            background: #d1fae5;
                            border: 1px solid #6ee7b7;
                            padding: 15px;
                            border-radius: 8px;
                            margin-bottom: 30px;
                            text-align: center;
                        }
                        .file-info {
                            background: #f3f4f6;
                            padding: 15px;
                            border-radius: 8px;
                            margin-bottom: 30px;
                        }
                        .file-info p {
                            margin: 5px 0;
                            color: #555;
                            font-size: 14px;
                        }
                        .otp-input-group {
                            margin-bottom: 20px;
                        }
                        label {
                            display: block;
                            margin-bottom: 10px;
                            color: #555;
                            font-weight: 500;
                        }
                        .otp-inputs {
                            display: flex;
                            gap: 10px;
                            justify-content: center;
                            margin-bottom: 20px;
                        }
                        .otp-input {
                            width: 50px;
                            height: 50px;
                            text-align: center;
                            font-size: 24px;
                            border: 2px solid #e5e5e5;
                            border-radius: 8px;
                        }
                        .otp-input:focus {
                            outline: none;
                            border-color: #667eea;
                        }
                        .submit-btn {
                            background: #667eea;
                            color: white;
                            padding: 14px;
                            border: none;
                            border-radius: 8px;
                            font-size: 16px;
                            font-weight: 600;
                            cursor: pointer;
                            width: 100%;
                        }
                        .submit-btn:hover {
                            background: #5a67d8;
                        }
                        .timer {
                            text-align: center;
                            color: #666;
                            margin-top: 15px;
                            font-size: 14px;
                        }
                        .demo-note {
                            background: #fff7ed;
                            border: 1px solid #fb923c;
                            padding: 15px;
                            border-radius: 8px;
                            margin-top: 20px;
                        }
                        .demo-note h3 {
                            color: #c2410c;
                            margin-bottom: 8px;
                            font-size: 14px;
                        }
                        .demo-note p {
                            color: #92400e;
                            font-size: 13px;
                        }
                    </style>
                    <script>
                        // OTP入力を単一フィールドで処理
                        function setupOTPInput() {
                            const inputs = document.querySelectorAll('.otp-input');
                            
                            inputs.forEach((input, index) => {
                                input.addEventListener('input', (e) => {
                                    if (e.target.value && index < inputs.length - 1) {
                                        inputs[index + 1].focus();
                                    }
                                    updateHiddenField();
                                });
                                
                                input.addEventListener('keydown', (e) => {
                                    if (e.key === 'Backspace' && !e.target.value && index > 0) {
                                        inputs[index - 1].focus();
                                    }
                                });
                            });
                        }
                        
                        function updateHiddenField() {
                            const inputs = document.querySelectorAll('.otp-input');
                            const otp = Array.from(inputs).map(i => i.value).join('');
                            document.getElementById('otp-hidden').value = otp;
                        }
                        
                        // タイマー設定（10分）
                        function startTimer() {
                            let seconds = 600; // 10分
                            const timerElement = document.getElementById('timer');
                            
                            const interval = setInterval(() => {
                                const minutes = Math.floor(seconds / 60);
                                const secs = seconds % 60;
                                timerElement.textContent = minutes + ':' + (secs < 10 ? '0' : '') + secs;
                                
                                if (seconds <= 0) {
                                    clearInterval(interval);
                                    timerElement.textContent = '期限切れ';
                                }
                                seconds--;
                            }, 1000);
                        }
                        
                        document.addEventListener('DOMContentLoaded', () => {
                            setupOTPInput();
                            startTimer();
                        });
                    </script>
                </head>
                <body>
                    <div class="otp-card">
                        <h1>🔐 認証コード入力</h1>
                        
                        <div class="success-message">
                            ✅ 認証コードを送信しました。メールをご確認ください。
                        </div>
                        
                        <div class="file-info">
                            <p><strong>件名:</strong> ${linkData.subject}</p>
                            <p><strong>送信者:</strong> ${maskedSender}</p>
                            <p><strong>有効期限:</strong> ${linkData.expiresAt.toLocaleString('ja-JP')}</p>
                        </div>
                        
                        <form action="/secure/${req.params.linkId}/authenticate" method="POST">
                            <input type="hidden" name="email" value="${email}">
                            <input type="hidden" id="otp-hidden" name="otp" value="">
                            
                            <div class="otp-input-group">
                                <label>入力されたメールアドレスに6桁の認証コードを送信しました</label>
                                <div class="otp-inputs">
                                    <input type="text" class="otp-input" maxlength="1" pattern="[0-9]">
                                    <input type="text" class="otp-input" maxlength="1" pattern="[0-9]">
                                    <input type="text" class="otp-input" maxlength="1" pattern="[0-9]">
                                    <input type="text" class="otp-input" maxlength="1" pattern="[0-9]">
                                    <input type="text" class="otp-input" maxlength="1" pattern="[0-9]">
                                    <input type="text" class="otp-input" maxlength="1" pattern="[0-9]">
                                </div>
                            </div>
                            
                            <button type="submit" class="submit-btn">
                                🔓 認証してダウンロード
                            </button>
                            
                            <div class="timer">
                                ⏱️ 残り時間: <span id="timer">10:00</span>
                            </div>
                        </form>
                        
                        <div class="demo-note">
                            <h3>📝 デモ環境での認証コード</h3>
                            <p><strong>認証コード: ${otp}</strong></p>
                            <p style="font-size: 12px;">※本番環境ではメールで送信されます</p>
                        </div>
                    </div>
                </body>
                </html>
            `);
        });
        
        // OTP認証とダウンロード
        this.app.post('/secure/:linkId/authenticate', express.urlencoded({ extended: true }), async (req, res) => {
            const linkData = this.secureLinkStore.get(req.params.linkId);
            
            if (!linkData) {
                return res.status(404).send(this.getErrorPage('リンクが見つかりません'));
            }
            
            const { email, otp } = req.body;
            const otpKey = `${req.params.linkId}_${email}`;
            const otpData = this.otpStore.get(otpKey);
            
            if (!otpData) {
                return res.status(403).send(this.getErrorPage('認証情報が見つかりません'));
            }
            
            // OTP有効期限確認
            if (otpData.expiresAt < new Date()) {
                this.otpStore.delete(otpKey);
                return res.status(410).send(this.getErrorPage('認証コードの有効期限が切れました'));
            }
            
            // OTP検証
            if (otpData.code !== otp) {
                otpData.attempts++;
                if (otpData.attempts >= 3) {
                    this.otpStore.delete(otpKey);
                    return res.status(403).send(this.getErrorPage('認証に失敗しました。最初からやり直してください'));
                }
                return res.status(403).send(this.getErrorPage(`認証コードが正しくありません（残り${3 - otpData.attempts}回）`));
            }
            
            // 認証成功 - ダウンロードファイル送信
            this.otpStore.delete(otpKey);
            linkData.status = 'authenticated';
            linkData.downloadCount++;
            
            const fileBuffer = Buffer.from(linkData.fileData, 'base64');
            
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${linkData.fileName}"`);
            res.setHeader('Content-Length', fileBuffer.length);
            res.send(fileBuffer);
        });
        
        // ヘルスチェック
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                version: '1.0.0',
                mode: 'OTP Authentication',
                activeLinks: this.secureLinkStore.size,
                timestamp: new Date().toISOString()
            });
        });
    }
    
    // メールアドレスマスキング
    maskEmail(email) {
        const [localPart, domain] = email.split('@');
        const visibleChars = Math.min(2, Math.floor(localPart.length / 3));
        const masked = localPart.substring(0, visibleChars) + '***';
        return masked + '@' + domain;
    }
    
    // レート制限チェック
    isRateLimited(email) {
        const now = Date.now();
        const limit = this.rateLimitStore.get(email);
        
        if (!limit) {
            this.rateLimitStore.set(email, { count: 1, resetAt: now + 300000 }); // 5分
            return false;
        }
        
        if (now > limit.resetAt) {
            this.rateLimitStore.set(email, { count: 1, resetAt: now + 300000 });
            return false;
        }
        
        if (limit.count >= 3) {
            return true;
        }
        
        limit.count++;
        return false;
    }
    
    // 通知メール送信（シミュレーション）
    async sendNotificationEmail(receiver, subject, secureUrl) {
        const mailContent = `
件名: セキュアファイル受信のお知らせ

セキュアファイル/メッセージが届いています。
件名: ${subject}

以下のURLにアクセスしてください:
${secureUrl}

※ このメールは自動送信です。このメールにお心当たりのない場合は、
お手数ですが、削除していただきますようお願いいたします。
        `;
        
        console.log('=== 通知メール送信（シミュレーション） ===');
        console.log(`宛先: ${receiver}`);
        console.log(mailContent);
        console.log('=====================================');
        
        // 本番環境ではここで実際のメール送信
        // await this.mailTransporter.sendMail({ ... });
    }
    
    // OTPメール送信（シミュレーション）
    async sendOTPEmail(receiver, subject, otp) {
        const mailContent = `
件名: 認証コードのお知らせ

件名: ${subject}
認証コード: ${otp}

このコードは10分間有効です。
ダウンロードページで入力してください。

※ このメールは自動送信です。
        `;
        
        console.log('=== OTPメール送信（シミュレーション） ===');
        console.log(`宛先: ${receiver}`);
        console.log(mailContent);
        console.log('=====================================');
        
        // 本番環境ではここで実際のメール送信
        // await this.mailTransporter.sendMail({ ... });
    }
    
    // エラーページ
    getErrorPage(message) {
        return `
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <title>エラー - DataGate</title>
                <style>
                    body {
                        font-family: 'Segoe UI', sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        padding: 20px;
                    }
                    .error-card {
                        background: white;
                        padding: 40px;
                        border-radius: 15px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                        text-align: center;
                        max-width: 500px;
                    }
                    h1 {
                        color: #ef4444;
                        margin-bottom: 20px;
                    }
                    p {
                        color: #666;
                        line-height: 1.6;
                        margin: 20px 0;
                    }
                    .back-btn {
                        background: #667eea;
                        color: white;
                        padding: 12px 30px;
                        border-radius: 8px;
                        text-decoration: none;
                        display: inline-block;
                        margin-top: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="error-card">
                    <h1>⚠️ エラー</h1>
                    <p>${message}</p>
                    <a href="/" class="back-btn">ホームに戻る</a>
                </div>
            </body>
            </html>
        `;
    }
    
    // クリーンアップタイマー
    startCleanupTimer() {
        setInterval(() => {
            const now = new Date();
            
            // 期限切れリンクの削除
            for (const [linkId, data] of this.secureLinkStore.entries()) {
                if (data.expiresAt < now) {
                    this.secureLinkStore.delete(linkId);
                }
            }
            
            // 期限切れOTPの削除
            for (const [otpKey, data] of this.otpStore.entries()) {
                if (data.expiresAt < now) {
                    this.otpStore.delete(otpKey);
                }
            }
            
            // レート制限のリセット
            for (const [email, limit] of this.rateLimitStore.entries()) {
                if (Date.now() > limit.resetAt) {
                    this.rateLimitStore.delete(email);
                }
            }
        }, 60000); // 1分ごと
    }
    
    start() {
        this.app.listen(this.port, () => {
            console.log('==========================================');
            console.log('DataGate OTP Server v1.0.0');
            console.log(`Port: ${this.port}`);
            console.log(`URL: ${this.baseUrl}`);
            console.log('Mode: OTP Authentication (Demo)');
            console.log('==========================================');
        });
    }
}

// サーバー起動
const server = new DataGateOTPServer();
server.start();
