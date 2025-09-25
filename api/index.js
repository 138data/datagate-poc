const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();

// ミドルウェア設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// メモリストレージ（Vercelはファイルシステムが一時的なため）
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB制限
});

// 一時的なファイルストレージ（実際の本番環境ではS3などを使用）
const fileStorage = new Map();

// セキュアリンクの生成
function generateSecureLink() {
  return crypto.randomBytes(32).toString('hex');
}

// OTPの生成
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ルートページ
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DataGate - セキュアファイル転送</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          margin: 0;
          padding: 20px;
          min-height: 100vh;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: white;
          padding: 40px;
          border-radius: 10px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        h1 {
          color: #333;
          text-align: center;
          margin-bottom: 30px;
        }
        .upload-area {
          border: 2px dashed #ccc;
          border-radius: 10px;
          padding: 40px;
          text-align: center;
          transition: border-color 0.3s;
        }
        .upload-area:hover {
          border-color: #667eea;
        }
        .btn {
          background: #667eea;
          color: white;
          padding: 12px 30px;
          border: none;
          border-radius: 5px;
          font-size: 16px;
          cursor: pointer;
          margin-top: 20px;
        }
        .btn:hover {
          background: #5a67d8;
        }
        input[type="file"] {
          margin: 20px 0;
        }
        input[type="email"] {
          width: 100%;
          padding: 10px;
          margin: 10px 0;
          border: 1px solid #ddd;
          border-radius: 5px;
        }
        .result {
          margin-top: 20px;
          padding: 15px;
          background: #f0f4f8;
          border-radius: 5px;
          display: none;
        }
        .link {
          color: #667eea;
          word-break: break-all;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔐 DataGate</h1>
        <p style="text-align: center; color: #666;">PPAP離脱 - セキュアファイル転送システム</p>
        
        <div class="upload-area">
          <h2>ファイルアップロード</h2>
          <form id="uploadForm" enctype="multipart/form-data">
            <input type="file" id="fileInput" name="file" required>
            <br>
            <input type="email" id="recipientEmail" name="recipientEmail" placeholder="受信者のメールアドレス" required>
            <br>
            <button type="submit" class="btn">アップロード</button>
          </form>
        </div>
        
        <div id="result" class="result">
          <h3>アップロード完了</h3>
          <p>以下のリンクを受信者に共有してください：</p>
          <p class="link" id="downloadLink"></p>
        </div>
      </div>
      
      <script>
        document.getElementById('uploadForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const formData = new FormData();
          const fileInput = document.getElementById('fileInput');
          const emailInput = document.getElementById('recipientEmail');
          
          formData.append('file', fileInput.files[0]);
          formData.append('recipientEmail', emailInput.value);
          
          try {
            const response = await fetch('/api/upload', {
              method: 'POST',
              body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
              document.getElementById('downloadLink').textContent = window.location.origin + '/download/' + data.id;
              document.getElementById('result').style.display = 'block';
            } else {
              alert('アップロードに失敗しました: ' + data.message);
            }
          } catch (error) {
            alert('エラーが発生しました: ' + error.message);
          }
        });
      </script>
    </body>
    </html>
  `);
});

// ファイルアップロードAPI
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.json({ success: false, message: 'ファイルが選択されていません' });
    }
    
    const fileId = generateSecureLink();
    const otp = generateOTP();
    
    // ファイル情報を保存（実際にはDBやS3に保存）
    fileStorage.set(fileId, {
      originalName: req.file.originalname,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      recipientEmail: req.body.recipientEmail,
      otp: otp,
      uploadTime: new Date(),
      downloadCount: 0,
      maxDownloads: 3
    });
    
    // 実際にはここでメール送信処理を行う
    console.log(`OTP: ${otp} を ${req.body.recipientEmail} に送信`);
    
    res.json({
      success: true,
      id: fileId,
      message: 'ファイルがアップロードされました'
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ダウンロードページ
app.get('/download/:id', (req, res) => {
  const fileId = req.params.id;
  const fileInfo = fileStorage.get(fileId);
  
  if (!fileInfo) {
    return res.status(404).send('ファイルが見つかりません');
  }
  
  res.send(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DataGate - ファイルダウンロード</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          margin: 0;
          padding: 20px;
          min-height: 100vh;
        }
        .container {
          max-width: 500px;
          margin: 0 auto;
          background: white;
          padding: 40px;
          border-radius: 10px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        h1 {
          color: #333;
          text-align: center;
        }
        input[type="text"] {
          width: 100%;
          padding: 10px;
          margin: 10px 0;
          border: 1px solid #ddd;
          border-radius: 5px;
          font-size: 18px;
          text-align: center;
          letter-spacing: 5px;
        }
        .btn {
          width: 100%;
          background: #667eea;
          color: white;
          padding: 12px;
          border: none;
          border-radius: 5px;
          font-size: 16px;
          cursor: pointer;
        }
        .btn:hover {
          background: #5a67d8;
        }
        .info {
          background: #f0f4f8;
          padding: 15px;
          border-radius: 5px;
          margin-bottom: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔓 ファイルダウンロード</h1>
        
        <div class="info">
          <p><strong>ファイル名:</strong> ${fileInfo.originalName}</p>
          <p><strong>残りダウンロード回数:</strong> ${fileInfo.maxDownloads - fileInfo.downloadCount}</p>
        </div>
        
        <form id="otpForm">
          <p>メールで送信されたワンタイムパスワードを入力してください</p>
          <input type="text" id="otpInput" placeholder="000000" maxlength="6" required>
          <button type="submit" class="btn">ダウンロード</button>
        </form>
      </div>
      
      <script>
        document.getElementById('otpForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const otp = document.getElementById('otpInput').value;
          
          try {
            const response = await fetch('/api/verify-download/${fileId}', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ otp: otp })
            });
            
            if (response.ok) {
              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = '${fileInfo.originalName}';
              a.click();
            } else {
              const data = await response.json();
              alert(data.message);
            }
          } catch (error) {
            alert('エラーが発生しました: ' + error.message);
          }
        });
      </script>
    </body>
    </html>
  `);
});

// OTP検証とファイルダウンロード
app.post('/api/verify-download/:id', (req, res) => {
  const fileId = req.params.id;
  const { otp } = req.body;
  
  const fileInfo = fileStorage.get(fileId);
  
  if (!fileInfo) {
    return res.status(404).json({ message: 'ファイルが見つかりません' });
  }
  
  if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
    return res.status(403).json({ message: 'ダウンロード回数の上限に達しました' });
  }
  
  if (fileInfo.otp !== otp) {
    return res.status(401).json({ message: 'OTPが正しくありません' });
  }
  
  // ダウンロード回数をカウント
  fileInfo.downloadCount++;
  
  // ファイルを送信
  res.set({
    'Content-Type': fileInfo.mimeType,
    'Content-Disposition': `attachment; filename="${fileInfo.originalName}"`
  });
  
  res.send(fileInfo.buffer);
});

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '1.0.0',
    mode: 'Phase 1 - Basic Upload/Download',
    timestamp: new Date().toISOString()
  });
});

// Vercel用のエクスポート
module.exports = app;

