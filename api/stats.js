// /api/stats.js - Minimal working version
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Return minimal stats for now
  return res.status(200).json({
    ok: true,
    storageType: 'Memory',
    asOf: new Date().toISOString(),
    filesTotal: 0,
    activeFiles: 0,
    downloadsTotal: 0,
    sizeTotalBytes: 0,
    uploadsLast24h: 0,
    note: 'Minimal stats implementation'
  });
};
