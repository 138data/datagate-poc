// api/files/download.js  (CommonJS / Phase 36 準拠: APIはJSONのみ)
const { kv } = require('@vercel/kv');

// JSONボディを読む小ユーティリティ
async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileId, otp } = await readJson(req);

    if (!fileId || !otp) return res.status(400).json({ error: 'fileId and otp are required' });

    const metaJson = await kv.get(`file:${fileId}:meta`);
    if (!metaJson) return res.status(404).json({ error: 'File not found or expired' });

    // KVの値はstring想定（保存時にJSON.stringify）。objectの場合もケア
    const meta = typeof metaJson === 'string' ? JSON.parse(metaJson) : metaJson;

    // 期限とOTP検証
    const now = Date.now();
    const expiresAt = new Date(meta.expiresAt || meta.expiryTime || 0).getTime();
    if (expiresAt && now > expiresAt) return res.status(410).json({ error: 'Expired' });
    if (otp !== meta.otp) return res.status(401).json({ error: 'Invalid OTP' });

    // ダウンロード回数チェック
    const max = meta.maxDownloads ?? 3;
    const used = meta.downloadCount ?? 0;
    if (used >= max) return res.status(403).json({ error: 'Download limit exceeded' });

    // 残回数を更新し保存（TTLは残存秒数に合わせる）
    const remaining = max - (used + 1);
    meta.downloadCount = used + 1;

    let ttlSec = 7 * 24 * 60 * 60; // デフォルト 7日
    if (expiresAt) {
      ttlSec = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
    }
    await kv.set(`file:${fileId}:meta`, JSON.stringify(meta), { ex: ttlSec });

    // 短寿命URL（暫定）：
    // いまはメタの blobDownloadUrl / blobUrl を優先使用。
    // 後続で blobKey のみ保存 + @vercel/blob で署名URL発行に移行する。
    let downloadUrl =
      meta.blobDownloadUrl ||
      meta.blobUrl ||
      null;

    if (!downloadUrl) {
      // Phase 36 完全化タスク：blobKey → 署名付きURL発行を実装
      return res.status(501).json({
        error: 'Short-lived URL issuance not configured',
        hint: 'Store blobKey and issue a signed URL via @vercel/blob in this endpoint.'
      });
    }

    return res.status(200).json({
      downloadUrl,
      fileName: meta.fileName || 'download',
      expiresInSec: ttlSec,              // URL自体の署名期限ではなく、メタの残存期限（暫定）
      remainingDownloads: Math.max(0, remaining)
    });
  } catch (e) {
    console.error('[files/download] error:', e);
    return res.status(500).json({ error: 'Failed to issue download URL', details: e.message });
  }
};