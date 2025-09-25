const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// メールサービスのインポート
const { sendOTPEmail, sendDownloadNotification } = require('./services/emailService');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS設定（Vercelで必要）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// メモリストレージの設定
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB制限
  }
});

// ファイル保存用のメモリストア
const fileStore = new Map();
const otpStore = new Map();

// ユーティリティ関数
function generateSecureId() {
  return crypto.randomBytes(32).toString('hex');
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ルートエンドポイント - アップロードページ
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DataGate - Secure File Transfer</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          padding: 20px;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          max-width: 500px;
          width: 100%;
        }
        h1 {
          color: #333;
          text-align: center;
          font-size: 32px;
          margin-bottom: 10px;
        }
        .subtitle {
          text-align: center;
          color: #666;
          margin-bottom: 30px;
        }
        .form-group {
          margin-bottom: 20px;
        }
        label {
          display: block;
          margin-bottom: 8px;
          color: #333;
          font-weight: 500;
        }
        input[type="file"],
        input[type="email"] {
          width: 100%;
          padding: 12px;
          border: 2px solid #e0e0e0;
          border-radius: 10px;
          font-size: 16px;
          transition: border-color 0.3s;
          box-sizing: border-box;
        }
        input[type="file"]:focus,
        input[type="email"]:focus {
          outline: none;
          border-color: #667eea;
        }
        .button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 15px 30px;
          border: none;
          border-radius: 50px;
          font-size: 18px;
          cursor: pointer;
          width: 100%;
          transition: all 0.3s;
          font-weight: 600;
        }
        .button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
        }
        .button:disabled {
          background: #ccc;
          cursor: not-allowed;
          transform: none;
        }
        .info {
          background: #f0f8ff;
          padding: 15px;
          border-radius: 10px;
          margin-bottom: 20px;
          font-size: 14px;
          color: #666;
        }
        .spinner {
          display: none;
          text-align: center;
          margin: 20px 0;
        }
        .spinner.active {
          display: block;
        }
        .success-message {
          display: none;
          background: #d4edda;
          color: #155724;
          padding: 15px;
          border-radius: 10px;
          margin: 20px 0;
        }
        .error-message {
          display: none;
          background: #f8d7da;
          color: #721c24;
          padding: 15px;
          border-radius: 10px;
          margin: 20px 0;
        }
        .env-status {
          background: ${process.env.SENDGRID_API_KEY ? '#d4edda' : '#fff3cd'};
          color: ${process.env.SENDGRID_API_KEY ? '#155724' : '#856404'};
          padding: 10px;
          border-radius: 5px;
          margin-bottom: 20px;
          text-align: center;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔐 DataGate</h1>
        <p class="subtitle">PPAP離脱 - セキュアファイル転送システム</p>
        
        <div class="env-status">
          ${process.env.SENDGRID_API_KEY 
            ? '✅ メール送信: 有効 (SendGrid)' 
            : '⚠️ メール送信: テストモード (コンソールログ)'}
        </div>
        
        <div class="info">
          📋 <strong>使い方:</strong><br>
          1. 送信したいファイルを選択<br>
          2. 受信者のメールアドレスを入力<br>
          3. 送信ボタンをクリック<br>
          4. OTPとダウンロードリンクが受信者に送信されます
        </div>
        
        <form id="uploadForm" enctype="multipart/form-data">
          <div class="form-group">
            <label for="file">📎 送信ファイル（最大10MB）</label>
            <input type="file" id="file" name="file" required>
          </div>
          
          <div class="form-group">
            <label for="recipientEmail">📧 受信者メールアドレス</label>
            <input type="email" id="recipientEmail" name="recipientEmail" 
                   placeholder="recipient@example.com" required>
          </div>
          
          <button type="submit" class="button" id="submitBtn">
            🚀 セキュア送信開始
          </button>
        </form>
        
        <div class="spinner">
          <p>⏳ アップロード中...</p>
        </div>
        
        <div class="success-message" id="successMessage"></div>
        <div class="error-message" id="errorMessage"></div>
      </div>
      
      <script>
        const form = document.getElementById('uploadForm');
        const submitBtn = document.getElementById('submitBtn');
        const spinner = document.querySelector('.spinner');
        const successMessage = document.getElementById('successMessage');
        const errorMessage = document.getElementById('errorMessage');
        
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          successMessage.style.display = 'none';
          errorMessage.style.display = 'none';
          spinner.classList.add('active');
          submitBtn.disabled = true;
          
          const formData = new FormData();
          formData.append('file', document.getElementById('file').files[0]);
          formData.append('recipientEmail', document.getElementById('recipientEmail').value);
          
          try {
            const response = await fetch('/api/upload', {
              method: 'POST',
              body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
              successMessage.innerHTML = \`
                ✅ <strong>送信完了!</strong><br>
                ダウンロードリンクとOTPが受信者に送信されました。<br>
                <br>
                📎 ファイル: \${data.fileName}<br>
                📧 送信先: \${data.recipientEmail}<br>
                \${data.emailSent ? '✉️ メール: 送信済み' : '⚠️ メール: テストモード（コンソールログ確認）'}
              \`;
              successMessage.style.display = 'block';
              form.reset();
            } else {
              throw new Error(data.error || '送信に失敗しました');
            }
          } catch (error) {
            errorMessage.innerHTML = \`
              ❌ <strong>エラー:</strong> \${error.message}
            \`;
            errorMessage.style.display = 'block';
          } finally {
            spinner.classList.remove('active');
            submitBtn.disabled = false;
          }
        });
      </script>
    </body>
    </html>
  `);
});

// ファイルアップロードAPI
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const recipientEmail = req.body.recipientEmail;
    
    if (!file) {
      return res.status(400).json({ error: 'ファイルが選択されていません' });
    }
    
    if (!recipientEmail) {
      return res.status(400).json({ error: '受信者メールアドレスが入力されていません' });
    }
    
    const fileId = generateSecureId();
    const otp = generateOTP();
    
    const fileData = {
      id: fileId,
      originalName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
      size: file.size,
      uploadedAt: new Date(),
      recipientEmail: recipientEmail,
      downloadCount: 0,
      maxDownloads: 3,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    };
    
    fileStore.set(fileId, fileData);
    otpStore.set(fileId, {
      otp: otp,
      attempts: 0,
      maxAttempts: 5
    });
    
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const downloadLink = `${baseUrl}/download/${fileId}`;
    
    let emailSent = false;
    try {
      await sendOTPEmail(
        recipientEmail, 
        otp, 
        downloadLink, 
        file.originalname
      );
      emailSent = true;
    } catch (emailError) {
      console.error('メール送信エラー:', emailError);
    }
    
    res.json({
      success: true,
      fileId: fileId,
      downloadLink: downloadLink,
      fileName: file.originalname,
      recipientEmail: recipientEmail,
      emailSent: emailSent,
      message: emailSent 
        ? 'ファイルのアップロードが完了し、メールが送信されました' 
        : 'ファイルのアップロードは完了しましたが、メール送信はテストモードです'
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'ファイルのアップロードに失敗しました' });
  }
});

