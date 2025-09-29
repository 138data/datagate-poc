export const config = { api: { bodyParser: false, sizeLimit: '10mb' } };

import crypto from 'crypto';

const isDev = process.env.NODE_ENV !== 'production';

// Vercel環境でのグローバルストレージ（注意：本番では永続しません）
if (!global.dataGateStorage) {
  global.dataGateStorage = new Map();
  // デモ用（本番では削除）
  global.dataGateStorage.set('test123', {
    fileName: 'test-file.txt',
    fileData: Buffer.from('This is a test file content'),
    otp: '123456',
    downloadCount: 0,
    maxDownloads: 100,
    uploadTime: Date.now(),
    ttlMs: 24 * 60 * 60 * 1000, // 24h
  });
}

function pruneExpired() {
  const now = Date.now();
  for (const [id, f] of global.dataGateStorage.entries()) {
    if (f.ttlMs && now - f.uploadTime > f.ttlMs) {
      global.dataGateStorage.delete(id);
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', isDev ? '*' : (process.env.CORS_ORIGIN ?? '*'));
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    pruneExpired();

    // JSON(Base64) 受付（簡易・安全）
    const ct = req.headers['content-type'] || '';
    if (ct.startsWith('application/json')) {
      let body = '';
      await new Promise((resolve, reject) => {
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 15 * 1024 * 1024) reject(new Error('Payload too large'));
        });
        req.on('end', resolve);
        req.on('error', reject);
      });

      const { fileName = 'uploaded-file.dat', fileBase64, maxDownloads = 3, ttlSec = 3600 } = JSON.parse(body || '{}');
      if (!fileBase64) return res.status(400).json({ error: 'fileBase64 required' });

      const fileData = Buffer.from(fileBase64, 'base64');
      const fileId = crypto.randomBytes(8).toString('hex');
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      global.dataGateStorage.set(fileId, {
        fileName,
        fileData,
        otp,
        downloadCount: 0,
        maxDownloads: Math.max(1, Math.min(100, maxDownloads)),
        uploadTime: Date.now(),
        ttlMs: Math.max(60, Math.min(7 * 24 * 3600, ttlSec)) * 1000,
      });

      return res.status(200).json({
        success: true,
        fileId,
        downloadLink: `/download.html?id=${fileId}`,
        otp,
        fileName,
        message: 'File uploaded successfully (JSON)',
      });
    }

    // multipart/form-data 受付（Bufferのまま処理）
    const chunks = [];
    let totalSize = 0;
    await new Promise((resolve, reject) => {
      req.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > 10 * 1024 * 1024) reject(new Error('File too large'));
        chunks.push(chunk);
      });
      req.on('end', resolve);
      req.on('error', reject);
    });
    const buffer = Buffer.concat(chunks);

    const boundary = (ct.split('boundary=')[1] || '').trim();
    if (!boundary) {
      return res.status(400).json({ error: 'Missing multipart boundary (or use JSON with fileBase64)' });
    }

    // Bufferで境界検索（文字列化しない）
    const delimiter = Buffer.from(`--${boundary}`);
    const ending = Buffer.from(`--${boundary}--`);
    let fileName = 'uploaded-file.dat';
    let fileData = null;

    let start = buffer.indexOf(delimiter);
    while (start !== -1) {
      const next = buffer.indexOf(delimiter, start + delimiter.length);
      const end = next !== -1 ? next : buffer.indexOf(ending);
      if (end === -1) break;

      const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), start);
      if (headerEnd !== -1 && headerEnd < end) {
        const headerBuf = buffer.subarray(start + delimiter.length + 2, headerEnd);
        const bodyBuf = buffer.subarray(headerEnd + 4, end - 2);

        const headerStr = headerBuf.toString('utf8');
        const fn = headerStr.match(/filename="([^"]+)"/i);
        if (fn) fileName = fn[1];
        
        if (!fileData && /Content-Disposition:.*form-data;.*filename=/i.test(headerStr)) {
          fileData = Buffer.from(bodyBuf);
        }
      }

      start = next;
    }

    if (!fileData) {
      return res.status(400).json({ error: 'No file part found' });
    }

    const fileId = crypto.randomBytes(8).toString('hex');
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    global.dataGateStorage.set(fileId, {
      fileName,
      fileData,
      otp,
      downloadCount: 0,
      maxDownloads: 3,
      uploadTime: Date.now(),
      ttlMs: 3600 * 1000, // 1h
    });

    return res.status(200).json({
      success: true,
      fileId,
      downloadLink: `/download.html?id=${fileId}`,
      otp,
      fileName,
      message: 'File uploaded successfully',
    });
  } catch (error) {
    console.error('[Upload Error]', error);
    return res.status(500).json({ error: error.message });
  }
}
