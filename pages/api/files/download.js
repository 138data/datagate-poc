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

// Download from S3
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

// Decryption function
function decryptData(encryptedBuffer, password) {
  const algorithm = 'aes-256-gcm';
  
  // Extract components
  const salt = encryptedBuffer.slice(0, 32);
  const iv = encryptedBuffer.slice(32, 48);
  const authTag = encryptedBuffer.slice(48, 64);
  const encrypted = encryptedBuffer.slice(64);
  
  // Derive key
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  
  // Decrypt
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

// Main handler
module.exports = async function handler(req, res) {
  console.log('[Download] Request received:', req.method, req.url);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { fileId } = req.query;

  if (!fileId) {
    return res.status(400).json({ error: 'File ID is required' });
  }

  try {
    // Get metadata from KV
    const metadata = await kv.get(`file:${fileId}`);
    
    if (!metadata) {
      console.log('[Download] File not found:', fileId);
      return res.status(404).json({ error: 'ファイルが見つかりません' });
    }

    // Handle POST (OTP verification and download)
    if (req.method === 'POST') {
      const { otp } = req.body;

      if (!otp) {
        return res.status(400).json({ error: '認証コードが必要です' });
      }

      // Check OTP attempts
      if (metadata.otpAttempts >= 5) {
        return res.status(429).json({ 
          error: '試行回数が上限に達しました。しばらく待ってから再度お試しください。' 
        });
      }

      // Verify OTP
      if (otp !== metadata.otp) {
        // Increment attempts
        metadata.otpAttempts = (metadata.otpAttempts || 0) + 1;
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
      const decryptedBuffer = decryptData(encryptedBuffer, metadata.password);

      // Mark as downloaded
      metadata.downloaded = true;
      metadata.downloadDate = new Date().toISOString();
      await kv.set(`file:${fileId}`, metadata, { ex: 7 * 24 * 60 * 60 });

      // Set proper headers for file download
      res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', decryptedBuffer.length);
      
      // Use RFC 5987 encoding for filename
      const encodedFilename = encodeURIComponent(metadata.fileName)
        .replace(/['()]/g, escape)
        .replace(/\*/g, '%2A');
      
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${metadata.fileName}"; filename*=UTF-8''${encodedFilename}`
      );

      console.log('[Download] Sending file:', metadata.fileName, decryptedBuffer.length, 'bytes');
      return res.send(decryptedBuffer);
    }

    // Handle GET (return file info)
    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        fileName: metadata.fileName,
        fileSize: metadata.fileSize,
        uploadDate: metadata.uploadDate,
        requiresOtp: true,
        downloaded: metadata.downloaded || false,
        storageType: metadata.storageType || 'unknown'
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

module.exports.config = {
  api: {
    bodyParser: true,
    sizeLimit: '1mb',
    responseLimit: '100mb'
  }
};