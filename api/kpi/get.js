// /api/kpi/get.js - Minimal working version
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

  // Create last 7 days data
  const now = Date.now();
  const uploadsByDay = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    uploadsByDay.push({ date, count: 0 });
  }

  // Return minimal KPI data
  return res.status(200).json({
    ok: true,
    asOf: new Date().toISOString(),
    uploadsLast24h: 0,
    uploadsByDay,
    downloadsTotalObserved: 0,
    counters: {
      uploadsTotal: 0,
      downloadsTotal: 0
    },
    note: 'Minimal KPI implementation'
  });
};