// ダウンロードページ
app.get('/download/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const fileData = fileStore.get(fileId);
  
  if (!fileData) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <title>ファイルが見つかりません</title>
        <style>
          body {
            font-family: sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .error-container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          h1 { color: #e74c3c; }
        </style>
      </head>
      <body>
        <div class="error-container">
          <h1>❌ ファイルが見つかりません</h1>
          <p>リンクが無効か、有効期限が切れています。</p>
        </div>
      </body>
      </html>
    `);
  }
  
  res.send(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>ファイルダウンロード - DataGate</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          padding: 20px;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          max-width: 500px;
          width: 100%;
        }
        h1 {
          color: #333;
          text-align: center;
          font-size: 32px;
          margin-bottom: 20px;
        }
        .file-info {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 10px;
          margin-bottom: 30px;
        }
        .file-info p {
          margin: 5px 0;
          color: #666;
        }
        .otp-input {
          width: 100%;
          padding: 15px;
          font-size: 24px;
          text-align: center;
          letter-spacing: 5px;
          border: 2px solid #e0e0e0;
          border-radius: 10px;
          margin-bottom: 20px;
          box-sizing: border-box;
        }
        .otp-input:focus {
          outline: none;
          border-color: #667eea;
        }
        .button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 15px 30px;
          border: none;
          border-radius: 50px;
          font-size: 18px;
          cursor: pointer;
          width: 100%;
          transition: all 0.3s;
          font-weight: 600;
        }
        .button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
        }
        .button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .error {
          color: #e74c3c;
          text-align: center;
          margin: 10px 0;
          display: none;
        }
        .warning {
          background: #fff3cd;
          color: #856404;
          padding: 15px;
          border-radius: 10px;
          margin-top: 20px;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔐 ファイルダウンロード</h1>
        
        <div class="file-info">
          <p><strong>📎 ファイル名:</strong> ${fileData.originalName}</p>
          <p><strong>📊 サイズ:</strong> ${(fileData.size / 1024).toFixed(2)} KB</p>
          <p><strong>📥 残りダウンロード回数:</strong> ${fileData.maxDownloads - fileData.downloadCount} / ${fileData.maxDownloads}</p>
        </div>
        
        <form id="otpForm">
          <input type="hidden" id="fileId" value="${fileId}">
          <input 
            type="text" 
            id="otpInput" 
            class="otp-input" 
            placeholder="OTPコード (6桁)" 
            maxlength="6" 
            pattern="[0-9]{6}"
            required
            autocomplete="off"
          >
          <button type="submit" class="button" id="downloadBtn">
            📥 ダウンロード
          </button>
        </form>
        
        <div class="error" id="errorMsg"></div>
        
        <div class="warning">
          ⚠️ <strong>注意:</strong> OTPコードはメールで送信されています。
          5回間違えるとアクセスがブロックされます。
        </div>
      </div>
      
      <script>
        const form = document.getElementById('otpForm');
        const errorMsg = document.getElementById('errorMsg');
        const downloadBtn = document.getElementById('downloadBtn');
        
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const fileId = document.getElementById('fileId').value;
          const otp = document.getElementById('otpInput').value;
          
          errorMsg.style.display = 'none';
          downloadBtn.disabled = true;
          
          try {
            const response = await fetch('/api/download/' + fileId, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ otp: otp })
            });
            
            if (response.ok) {
              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.style.display = 'none';
              a.href = url;
              a.download = '${fileData.originalName}';
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              
              setTimeout(() => {
                window.location.reload();
              }, 1000);
            } else {
              const error = await response.json();
              errorMsg.textContent = error.error;
              errorMsg.style.display = 'block';
            }
          } catch (error) {
            errorMsg.textContent = 'ダウンロードに失敗しました';
            errorMsg.style.display = 'block';
          } finally {
            downloadBtn.disabled = false;
          }
        });
        
        document.getElementById('otpInput').addEventListener('input', (e) => {
          e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
      </script>
    </body>
    </html>
  `);
});

