// api/health.js - 完全版

export default async function handler(req, res) {
  // Cache-Control: no-store 追加（P0修正）
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Content-Type', 'application/json');

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: '138DataGate',
    version: '1.0.0'
  });
}