const express = require('express');
const nodemailer = require('nodemailer');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// メール受信設定
class DataGateMailServer {
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
    }
    
    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
    }
    
    setupRoutes() {
        // ヘルスチェック
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                service: 'DataGate SMTP Server',
                timestamp: new Date().toISOString()
            });
        });
        
        // メール受信エンドポイント（Webhook用）
        this.app.post('/incoming-mail', this.upload.single('attachment'), async (req, res) => {
            try {
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
                    
                    res.json({
                        status: 'success',
                        message: 'PPAP detected and converted',
                        secureLink: secureLink
                    });
                } else {
                    // 通常転送
                    await this.forwardNormalMail(mailData);
                    
                    res.json({
                        status: 'success',
                        message: 'Mail forwarded normally'
                    });
                }
            } catch (error) {
                console.error('Mail processing error:', error);
                res.status(500).json({
                    status: 'error',
                    message: error.message
                });
            }
        });
        
        // セキュアダウンロードページ
        this.app.get('/secure/:linkId', async (req, res) => {
            const linkData = this.secureLinkStore.get(req.params.linkId);
            
            if (!linkData) {
                return res.status(404).send('リンクが見つかりません');
            }
            
            if (linkData.expiresAt < new Date()) {
                this.secureLinkStore.delete(req.params.linkId);
                return res.status(410).send('リンクの有効期限が切れています');
            }
            
            res.send(`
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
                        h1 {
                            color: #333;
                            margin-bottom: 20px;
                        }
                        .file-info {
                            background: #f5f5f5;
                            padding: 20px;
                            border-radius: 8px;
                            margin: 20px 0;
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
                            margin-top: 20px;
                        }
                        .download-btn:hover {
                            background: #5a67d8;
                        }
                        .expires {
                            color: #666;
                            font-size: 14px;
                            margin-top: 10px;
                        }
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
                        <form action="/secure/${req.params.linkId}/download" method="POST">
                            <input type="password" name="password" placeholder="パスワードを入力" 
                                   style="width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px;">
                            <button type="submit" class="download-btn">ダウンロード</button>
                        </form>
                        <p class="expires">有効期限: ${linkData.expiresAt.toLocaleString('ja-JP')}</p>
                    </div>
                </body>
                </html>
            `);
        });
        
        // ファイルダウンロード処理
        this.app.post('/secure/:linkId/download', express.urlencoded({ extended: true }), async (req, res) => {
            const linkData = this.secureLinkStore.get(req.params.linkId);
            
            if (!linkData || linkData.password !== req.body.password) {
                return res.status(401).send('パスワードが正しくありません');
            }
            
            // ダウンロード処理
            res.download(linkData.filePath, linkData.fileName);
        });
    }
    
    async detectPPAP(mailData) {
        // 添付ファイルがZIPかチェック
        if (!mailData.attachment) return false;
        
        const fileName = mailData.attachment.originalname || '';
        const isZip = fileName.toLowerCase().endsWith('.zip');
        
        // メール本文にパスワードらしき文字列があるかチェック
        const passwordPatterns = [
            /パスワード[:：]\s*(.+)/,
            /password[:：]\s*(.+)/i,
            /PW[:：]\s*(.+)/i,
            /暗証番号[:：]\s*(.+)/
        ];
        
        let hasPassword = false;
        for (const pattern of passwordPatterns) {
            if (pattern.test(mailData.body)) {
                hasPassword = true;
                break;
            }
        }
        
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
                password = match[1].trim();
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
            expiresAt: expiresAt
        });
        
        const baseUrl = process.env.BASE_URL || 'https://datagate-poc-production.up.railway.app';
        return `${baseUrl}/secure/${linkId}`;
    }
    
    async sendNotification(mailData, secureLink) {
        // 本番環境ではSMTP設定が必要
        console.log('Notification email would be sent:');
        console.log(`To: ${mailData.to}`);
        console.log(`Subject: [DataGate] ${mailData.subject}`);
        console.log(`Secure Link: ${secureLink}`);
        
        // TODO: 実際のメール送信実装
        // const transporter = nodemailer.createTransport({...});
        // await transporter.sendMail({...});
    }
    
    async forwardNormalMail(mailData) {
        // 通常転送処理
        console.log('Normal mail forward:', mailData.subject);
    }
    
    start() {
        this.app.listen(this.port, () => {
            console.log(`DataGate SMTP Server running on port ${this.port}`);
        });
    }
}

// サーバー起動
const server = new DataGateMailServer();
server.start();
