// /api/kpi/get.js
let kv;
try { kv = require('@vercel/kv').kv; } catch {}

const getMetas = async () => {
  const metas = [];
  if (kv?.scanIterator) {
    const keys = [];
    for await (const k of kv.scanIterator({ match: 'file:*:meta', count: 1000 })) keys.push(k);
    for (const key of keys) {
      try { const j = await kv.get(key); if (j) metas.push(JSON.parse(j)); } catch {}
    }
  } else if (kv?.keys) {
    const keys = await kv.keys('file:*:meta');
    for (const key of keys) {
      try { const j = await kv.get(key); if (j) metas.push(JSON.parse(j)); } catch {}
    }
  } else if (global.fileStorage) {
    global.fileStorage.forEach(v => metas.push(v));
  }
  return metas;
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'Method not allowed' });

  const now = Date.now();
  const metas = await getMetas();

  const uploadsByDayMap = new Map();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    uploadsByDayMap.set(d, 0);
  }

  let uploadsLast24h = 0;
  let downloadsTotalObserved = 0;

  for (const m of metas) {
    const up = m.uploadTime ? new Date(m.uploadTime).getTime() : 0;
    if (up) {
      const d = new Date(up).toISOString().slice(0, 10);
      if (uploadsByDayMap.has(d)) uploadsByDayMap.set(d, uploadsByDayMap.get(d) + 1);
      if ((now - up) <= 24 * 60 * 60 * 1000) uploadsLast24h++;
    }
    if (typeof m.downloadCount === 'number') downloadsTotalObserved += m.downloadCount;
  }

  const uploadsByDay = Array.from(uploadsByDayMap.entries())
    .map(([date, count]) => ({ date, count }));

  let uploadsTotalCounter = 0, downloadsTotalCounter = 0;
  if (kv?.get) {
    const [u, d] = await Promise.all([
      kv.get('metrics:counters:uploads_total'),
      kv.get('metrics:counters:downloads_total')
    ]);
    uploadsTotalCounter = typeof u === 'number' ? u : parseInt(u || '0', 10);
    downloadsTotalCounter = typeof d === 'number' ? d : parseInt(d || '0', 10);
  }

  return res.status(200).json({
    ok: true,
    asOf: new Date().toISOString(),
    uploadsLast24h,
    uploadsByDay,
    downloadsTotalObserved,
    counters: {
      uploadsTotal: uploadsTotalCounter || metas.length,
      downloadsTotal: downloadsTotalCounter || downloadsTotalObserved
    }
  });
};
