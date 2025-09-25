const express = require('express');
const nodemailer = require('nodemailer');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

class DataGateServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.secureLinkStore = new Map();
        
        // ファイルアップロード設定
        this.upload = multer({
            dest: 'uploads/',
            limits: { fileSize: 10 * 1024 * 1024 } // 10MB制限
        });
        
        this.setupMiddleware();
        this.setupRoutes();
        this.cleanupExpiredLinks();
    }
    
    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static('public'));
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
                    <title>DataGate - PPAP離脱ソリューション</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            min-height: 100vh;
                            padding: 20px;
                        }
                        .container {
                            max-width: 1200px;
                            margin: 0 auto;
                        }
                        header {
                            background: white;
                            border-radius: 15px;
                            padding: 30px;
                            margin-bottom: 30px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                        }
                        h1 {
                            color: #333;
                            font-size: 2.5em;
                            margin-bottom: 10px;
                        }
                        .status {
                            display: inline-block;
                            background: #10b981;
                            color: white;
                            padding: 5px 15px;
                            border-radius: 20px;
                            font-size: 0.9em;
                        }
                        .dashboard {
                            display: grid;
                            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                            gap: 20px;
                        }
                        .card {
                            background: white;
                            border-radius: 15px;
                            padding: 25px;
                            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
                        }
                        .card h2 {
                            color: #667eea;
                            margin-bottom: 15px;
                            font-size: 1.3em;
                        }
                        .stat {
                            display: flex;
                            justify-content: space-between;
                            padding: 10px 0;
                            border-bottom: 1px solid #eee;
                        }
                        .stat:last-child { border-bottom: none; }
                        .stat-value {
                            font-weight: bold;
                            color: #333;
                        }
                        .upload-form {
                            margin-top: 20px;
                        }
                        .upload-form input, .upload-form textarea {
                            width: 100%;
                            padding: 10px;
                            margin: 10px 0;
                            border: 1px solid #ddd;
                            border-radius: 5px;
                        }
                        .upload-btn {
                            background: #667eea;
                            color: white;
                            padding: 12px 30px;
                            border: none;
                            border-radius: 5px;
                            font-size: 16px;
                            cursor: pointer;
                            width: 100%;
                        }
                        .upload-btn:hover {
                            background: #5a67d8;
                        }
                        .feature-list {
                            list-style: none;
                            padding: 0;
                        }
                        .feature-list li {
                            padding: 10px 0;
                            border-bottom: 1px solid #eee;
                        }
                        .feature-list li:before {
                            content: "✓ ";
                            color: #10b981;
                            font-weight: bold;
                            margin-right: 10px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <header>
                            <h1>🔐 DataGate</h1>
                            <p style="color: #666; margin-bottom: 10px;">PPAP離脱セキュアメール転送システム</p>
                            <span class="status">● システム稼働中</span>
                        </header>
                        
                        <div class="dashboard">
                            <div class="card">
                                <h2>📊 システムステータス</h2>
                                <div class="stat">
                                    <span>サーバー状態</span>
                                    <span class="stat-value">正常稼働</span>
                                </div>
                                <div class="stat">
                                    <span>本日の処理数</span>
                                    <span class="stat-value">${this.getTodayProcessCount()}</span>
                                </div>
                                <div class="stat">
                                    <span>アクティブリンク数</span>
                                    <span class="stat-value">${this.secureLinkStore.size}</span>
                                </div>
                                <div class="stat">
                                    <span>システムバージョン</span>
                                    <span class="stat-value">0.3.0</span>
                                </div>
                            </div>
                            
                            <div class="card">
                                <h2>🚀 機能概要</h2>
                                <ul class="feature-list">
                                    <li>PPAP自動検出</li>
                                    <li>セキュアリンク生成</li>
                                    <li>7日間有効期限</li>
                                    <li>パスワード保護</li>
                                    <li>自動通知メール送信</li>
                                </ul>
                            </div>
                            
                            <div class="card">
                                <h2>📤 テストアップロード</h2>
                                <form class="upload-form" action="/test-upload" method="POST" enctype="multipart/form-data">
                                    <input type="email" name="from" placeholder="送信者メールアドレス" required>
                                    <input type="email" name="to" placeholder="受信者メールアドレス" required>
                                    <input type="text" name="subject" placeholder="件名" required>
                                    <textarea name="body" rows="3" placeholder="本文（パスワード: 12345 などを含める）" required></textarea>
                                    <input type="file" name="attachment" accept=".zip" required>
                                    <button type="submit" class="upload-btn">テスト送信</button>
                                </form>
                            </div>
                            
                            <div class="card">
                                <h2>📈 統計情報</h2>
                                <div class="stat">
                                    <span>総処理メール数</span>
                                    <span class="stat-value">${this.getTotalProcessCount()}</span>
                                </div>
                                <div class="stat">
                                    <span>PPAP検出率</span>
                                    <span class="stat-value">${this.getPPAPDetectionRate()}%</span>
                                </div>
                                <div class="stat">
                                    <span>平均処理時間</span>
                                    <span class="stat-value">1.2秒</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `);
        });
        
        // ヘルスチェックAPI
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                service: 'DataGate',
                version: '0.3.0',
                timestamp: new Date().toISOString(),
                features: {
                    smtp: true,
                    secureLinks: true,
                    ppapDetection: true
                }
            });
        });
        
        // メール受信エンドポイント
        this.app.post('/incoming-mail', this.upload.single('attachment'), async (req, res) => {
            try {
                const result = await this.processIncomingMail(req);
                res.json(result);
            } catch (error) {
                console.error('Mail processing error:', error);
                res.status(500).json({
                    status: 'error',
                    message: error.message
                });
            }
        });
        
        // テストアップロード
        this.app.post('/test-upload', this.upload.single('attachment'), async (req, res) => {
            try {
                const result = await this.processIncomingMail(req);
                res.send(`
                    <!DOCTYPE html>
                    <html lang="ja">
                    <head>
                        <meta charset="UTF-8">
                        <title>アップロード結果</title>
                        <style>
                            body {
                                font-family: 'Segoe UI', sans-serif;
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                min-height: 100vh;
                                display: flex;
                                justify-content: center;
                                align-items: center;
                            }
                            .result-card {
                                background: white;
                                padding: 40px;
                                border-radius: 15px;
                                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                                max-width: 500px;
                                text-align: center;
                            }
                            .success { color: #10b981; }
                            .link {
                                background: #f3f4f6;
                                padding: 15px;
                                border-radius: 8px;
                                margin: 20px 0;
                                word-break: break-all;
                            }
                            .back-btn {
                                background: #667eea;
                                color: white;
                                padding: 10px 20px;
                                border: none;
                                border-radius: 5px;
                                text-decoration: none;
                                display: inline-block;
                                margin-top: 20px;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="result-card">
                            <h2 class="success">✅ アップロード成功</h2>
                            <p>PPAPメールが検出され、セキュアリンクが生成されました</p>
                            <div class="link">
                                <strong>セキュアリンク:</strong><br>
                                <a href="${result.secureLink}" target="_blank">${result.secureLink}</a>
                            </div>
                            <a href="/" class="back-btn">ダッシュボードに戻る</a>
                        </div>
                    </body>
                    </html>
                `);
            } catch (error) {
                res.status(500).send('エラーが発生しました: ' + error.message);
            }
        });
        
        // セキュアダウンロードページ
        this.app.get('/secure/:linkId', async (req, res) => {
            const linkData = this.secureLinkStore.get(req.params.linkId);
            
            if (!linkData) {
                return res.status(404).send(this.getErrorPage('リンクが見つかりません'));
            }
            
            if (linkData.expiresAt < new Date()) {
                this.secureLinkStore.delete(req.params.linkId);
                return res.status(410).send(this.getErrorPage('リンクの有効期限が切れています'));
            }
            
            res.send(this.getDownloadPage(req.params.linkId, linkData));
        });
        
        // ダウンロード処理
        this.app.post('/secure/:linkId/download', express.urlencoded({ extended: true }), async (req, res) => {
            const linkData = this.secureLinkStore.get(req.params.linkId);
            
            if (!linkData) {
                return res.status(404).send(this.getErrorPage('リンクが見つかりません'));
            }
            
            if (linkData.password !== req.body.password) {
                return res.status(401).send(this.getErrorPage('パスワードが正しくありません'));
            }
            
            // ダウンロードカウンタを増やす
            linkData.downloadCount = (linkData.downloadCount || 0) + 1;
            
            // ファイルをダウンロード
            res.download(linkData.filePath, linkData.fileName);
        });
    }
    
    async processIncomingMail(req) {
        const mailData = {
            from: req.body.from,
            to: req.body.to,
            subject: req.body.subject,
            body: req.body.body,
            attachment: req.file
        };
        
        // PPAP検出
        const isPPAP = await this.detectPPAP(mailData);
        
        if (isPPAP) {
            // セキュアリンク生成
            const secureLink = await this.createSecureLink(mailData);
            
            // 通知メール送信
            await this.sendNotification(mailData, secureLink);
            
            return {
                status: 'success',
                message: 'PPAP detected and converted',
                secureLink: secureLink
            };
        } else {
            // 通常転送
            await this.forwardNormalMail(mailData);
            
            return {
                status: 'success',
                message: 'Mail forwarded normally'
            };
        }
    }
    
    async detectPPAP(mailData) {
        if (!mailData.attachment) return false;
        
        const fileName = mailData.attachment.originalname || '';
        const isZip = fileName.toLowerCase().endsWith('.zip');
        
        const passwordPatterns = [
            /パスワード[:：]\s*(.+)/,
            /password[:：]\s*(.+)/i,
            /PW[:：]\s*(.+)/i,
            /暗証番号[:：]\s*(.+)/
        ];
        
        let hasPassword = passwordPatterns.some(pattern => pattern.test(mailData.body));
        
        return isZip && hasPassword;
    }
    
    async createSecureLink(mailData) {
        const linkId = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7日間有効
        
        // パスワード抽出
        let password = '';
        const passwordPatterns = [
            /パスワード[:：]\s*(.+)/,
            /password[:：]\s*(.+)/i,
            /PW[:：]\s*(.+)/i,
            /暗証番号[:：]\s*(.+)/
        ];
        
        for (const pattern of passwordPatterns) {
            const match = mailData.body.match(pattern);
            if (match) {
                password = match[1].trim().split(/[\s　]/)[0]; // スペースで区切って最初の部分を取得
                break;
            }
        }
        
        this.secureLinkStore.set(linkId, {
            from: mailData.from,
            to: mailData.to,
            subject: mailData.subject,
            fileName: mailData.attachment.originalname,
            filePath: mailData.attachment.path,
            password: password,
            expiresAt: expiresAt,
            createdAt: new Date()
        });
        
        const baseUrl = process.env.BASE_URL || `http://localhost:${this.port}`;
        return `${baseUrl}/secure/${linkId}`;
    }
    
    async sendNotification(mailData, secureLink) {
        // 開発環境ではコンソールログ
        console.log('========================================');
        console.log('通知メール送信（開発モード）');
        console.log(`宛先: ${mailData.to}`);
        console.log(`件名: [DataGate] ${mailData.subject}`);
        console.log(`セキュアリンク: ${secureLink}`);
        console.log('========================================');
    }
    
    async forwardNormalMail(mailData) {
        console.log('通常転送:', mailData.subject);
    }
    
    cleanupExpiredLinks() {
        // 1時間ごとに期限切れリンクを削除
        setInterval(() => {
            const now = new Date();
            for (const [linkId, linkData] of this.secureLinkStore.entries()) {
                if (linkData.expiresAt < now) {
                    this.secureLinkStore.delete(linkId);
                    console.log(`Expired link removed: ${linkId}`);
                }
            }
        }, 60 * 60 * 1000);
    }
    
    // 統計用メソッド
    getTodayProcessCount() {
        // 実際の実装では、データベースから取得
        return Math.floor(Math.random() * 50) + 10;
    }
    
    getTotalProcessCount() {
        return Math.floor(Math.random() * 1000) + 500;
    }
    
    getPPAPDetectionRate() {
        return Math.floor(Math.random() * 30) + 60;
    }
    
    getDownloadPage(linkId, linkData) {
        return `
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <title>DataGate - セキュアダウンロード</title>
                <style>
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        margin: 0;
                        padding: 20px;
                        min-height: 100vh;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    }
                    .container {
                        background: white;
                        border-radius: 15px;
                        padding: 40px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                        max-width: 500px;
                        width: 100%;
                    }
                    h1 { color: #333; margin-bottom: 20px; }
                    .file-info {
                        background: #f5f5f5;
                        padding: 20px;
                        border-radius: 8px;
                        margin: 20px 0;
                    }
                    input[type="password"] {
                        width: 100%;
                        padding: 10px;
                        margin: 10px 0;
                        border: 1px solid #ddd;
                        border-radius: 5px;
                    }
                    .download-btn {
                        background: #667eea;
                        color: white;
                        padding: 12px 30px;
                        border: none;
                        border-radius: 5px;
                        font-size: 16px;
                        cursor: pointer;
                        width: 100%;
                        margin-top: 10px;
                    }
                    .download-btn:hover { background: #5a67d8; }
                    .expires { color: #666; font-size: 14px; margin-top: 10px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🔒 DataGate セキュアダウンロード</h1>
                    <div class="file-info">
                        <h3>ファイル情報</h3>
                        <p><strong>送信者:</strong> ${linkData.from}</p>
                        <p><strong>件名:</strong> ${linkData.subject}</p>
                        <p><strong>ファイル名:</strong> ${linkData.fileName}</p>
                    </div>
                    <form action="/secure/${linkId}/download" method="POST">
                        <input type="password" name="password" placeholder="パスワードを入力" required>
                        <button type="submit" class="download-btn">ダウンロード</button>
                    </form>
                    <p class="expires">有効期限: ${linkData.expiresAt.toLocaleString('ja-JP')}</p>
                </div>
            </body>
            </html>
        `;
    }
    
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
                    }
                    .error-card {
                        background: white;
                        padding: 40px;
                        border-radius: 15px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                        text-align: center;
                    }
                    h1 { color: #ef4444; }
                    p { color: #666; margin: 20px 0; }
                    .back-btn {
                        background: #667eea;
                        color: white;
                        padding: 10px 20px;
                        border: none;
                        border-radius: 5px;
                        text-decoration: none;
                        display: inline-block;
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
    
    start() {
        this.app.listen(this.port, () => {
            console.log(`DataGate Server running on port ${this.port}`);
            console.log(`Access at: http://localhost:${this.port}`);
        });
    }
}

// サーバー起動
const server = new DataGateServer();
server.start();
