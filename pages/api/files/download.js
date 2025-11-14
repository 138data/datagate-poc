import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { kv } from '@vercel/kv';

// S3クライアントの初期化
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const S3_BUCKET = process.env.S3_BUCKET || 'datagate-poc-138data';

// --- ヘルパー関数 (S3/復号化/フォーマット) ---

// Helper: Stream to Buffer
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// S3からダウンロード
async function downloadFromS3(key) {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  const response = await s3Client.send(command);
  const buffer = await streamToBuffer(response.Body);
  
  return {
    buffer,
    metadata: response.Metadata,
  };
}

// 復号化関数 (upload.js と互換性を持たせる)
function decryptBuffer(encryptedBuffer) {
  const algorithm = 'aes-256-gcm';
  
  // upload.js の scryptSync と同じキーを導出
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key-change-in-production', 'salt', 32);
  
  // upload.js の構造 [iv(16)][authTag(16)][encrypted] に合わせる
  const iv = encryptedBuffer.slice(0, 16);
  const authTag = encryptedBuffer.slice(16, 32);
  const encrypted = encryptedBuffer.slice(32);
  
  // 復号化
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

// ファイルサイズフォーマット (HTMLページで使用)
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}


// --- メインハンドラ ---

export default async function handler(req, res) {
  console.log('[Download] Request received:', req.method, req.url);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let fileId;
  if (req.method === 'GET') {
    fileId = req.query.fileId || req.query.id;
    if (Array.isArray(fileId)) {
        fileId = fileId[0];
    }
  } else if (req.method === 'POST') {
    fileId = req.body.fileId || req.query.fileId;
    if (Array.isArray(fileId)) {
        fileId = fileId[0];
    }
  }
  
  if (!fileId && req.url) {
      const parts = req.url.split('/');
      if (parts[parts.length - 1] && parts[parts.length - 2] === 'download') {
          fileId = parts[parts.length - 1].split('?')[0];
      }
  }

  if (!fileId) {
    return res.status(400).json({ error: 'File ID is required' });
  }

  // === GETリクエスト (HTMLページ表示) ===
  if (req.method === 'GET') {
    try {
      // メタデータ取得
      const metadata = await kv.get(`file:${fileId}`);
      if (!metadata) {
        return res.status(404).json({ error: 'ファイルが見つかりません' });
      }

      // ⭐️ 修正: S3移行後のキー名 (originalName, size) をHTMLにマッピング
      const fileName = metadata.originalName || 'N/A';
      const fileSize = metadata.size || 0;
      const downloadCount = metadata.downloadCount !== undefined ? metadata.downloadCount : 'N/A';
      const expiresAt = metadata.expiresAt || new Date().toISOString();

      // ダウンロードページHTML返却
      const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DataGate - ファイルダウンロード</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .icon {
      font-size: 48px;
      margin-bottom: 10px;
    }
    h1 {
      color: #333;
      font-size: 24px;
      margin-bottom: 10px;
    }
    .subtitle {
      color: #666;
      font-size: 14px;
    }
    .file-info {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e9ecef;
    }
    .info-row:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }
    .info-label {
      color: #666;
      font-size: 14px;
    }
    .info-value {
      color: #333;
      font-weight: 600;
      font-size: 14px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      color: #333;
      font-weight: 600;
      margin-bottom: 8px;
      font-size: 14px;
    }
    input {
      width: 100%;
      padding: 12px;
      border: 2px solid #e9ecef;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.3s;
    }
    input:focus {
      outline: none;
      border-color: #667eea;
    }
    .download-btn {
      width: 100%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 15px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .download-btn:hover {
      transform: translateY(-2px);
    }
    .download-btn:disabled {
      background: #ccc;
      cursor: not-allowed;
      transform: none;
    }
    .error {
      background: #fee;
      color: #c33;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
      display: none;
    }
    .success {
      background: #efe;
      color: #3c3;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
      display: none;
    }
    .note {
      background: #fff9e6;
      border-left: 4px solid #ffd700;
      padding: 15px;
      margin-top: 20px;
      border-radius: 4px;
      font-size: 13px;
      color: #666;
    }
    .note strong {
      color: #333;
      display: block;
      margin-bottom: 5px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="icon">📦</div>
      <h1>DataGate</h1>
      <p class="subtitle">安全なファイル受け渡しサービス</p>
    </div>
    <div class="file-info">
      <div class="info-row">
        <span class="info-label">ファイル名:</span>
        <span class="info-value">${fileName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">ファイルサイズ:</span>
        <span class="info-value">${formatFileSize(fileSize)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">有効期限:</span>
        <span class="info-value">${new Date(expiresAt).toLocaleString('ja-JP')}</span>
      </div>
      <div class="info-row">
        <span class="info-label">残りダウンロード回数:</span>
        <span class="info-value">${downloadCount}回</span>
      </div>
    </div>
    <div class="error" id="error"></div>
    <div class="success" id="success"></div>
    <form id="downloadForm">
      <div class="form-group">
        <label for="otp">ワンタイムパスワード (OTP):</label>
        <input
          type="text"
          id="otp"
          name="otp"
          placeholder="6桁の数字を入力"
          maxlength="6"
          pattern="[0-9]{6}"
          required
          autocomplete="off"
        >
      </div>
      <button type="submit" class="download-btn" id="downloadBtn">
        📥 ダウンロード
      </button>
    </form>
    <div class="note">
      <strong>⚠️ ご注意</strong>
      <ul style="margin-left: 20px; margin-top: 5px;">
        <li>OTPはメールに記載されています</li>
        <li>ダウンロードは${downloadCount}回まで可能です</li>
        <li>有効期限を過ぎるとダウンロードできません</li>
      </ul>
    </div>
  </div>
  <script>
    const fileId = '${fileId}';
    const form = document.getElementById('downloadForm');
    const otpInput = document.getElementById('otp');
    const downloadBtn = document.getElementById('downloadBtn');
    const errorDiv = document.getElementById('error');
    const successDiv = document.getElementById('success');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const otp = otpInput.value.trim();
      if (!/^[0-9]{6}$/.test(otp)) {
        showError('OTPは6桁の数字で入力してください');
        return;
      }
      downloadBtn.disabled = true;
      downloadBtn.textContent = 'ダウンロード中...';
      hideMessages();
      try {
        const response = await fetch('/api/files/download', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fileId: '${fileId}', otp }) // ⭐️ 修正: fileIdをJS変数から取得
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'ダウンロードに失敗しました');
        }
        // ファイルダウンロード
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '${fileName}'; // ⭐️ 修正: JS変数から取得
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showSuccess('ファイルのダウンロードが完了しました');
        // フォームをリセット
        form.reset();
        // ページをリロードして残り回数を更新
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } catch (error) {
        showError(error.message);
      } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = '📥 ダウンロード';
      }
    });
    function showError(message) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
      successDiv.style.display = 'none';
    }
    function showSuccess(message) {
      successDiv.textContent = message;
      successDiv.style.display = 'block';
      errorDiv.style.display = 'none';
    }
    function hideMessages() {
      errorDiv.style.display = 'none';
      successDiv.style.display = 'none';
    }
    // OTP入力時に数字のみ許可
    otpInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });
  </script>
