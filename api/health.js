// api/health.js
// Health Check API - JSON固定返却
// 138DataGate - Phase 22 Hotfix

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    status: 'ok',
    service: '138DataGate',
    time: new Date().toISOString()
  });
};
