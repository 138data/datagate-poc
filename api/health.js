// api/health.js
// Phase 40 Step 0 対応 - Cache-Control統一 + セキュリティヘッダー

module.exports = (req, res) => {
  // キャッシュ禁止（全APIポリシー統一）
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // セキュリティヘッダー
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  return res.status(200).json({
    status: 'ok',
    version: process.env.APP_VERSION || 'unknown',
    timestamp: new Date().toISOString(),
    message: 'DataGate API is operational'
  });
};
