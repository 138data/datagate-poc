@'
// /api/stats.js - Fixed version
let kv;
try { 
  kv = require('@vercel/kv').kv; 
} catch (e) {
  console.log('KV not available, using memory fallback');
}

const asNumber = (v) => (typeof v === 'number' ? v : parseInt(v, 10) || 0);

const getAllMetaFromKV = async () => {
  const metas = [];
  if (!kv) return metas;

  try {
    let keys = [];
    
    // Try different methods to get keys
    if (kv.keys) {
      keys = await kv.keys('file:*:meta');
    }
    
    // Collect metadata for each key
    for (const key of keys) {
      try {
        const metaJson = await kv.get(key);
        if (!metaJson) continue;
        const meta = typeof metaJson === 'string' ? JSON.parse(metaJson) : metaJson;
        metas.push(meta);
      } catch (err) {
        console.error(`Error parsing meta for key ${key}:`, err);
      }
    }
  } catch (err) {
    console.error('Error getting keys from KV:', err);
  }
  
  return metas;
};

const getAllMetaFromMemory = () => {
  const metas = [];
  const store = global.fileStorage;
  if (store && typeof store.forEach === 'function') {
    store.forEach((v) => metas.push(v));
  }
  return metas;
};

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const metasKV = await getAllMetaFromKV();
    const metas = metasKV.length ? metasKV : getAllMetaFromMemory();

    const now = Date.now();
    const filesTotal = metas.length;
    let downloadsTotal = 0;
    let sizeTotalBytes = 0;
    let activeFiles = 0;
    let uploadsLast24h = 0;

    for (const m of metas) {
      const dl = asNumber(m.downloadCount);
      const sz = asNumber(m.fileSize);
      downloadsTotal += dl;
      sizeTotalBytes += sz;

      const notExpired = !m.expiryTime || new Date(m.expiryTime).getTime() > now;
      const hasQuota = !m.maxDownloads || asNumber(m.maxDownloads) > dl;
      if (notExpired && hasQuota) activeFiles++;

      const up = m.uploadTime ? new Date(m.uploadTime).getTime() : 0;
      if (up && (now - up) <= 24 * 60 * 60 * 1000) uploadsLast24h++;
    }

    return res.status(200).json({
      ok: true,
      storageType: metasKV.length ? 'KV' : 'Memory',
      asOf: new Date().toISOString(),
      filesTotal,
      activeFiles,
      downloadsTotal,
      sizeTotalBytes,
      uploadsLast24h
    });
  } catch (e) {
    console.error('Stats API error:', e);
    return res.status(200).json({
      ok: true,
      degraded: true,
      storageType: 'Memory',
      asOf: new Date().toISOString(),
      filesTotal: 0,
      activeFiles: 0,
      downloadsTotal: 0,
      sizeTotalBytes: 0,
      uploadsLast24h: 0,
      note: 'Aggregation failed safely',
      error: e.message
    });
  }
};
'@ | Set-Content -Path "api\stats.js" -Encoding UTF8