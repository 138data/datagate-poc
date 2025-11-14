const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const { kv } = require('@vercel/kv');

// S3クライアントの初期化
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const S3_BUCKET = process.env.S3_BUCKET || 'datagate-poc-138data';

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

// メインハンドラ
module.exports = async function handler(req, res) {
  console.log('[Download] Request received:', req.method, req.url);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ⭐️ 修正点: fileId をクエリパラメータ (GET) またはボディ (POST) から取得
  let fileId;
  if (req.method === 'GET') {
    fileId = req.query.fileId;
  } else if (req.method === 'POST') {
    // ⭐️ 修正点: 以前のコードは req.body を期待していたが、
    // upload.js と同様に bodyParser: false が必要かもしれない。
    // まずは Vercel のデフォルト (bodyParser: true) で試す。
    // download.js の config で bodyParser: true が指定されているため、req.body が使える。
    fileId = req.body.fileId || req.query.fileId;
  }

  if (!fileId) {
    return res.status(400).json({ error: 'File ID is required' });
  }

  try {
    // ⭐️ 修正点 1: KVから文字列として取得
    const metadataString = await kv.get(`file:${fileId}`);
    
    if (!metadataString) {
      console.log('[Download] File not found:', fileId);
      return res.status(404).json({ error: 'ファイルが見つかりません' });
    }

    // ⭐️ 修正点 2: JSONとしてパース
    const metadata = JSON.parse(metadataString);

    // Handle POST (OTP verification and download)
    if (req.method === 'POST') {
      const { otp } = req.body;

      if (!otp) {
        return res.status(400).json({ error: '認証コードが必要です' });
      }

      // ⭐️ 修正点 3: otpAttempts は upload.js の metadata にないので初期化
      metadata.otpAttempts = metadata.otpAttempts || 0;

      // Check OTP attempts
      if (metadata.otpAttempts >= 5) {
        return res.status(429).json({ 
          error: '試行回数が上限に達しました。しばらく待ってから再度お試しください。' 
        });
      }

      // Verify OTP
      if (otp !== metadata.otp) {
        // Increment attempts
        metadata.otpAttempts += 1;
        // ⭐️ 修正点 4: KV保存時は再度 stringify
        await kv.set(`file:${fileId}`, JSON.stringify(metadata), { ex: 7 * 24 * 60 * 60 });
        
        return res.status(401).json({ 
          error: '認証コードが正しくありません',
          remainingAttempts: 5 - metadata.otpAttempts 
        });
      }

      // Download file from S3
      console.log('[Download] Downloading from S3:', metadata.s3Key);
      const { buffer: encryptedBuffer } = await downloadFromS3(metadata.s3Key);

      // Decrypt file (⭐️ 修正点 5: 互換性のある関数を使用)
      const decryptedBuffer = decryptBuffer(encryptedBuffer);

      // Mark as downloaded
      metadata.downloaded = true;
      metadata.downloadDate = new Date().toISOString();
      await kv.set(`file:${fileId}`, JSON.stringify(metadata), { ex: 7 * 24 * 60 * 60 });

      // Set proper headers for file download
      res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', decryptedBuffer.length);
      
      // ⭐️ 修正点 6: upload.js の 'originalName' を使う
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
    }

    // Handle GET (return file info)
    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        // ⭐️ 修正点 7: upload.js のキー名に合わせる
        fileName: metadata.originalName,
        fileSize: metadata.size,
        uploadDate: metadata.createdAt,
        requiresOtp: true,
        downloaded: metadata.downloaded || false,
        storageType: metadata.storage || 'unknown'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[Download] Error:', error);
    
    // Better error messages
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
};

// ⭐️ 修正点 8: config のエクスポート形式を CommonJS に統一
module.exports.config = {
  api: {
    bodyParser: true, // POSTで {otp: '...'} を受け取るため true が必要
    sizeLimit: '1mb',
    responseLimit: '100mb' // S3からダウンロードしたファイルを返すため
  }
};