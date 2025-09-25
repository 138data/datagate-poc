const express = require('express');
const multer = require('multer');
const crypto = require('crypto');

class DataGateServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.baseUrl = process.env.BASE_URL || 'https://datagate-poc-production.up.railway.app';
        
        // データストア
        this.secureLinkStore = new Map();
        this.otpStore = new Map();
        
        // ファイルアップロード設定
        const storage = multer.memoryStorage();
        this.upload = multer({
            storage: storage,
            limits: { fileSize: 10 * 1024 * 1024 }
        });
        
        this.setupMiddleware();
        this.setupRoutes();
    }
    
    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
    }
    
    setupRoutes() {
        // メインページ
        this.app.get('/', (req, res) => {
            res.send(`
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DataGate v1.0.1</title>
    <style>
        body {
            font-family: 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            margin-bottom: 20px;
        }
        input, textarea {
            width: 100%;
            padding: 10px;
            margin: 10px 0;
            border: 1px solid #ddd;
            border-radius: 5px;
            box-sizing: border-box;
        }
        button {
            background: #667eea;
            color: white;
            padding: 12px 30px;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            width: 100%;
        }
        button:hover {
            background: #5a67d8;
        }
        .version {
            background: #ef4444;
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 12px;
            display: inline-block;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 DataGate <span class="version">v1.0.1 Lite</span></h1>
        <p>OTP認証システム（軽量版）</p>
        
        <form action="/upload" method="POST" enctype="multipart/form-data">
            <input type="email" name="sender" placeholder="送信者メール" required>
            <input type="email" name="receiver" placeholder="受信者メール" required>
            <input type="text" name="subject" placeholder="件名" required>
            <textarea name="message" rows="3" placeholder="メッセージ（任意）"></textarea>
            <input type="file" name="file" required>
            <button type="submit">📤 送信</button>
        </form>
    </div>
</body>
</html>
            `);
        });
        
        // アップロード処理
        this.app.post('/upload', this.upload.single('file'), (req, res) => {
            try {
                const linkId = 'DG' + crypto.randomBytes(6).toString('hex').toUpperCase();
                const fileData = req.file.buffer.toString('base64');
                
                this.secureLinkStore.set(linkId, {
                    sender: req.body.sender,
                    receiver: req.body.receiver,
                    subject: req.body.subject,
                    fileName: req.file.originalname,
                    fileData: fileData,
                    createdAt: new Date()
                });
                
                const secureUrl = `${this.baseUrl}/secure/${linkId}`;
                
                res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>送信完了</title>
    <style>
        body { 
            font-family: sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 50px;
            text-align: center;
        }
        .card {
            background: white;
            max-width: 500px;
            margin: 0 auto;
            padding: 30px;
            border-radius: 15px;
        }
        .link {
            background: #f3f4f6;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            word-break: break-all;
        }
        a { color: #667eea; }
    </style>
</head>
<body>
    <div class="card">
        <h1>✅ 送信完了</h1>
        <p>受信者: ${req.body.receiver}</p>
        <div class="link">
            <a href="${secureUrl}">${secureUrl}</a>
        </div>
        <a href="/">新規送信</a>
    </div>
</body>
</html>
                `);
            } catch (error) {
                res.status(500).send('エラー: ' + error.message);
            }
        });
        
        // メール確認画面
        this.app.get('/secure/:linkId', (req, res) => {
            const data = this.secureLinkStore.get(req.params.linkId);
            if (!data) {
                return res.status(404).send('リンクが見つかりません');
            }
            
            res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>本人確認</title>
    <style>
        body { 
            font-family: sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 50px;
        }
        .card {
            background: white;
            max-width: 500px;
            margin: 0 auto;
            padding: 30px;
            border-radius: 15px;
        }
        input, button {
            width: 100%;
            padding: 12px;
            margin: 10px 0;
            border: 1px solid #ddd;
            border-radius: 5px;
            box-sizing: border-box;
        }
        button {
            background: #667eea;
            color: white;
            border: none;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="card">
        <h2>🔒 本人確認</h2>
        <p>件名: ${data.subject}</p>
        <p>送信者: ${data.sender.substring(0,3)}***@${data.sender.split('@')[1]}</p>
        
        <form action="/secure/${req.params.linkId}/verify" method="POST">
            <input type="email" name="email" placeholder="あなたのメールアドレス" required>
            <button type="submit">OTP送信</button>
        </form>
    </div>
</body>
</html>
            `);
        });
        
        // OTP送信
        this.app.post('/secure/:linkId/verify', express.urlencoded({ extended: true }), (req, res) => {
            const data = this.secureLinkStore.get(req.params.linkId);
            if (!data) {
                return res.status(404).send('リンクが見つかりません');
            }
            
            if (req.body.email !== data.receiver) {
                return res.status(403).send('メールアドレスが一致しません');
            }
            
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            this.otpStore.set(req.params.linkId, otp);
            
            res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>OTP入力</title>
    <style>
        body { 
            font-family: sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 50px;
        }
        .card {
            background: white;
            max-width: 500px;
            margin: 0 auto;
            padding: 30px;
            border-radius: 15px;
        }
        input, button {
            width: 100%;
            padding: 12px;
            margin: 10px 0;
            border: 1px solid #ddd;
            border-radius: 5px;
            box-sizing: border-box;
        }
        button {
            background: #667eea;
            color: white;
            border: none;
            cursor: pointer;
        }
        .demo {
            background: #fef3c7;
            padding: 15px;
            border-radius: 8px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="card">
        <h2>🔐 認証コード入力</h2>
        <p>メールに送信された6桁のコードを入力してください</p>
        
        <form action="/secure/${req.params.linkId}/download" method="POST">
            <input type="hidden" name="email" value="${req.body.email}">
            <input type="text" name="otp" placeholder="6桁の認証コード" pattern="[0-9]{6}" required>
            <button type="submit">ダウンロード</button>
        </form>
        
        <div class="demo">
            <strong>デモ用OTP: ${otp}</strong>
        </div>
    </div>
</body>
</html>
            `);
        });
        
        // ダウンロード
        this.app.post('/secure/:linkId/download', express.urlencoded({ extended: true }), (req, res) => {
            const data = this.secureLinkStore.get(req.params.linkId);
            const otp = this.otpStore.get(req.params.linkId);
            
            if (!data || !otp) {
                return res.status(404).send('データが見つかりません');
            }
            
            if (req.body.otp !== otp) {
                return res.status(403).send('認証コードが正しくありません');
            }
            
            // ダウンロード
            const buffer = Buffer.from(data.fileData, 'base64');
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${data.fileName}"`);
            res.send(buffer);
        });
        
        // ヘルスチェック
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                version: '1.0.1-lite',
                links: this.secureLinkStore.size
            });
        });
    }
    
    start() {
        this.app.listen(this.port, () => {
            console.log(`DataGate v1.0.1 Lite running on port ${this.port}`);
        });
    }
}

const server = new DataGateServer();
server.start();