// ファイルダウンロードAPI
app.post('/api/download/:fileId', async (req, res) => {
  const fileId = req.params.fileId;
  const { otp } = req.body;
  
  const fileData = fileStore.get(fileId);
  const otpData = otpStore.get(fileId);
  
  if (!fileData || !otpData) {
    return res.status(404).json({ error: 'ファイルが見つかりません' });
  }
  
  if (otpData.attempts >= otpData.maxAttempts) {
    return res.status(403).json({ error: 'アクセスがブロックされました（試行回数超過）' });
  }
  
  if (otp !== otpData.otp) {
    otpData.attempts++;
    otpStore.set(fileId, otpData);
    return res.status(401).json({ 
      error: `OTPが正しくありません（残り試行回数: ${otpData.maxAttempts - otpData.attempts}回）` 
    });
  }
  
  if (fileData.downloadCount >= fileData.maxDownloads) {
    return res.status(403).json({ error: 'ダウンロード回数の上限に達しました' });
  }
  
  fileData.downloadCount++;
  fileStore.set(fileId, fileData);
  
  if (fileData.downloadCount === fileData.maxDownloads) {
    fileStore.delete(fileId);
    otpStore.delete(fileId);
  }
  
  res.set({
    'Content-Type': fileData.mimeType,
    'Content-Disposition': `attachment; filename="${encodeURIComponent(fileData.originalName)}"`,
    'Content-Length': fileData.size
  });
  
  res.send(fileData.buffer);
});

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'DataGate Phase 2 - Email Integration Active',
    version: '2.0.0',
    features: {
      fileUpload: true,
      otpAuthentication: true,
      emailNotification: !!process.env.SENDGRID_API_KEY,
      mode: process.env.SENDGRID_API_KEY ? 'production' : 'test'
    },
    timestamp: new Date().toISOString()
  });
});

// Vercel用のエクスポート
if (process.env.VERCEL) {
  module.exports = app;
} else {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 DataGate Server running on port ${PORT}`);
    console.log(`📧 Email Mode: ${process.env.SENDGRID_API_KEY ? 'SendGrid Active' : 'Test Mode (Console Log)'}`);
  });
}
