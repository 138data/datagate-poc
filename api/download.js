const isDev = process.env.NODE_ENV !== 'production';

// Vercel環境でのグローバルストレージ（注意：本番では永続しません）
if (!global.dataGateStorage) {
  global.dataGateStorage = new Map();
  global.dataGateStorage.set('test123', {
    fileName: 'test-file.txt',
    fileData: Buffer.from('This is a test file content'),
    otp: '123456',
    downloadCount: 0,
    maxDownloads: 100,
    uploadTime: Date.now(),
    ttlMs: 24 * 60 * 60 * 1000,
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

  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error: 'ID required' });

  pruneExpired();

  const file = global.dataGateStorage.get(id);

  if (!file) {
    return res.status(404).json({
      success: false,
      error: 'File not found or expired',
      requestedId: id,
      hint: isDev ? 'Try test: ID=test123, OTP=123456' : undefined,
    });
  }

  const expired = file.ttlMs && Date.now() - file.uploadTime > file.ttlMs;
  if (expired) {
    global.dataGateStorage.delete(id);
    return res.status(410).json({ success: false, error: 'Expired' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      exists: true,
      fileName: file.fileName,
      remainingDownloads: Math.max(0, file.maxDownloads - file.downloadCount),
      requiresOTP: true,
      expiresAt: file.ttlMs ? new Date(file.uploadTime + file.ttlMs).toISOString() : null,
    });
  }

  if (req.method === 'POST') {
    let body = '';
    await new Promise((resolve, reject) => {
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 1024 * 1024) reject(new Error('Request too large'));
      });
      req.on('end', resolve);
      req.on('error', reject);
    });

    let otp = '';
    try {
      const data = JSON.parse(body || '{}');
      otp = data.otp;
    } catch (e) {
      // noop
    }

    if (otp !== file.otp) {
      return res.status(401).json({ error: 'Invalid OTP' });
    }

    if (file.downloadCount >= file.maxDownloads) {
      return res.status(403).json({ error: 'Download limit exceeded' });
    }

    file.downloadCount += 1;

    // 上限に達したら削除
    if (file.downloadCount >= file.maxDownloads) {
      global.dataGateStorage.delete(id);
    }

    // 日本語ファイル名対応（RFC5987）
    const asciiName = file.fileName.replace(/[^\x20-\x7E]/g, '_');
    const encoded = encodeURIComponent(file.fileName);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', Buffer.byteLength(file.fileData));

    return res.status(200).end(file.fileData);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
