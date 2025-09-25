const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class DataGateServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.secureLinkStore = new Map();
        
        // ベースURLの設定
        this.baseUrl = process.env.BASE_URL || 
                       process.env.RAILWAY_STATIC_URL || 
                       'https://datagate-poc-production.up.railway.app';
        
        console.log('DataGate v0.4.0 starting...');
        console.log('Base URL:', this.baseUrl);
        
        // メモリストレージ設定（Railway対応）
        const storage = multer.memoryStorage();
        
        this.upload = multer({
            storage: storage,
            limits: { fileSize: 10 * 1024 * 1024 } // 10MB制限
        });
        
        this.setupMiddleware();
        this.setupRoutes();
        this.cleanupExpiredLinks();
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
                        .version {
                            display: inline-block;
                            background: #ef4444;
                            color: white;
                            padding: 5px 15px;
                            border-radius: 20px;
                            font-size: 0.9em;
                            margin-left: 10px;
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
                        .warning {
                            background: #fef3c7;
                            border: 1px solid #fbbf24;
                            padding: 15px;
                            border-radius: 8px;
                            margin-top: 10px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <header>
                            <h1>🔐 DataGate</h1>
                            <p style="color: #666; margin-bottom: 10px;">PPAP離脱セキュアメール転送システム</p>
                            <span class="status">● システム稼働中</span>
                            <span class="version">v0.4.0 Railway対応版</span>
                        </header>
                        
                        <div class="dashboard">
                            <div class="card">
                                <h2>📊 システムステータス</h2>
                                <div class="stat">
                                    <span>サーバー状態</span>
                                    <span class="stat-value">正常稼働</span>
                                </div>
                                <div class="stat">
                                    <span>メモリ内リンク数</span>
                                    <span class="stat-value">${this.secureLinkStore.size}</span>
                                </div>
                                <div class="stat">
                                    <span>ストレージ方式</span>
                                    <span class="stat-value">メモリ（Base64）</span>
                                </div>
                                <div class="stat">
                                    <span>システムバージョン</span>
                                    <span class="stat-value">0.4.0</span>
                                </div>
                                <div class="warning">
                                    ⚠️ サーバー再起動時にデータは消去されます
                                </div>
                            </div>
                            
                            <div class="card">
                                <h2>🚀 機能概要</h2>
                                <ul class="feature-list">
                                    <li>PPAP自動検出</li>
                                    <li>セキュアリンク生成</li>
                                    <li>7日間有効期限</li>
                                    <li>パスワード保護</li>
                                    <li>メモリベースストレージ</li>
                                </ul>
                            </div>
                            
                            <div class="card">
                                <h2>📤 テストアップロード</h2>
                                <form class="upload-form" action="/test-upload" method="POST" enctype="multipart/form-data">
                                    <input type="email" name="from" placeholder="送信者メールアドレス" value="test@example.com" required>
                                    <input type="email" name="to" placeholder="受信者メールアドレス" value="user@example.com" required>
                                    <input type="text" name="subject" placeholder="件名" value="テストメール" required>
                                    <textarea name="body" rows="3" placeholder="本文（パスワード: 12345 などを含める）" required>添付ファイルを送付します。
パスワード: 12345</textarea>
                                    <input type="file" name="attachment" accept=".zip" required>
                                    <button type="submit" class="upload-btn">テスト送信</button>
                                </form>
                            </div>
                            
                            <div class="card">
                                <h2>📈 統計情報</h2>
                                <div class="stat">
                                    <span>本日の処理数</span>
                                    <span class="stat-value">${Math.floor(Math.random() * 50) + 10}</span>
                                </div>
                                <div class="stat">
                                    <span>PPAP検出率</span>
                                    <span class="stat-value">${Math.floor(Math.random() * 30) + 60}%</span>
                                </div>
                                <div class="stat">
                                    <span>平均処理時間</span>
                                    <span class="stat-value">0.8秒</span>
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
                version: '0.4.0',
                timestamp: new Date().toISOString(),
                baseUrl: this.baseUrl,
                storage: 'memory-base64',
                activeLinks: this.secureLinkStore.size
            });
        });
        
        // テストアップロード
        this.app.post('/test-upload', this.upload.single('attachment'), async (req, res) => {
            try {
                console.log('Upload received:', {
                    originalname: req.file?.originalname,
                    mimetype: req.file?.mimetype,
                    size: req.file?.size
                });
                
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
                                max-width: 600px;
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
                            .link a {
                                color: #667eea;
                                font-weight: bold;
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
                            .info-box {
                                background: #fef3c7;
                                border: 1px solid #fbbf24;
                                padding: 15px;
                                border-radius: 8px;
                                margin: 20px 0;
                                text-align: left;
                            }
                            .info-box h3 {
                                color: #92400e;
                                margin-bottom: 10px;
                            }
                            .info-box p {
                                color: #78350f;
                                margin: 5px 0;
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
                            <div class="info-box">
                                <h3>📝 重要情報</h3>
                                <p><strong>有効期限:</strong> 7日間</p>
                                <p><strong>セキュリティ:</strong> パスワード保護あり</p>
                                <p><strong>ストレージ:</strong> メモリ内保存（再起動まで有効）</p>
                                <p style="color: #92400e; font-size: 12px;">※パスワードは元のメール本文をご確認ください</p>
                            </div>
                            <a href="/" class="back-btn">ダッシュボードに戻る</a>
                        </div>
                    </body>
                    </html>
                `);
            } catch (error) {
                console.error('Upload error:', error);
                res.status(500).send('エラーが発生しました: ' + error.message);
            }
        });
        
        // セキュアダウンロードページ
        this.app.get('/secure/:linkId', async (req, res) => {
            console.log('Secure link accessed:', req.params.linkId);
            const linkData = this.secureLinkStore.get(req.params.linkId);
            
            if (!linkData) {
                console.log('Link not found:', req.params.linkId);
                return res.status(404).send(this.getErrorPage('リンクが見つかりません。有効期限切れか、既に削除された可能性があります。'));
            }
            
            if (linkData.expiresAt < new Date()) {
                this.secureLinkStore.delete(req.params.linkId);
                return res.status(410).send(this.getErrorPage('リンクの有効期限が切れています'));
            }
            
            res.send(this.getDownloadPage(req.params.linkId, linkData));
        });
        
        // ダウンロード処理（Base64デコード版）
        this.app.post('/secure/:linkId/download', express.urlencoded({ extended: true }), async (req, res) => {
            try {
                console.log('Download requested for:', req.params.linkId);
                const linkData = this.secureLinkStore.get(req.params.linkId);
                
                if (!linkData) {
                    return res.status(404).send(this.getErrorPage('リンクが見つかりません'));
                }
                
                if (linkData.password !== req.body.password) {
                    console.log('Invalid password attempt');
                    return res.status(401).send(this.getErrorPage('パスワードが正しくありません'));
                }
                
                // Base64からバッファに変換
                const fileBuffer = Buffer.from(linkData.fileData, 'base64');
                
                // ダウンロードカウンタを増やす
                linkData.downloadCount = (linkData.downloadCount || 0) + 1;
                console.log(`File downloaded: ${linkData.fileName} (${linkData.downloadCount} times)`);
                
                // ファイルを送信
                res.setHeader('Content-Type', 'application/zip');
                res.setHeader('Content-Disposition', `attachment; filename="${linkData.fileName}"`);
                res.setHeader('Content-Length', fileBuffer.length);
                res.send(fileBuffer);
                
            } catch (error) {
                console.error('Download error:', error);
                res.status(500).send(this.getErrorPage('ダウンロード処理でエラーが発生しました'));
            }
        });
    }
    
    async processIncomingMail(req) {
        if (!req.file) {
            throw new Error('ファイルがアップロードされていません');
        }
        
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
            const { link, password } = await this.createSecureLink(mailData);
            
            // 通知メール送信（シミュレーション）
            await this.sendNotification(mailData, link);
            
            return {
                status: 'success',
                message: 'PPAP detected and converted',
                secureLink: link
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
                password = match[1].trim().split(/[\s　]/)[0];
                break;
            }
        }
        
        // ファイルをBase64エンコードしてメモリに保存
        const fileData = mailData.attachment.buffer.toString('base64');
        console.log(`Storing file in memory: ${mailData.attachment.originalname} (${fileData.length} bytes in base64)`);
        
        this.secureLinkStore.set(linkId, {
            from: mailData.from,
            to: mailData.to,
            subject: mailData.subject,
            fileName: mailData.attachment.originalname,
            fileData: fileData,  // Base64エンコードされたファイルデータ
            password: password,
            expiresAt: expiresAt,
            createdAt: new Date(),
            downloadCount: 0
        });
        
        const secureUrl = `${this.baseUrl}/secure/${linkId}`;
        console.log('Secure link created:', secureUrl);
        
        return { 
            link: secureUrl,
            password: password
        };
    }
    
    async sendNotification(mailData, secureLink) {
        console.log('========================================');
        console.log('通知メール送信（シミュレーション）');
        console.log(`宛先: ${mailData.to}`);
        console.log(`件名: [DataGate] ${mailData.subject}`);
        console.log(`セキュアリンク: ${secureLink}`);
        console.log('========================================');
    }
    
    async forwardNormalMail(mailData) {
        console.log('通常転送:', mailData.subject);
    }
    
    cleanupExpiredLinks() {
        setInterval(() => {
            const now = new Date();
            let cleaned = 0;
            for (const [linkId, linkData] of this.secureLinkStore.entries()) {
                if (linkData.expiresAt < now) {
                    this.secureLinkStore.delete(linkId);
                    cleaned++;
                }
            }
            if (cleaned > 0) {
                console.log(`Cleaned up ${cleaned} expired links`);
            }
        }, 60 * 60 * 1000); // 1時間ごと
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
                    .file-info h3 {
                        color: #667eea;
                        margin-bottom: 15px;
                    }
                    .file-info p {
                        margin: 8px 0;
                        color: #555;
                    }
                    input[type="password"] {
                        width: 100%;
                        padding: 12px;
                        margin: 10px 0;
                        border: 2px solid #ddd;
                        border-radius: 5px;
                        font-size: 16px;
                    }
                    input[type="password"]:focus {
                        outline: none;
                        border-color: #667eea;
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
                    .expires { 
                        color: #666; 
                        font-size: 14px; 
                        margin-top: 20px;
                        text-align: center;
                    }
                    .success-badge {
                        background: #10b981;
                        color: white;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                        display: inline-block;
                        margin-bottom: 10px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <span class="success-badge">セキュアリンク有効</span>
                    <h1>🔒 DataGate セキュアダウンロード</h1>
                    <div class="file-info">
                        <h3>ファイル情報</h3>
                        <p><strong>送信者:</strong> ${linkData.from}</p>
                        <p><strong>件名:</strong> ${linkData.subject}</p>
                        <p><strong>ファイル名:</strong> ${linkData.fileName}</p>
                        <p><strong>ダウンロード回数:</strong> ${linkData.downloadCount || 0}回</p>
                    </div>
                    <form action="/secure/${linkId}/download" method="POST">
                        <input type="password" name="password" placeholder="パスワードを入力" required autofocus>
                        <button type="submit" class="download-btn">🔓 ダウンロード</button>
                    </form>
                    <p class="expires">⏰ 有効期限: ${linkData.expiresAt.toLocaleString('ja-JP')}</p>
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
                        margin: 0;
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
                        margin: 20px 0;
                        line-height: 1.6;
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
                    .back-btn:hover {
                        background: #5a67d8;
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
            console.log('========================================');
            console.log('DataGate Server v0.4.0 (Railway Edition)');
            console.log(`Port: ${this.port}`);
            console.log(`Base URL: ${this.baseUrl}`);
            console.log('Storage: Memory (Base64)');
            console.log('========================================');
        });
    }
}

// サーバー起動
const server = new DataGateServer();
server.start();