</body>
</html>
`;
      return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
    } catch (error) {
      console.error('Download page error:', error);
      return res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  }

  // === POSTリクエスト (ファイルダウンロード実行) ===
  if (req.method === 'POST') {
    try {
      // KVからメタデータを取得 (自動でJSONオブジェクトにパース)
      const metadata = await kv.get(`file:${fileId}`);
      
      if (!metadata) {
        console.log('[Download] File not found:', fileId);
        return res.status(404).json({ error: 'ファイルが見つかりません' });
      }

      const { otp } = req.body;

      if (!otp) {
        return res.status(400).json({ error: '認証コードが必要です' });
      }

      metadata.otpAttempts = metadata.otpAttempts || 0;

      // Check OTP attempts
      if (metadata.otpAttempts >= 5) {
        return res.status(429).json({ 
          error: '試行回数が上限に達しました。しばらく待ってから再度お試しください。' 
        });
      }

      // Verify OTP
      if (otp !== metadata.otp) {
        metadata.otpAttempts += 1;
        // KVにオブジェクトのまま保存 (自動でstringify)
        await kv.set(`file:${fileId}`, metadata, { ex: 7 * 24 * 60 * 60 });
        
        return res.status(401).json({ 
          error: '認証コードが正しくありません',
          remainingAttempts: 5 - metadata.otpAttempts 
        });
      }

      // Download file from S3
      console.log('[Download] Downloading from S3:', metadata.s3Key);
      const { buffer: encryptedBuffer } = await downloadFromS3(metadata.s3Key);

      // Decrypt file
      const decryptedBuffer = decryptBuffer(encryptedBuffer);

      // Mark as downloaded
      metadata.downloaded = true;
      metadata.downloadDate = new Date().toISOString();
      await kv.set(`file:${fileId}`, metadata, { ex: 7 * 24 * 60 * 60 });

      // Set proper headers for file download
      res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', decryptedBuffer.length);
      
      const fileName = metadata.originalName || 'downloaded-file';
      
      // Use RFC 5987 encoding for filename
      const encodedFilename = encodeURIComponent(fileName)
        .replace(/['()]/g, escape)
        .replace(/\*/g, '%2A');
      
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"; filename*=UTF-8''${encodedFilename}`
      );

      console.log('[Download] Sending file:', fileName, decryptedBuffer.length, 'bytes');
      return res.send(decryptedBuffer);

    } catch (error) {
      console.error('[Download] POST Error:', error);
      
      if (error.name === 'NoSuchKey') {
        return res.status(404).json({ error: 'ファイルが見つかりません' });
      }
      if (error.code === 'ERR_INVALID_AUTH_TAG') {
        return res.status(500).json({ error: 'ファイルの復号化に失敗しました' });
      }
      return res.status(500).json({ 
        error: 'ダウンロード処理に失敗しました',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // GET/POST以外
  return res.status(405).json({ error: 'Method not allowed' });
};

// Vercel/Next.js 用の config
export const config = {
  api: {
    bodyParser: true, // POSTで {otp: '...'} を受け取るため true が必要
    sizeLimit: '1mb',
    responseLimit: '100mb' // S3からダウンロードしたファイルを返すため
  }
};