import { kv } from '@vercel/kv';
import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // GET /api/files/download?fileId=xxx でアクセスされる
  if (req.method === 'GET') {
    const { fileId } = req.query;
    if (!fileId) {
      return res.status(400).json({ error: 'ファイルIDが指定されていません' });
    }
    try {
      // メタデータ取得
      const metadata = await kv.get(`file:${fileId}:meta`);
      if (!metadata) {
        return res.status(404).json({ error: 'ファイルが見つかりません' });
      }
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
        <span class="info-value">${metadata.fileName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">ファイルサイズ:</span>
        <span class="info-value">${formatFileSize(metadata.fileSize)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">有効期限:</span>
        <span class="info-value">${new Date(metadata.expiresAt).toLocaleString('ja-JP')}</span>
      </div>
      <div class="info-row">
        <span class="info-label">残りダウンロード回数:</span>
        <span class="info-value">${metadata.downloadCount}回</span>
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
        <li>ダウンロードは${metadata.downloadCount}回まで可能です</li>
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
          body: JSON.stringify({ fileId, otp })
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
        a.download = '${metadata.fileName}';
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
  // POST /api/files/download でファイルダウンロード実行
  if (req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { fileId, otp } = JSON.parse(body);
      if (!fileId || !otp) {
        return res.status(400).json({ error: 'ファイルIDまたはOTPが指定されていません' });
      }
      // メタデータ取得
      const metadata = await kv.get(`file:${fileId}:meta`);
      if (!metadata) {
        return res.status(404).json({ error: 'ファイルが見つかりません' });
      }
      // OTP検証
      if (metadata.otp !== otp) {
        return res.status(400).json({ error: '無効なワンタイムパスワードです' });
      }
      // ダウンロード回数チェック
      if (metadata.downloadCount <= 0) {
        return res.status(400).json({ error: 'ダウンロード回数の上限に達しました' });
      }
      // 暗号化データ取得
      const encryptedData = await kv.get(`file:${fileId}:data`);
      if (!encryptedData) {
        return res.status(404).json({ error: 'ファイルデータが見つかりません' });
      }
      // 復号化（Bufferを直接返す）
      console.log('[Download Debug] encryptedData type:', typeof encryptedData, 'length:', encryptedData?.length);
      console.log('[Download Debug] encryptionKey:', metadata.encryptionKey ? 'exists' : 'MISSING');
      console.log('[Download Debug] iv:', metadata.iv ? 'exists' : 'MISSING');
      // KV から取得したデータは String なので Buffer に変換
      let encryptedBuffer;
      if (typeof encryptedData === 'string') {
        try {
          encryptedBuffer = Buffer.from(encryptedData, 'base64');
          // Valid base64チェック: lengthが16の倍数 + padding確認
          if (encryptedBuffer.length < 16 || encryptedBuffer.length % 16 !== 0) {
            throw new Error(`Invalid encrypted data length: ${encryptedBuffer.length} (min 16, multiple of 16)`);
          }
          console.log('[Download Debug] Buffer created, length:', encryptedBuffer.length);
        } catch (convError) {
          console.error('[Buffer Conv Error]', convError.message);
          return res.status(500).json({ error: '暗号化データが破損しています (base64 invalid)' });
        }
      } else if (Buffer.isBuffer(encryptedData)) {
        encryptedBuffer = encryptedData;
      } else {
        return res.status(500).json({ error: 'Unsupported encryptedData type' });
      }
      // decrypt呼び出し前チェック
      console.log('[Decrypt Debug] key length (hex):', metadata.encryptionKey.length, 'iv length (hex):', metadata.iv.length);
      const decryptedBuffer = decrypt(encryptedBuffer, metadata.encryptionKey, metadata.iv);
      // ダウンロード回数を減らす
      metadata.downloadCount -= 1;
      await kv.set(`file:${fileId}:meta`, metadata, { ex: 7 * 24 * 60 * 60 });
      // ファイル送信
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(metadata.fileName)}"; filename*=UTF-8''${encodeURIComponent(metadata.fileName)}`);
      return res.status(200).send(decryptedBuffer);
    } catch (error) {
      console.error('Download error:', error);
      return res.status(500).json({ error: 'ダウンロードに失敗しました' });
    }
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

// リクエストボディ読み取り
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// 復号化（Bufferを直接返す）
function decrypt(encryptedBuffer, keyHex, ivHex) {
  try {
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    if (key.length !== 32 || iv.length !== 12) {
      throw new Error(`Invalid key/iv length: key=${key.length}, iv=${iv.length}`);
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    const authTag = encryptedBuffer.slice(0, 16);
    const ciphertext = encryptedBuffer.slice(16);
    console.log('[Decrypt Debug] authTag length:', authTag.length, 'ciphertext length:', ciphertext.length);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()  // ここでエラーthrow
    ]);
    return decrypted;
  } catch (error) {
    console.error('[Decrypt Error]', error.message, { bufferLen: encryptedBuffer.length });
    throw error;  // 上位でキャッチ
  }
}

// ファイルサイズフォーマット
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}