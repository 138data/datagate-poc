// api/admin/stats.js
const jwt = require('jsonwebtoken');
const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  // キャッシュ無効化
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // OPTIONS対応
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // ========== JWT検証（Phase 42-P3追加） ==========
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Token required' });
  }
  
  try {
    const JWT_SECRET = process.env.ADMIN_JWT_SECRET;
    if (!JWT_SECRET) {
      console.error('ADMIN_JWT_SECRET not configured');
      return res.status(500).json({ error: 'Server not configured' });
    }
    
    jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: '138datagate',
      audience: 'admin-dashboard'
    });
  } catch (jwtError) {
    console.error('JWT verification failed:', jwtError.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  // ========== JWT検証ここまで ==========
  
  // GETのみ許可
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // 日数パラメータ（デフォルト7日）
    const { days = '7' } = req.query;
    const daysNum = Math.max(1, Math.min(90, parseInt(days, 10)));
    
    const now = Date.now();
    const cutoffTime = now - (daysNum * 24 * 60 * 60 * 1000);
    
    // 監査ログ取得
    const keys = await kv.keys('audit:*');
    const logs = [];
    
    for (const key of keys) {
      const log = await kv.get(key);
      if (log && log.timestamp >= cutoffTime) {
        logs.push(log);
      }
    }
    
    // ソート（新しい順）
    logs.sort((a, b) => b.timestamp - a.timestamp);
    
    // 集計
    const modeCount = {};
    const reasonCount = {};
    const domainCount = {};
    const dailyCount = {};
    
    logs.forEach(log => {
      // Mode集計
      const mode = log.mode || 'unknown';
      modeCount[mode] = (modeCount[mode] || 0) + 1;
      
      // Reason集計
      const reason = log.reason || 'unknown';
      reasonCount[reason] = (reasonCount[reason] || 0) + 1;
      
      // Domain集計（toから抽出）
      if (log.to) {
        const domain = log.to.includes('@') ? '@' + log.to.split('@')[1] : 'unknown';
        domainCount[domain] = (domainCount[domain] || 0) + 1;
      }
      
      // 日別集計
      const date = new Date(log.timestamp).toISOString().split('T')[0];
      if (!dailyCount[date]) {
        dailyCount[date] = { date, link: 0, attach: 0, blocked: 0 };
      }
      if (mode === 'link') dailyCount[date].link++;
      if (mode === 'attach') dailyCount[date].attach++;
      if (mode === 'blocked') dailyCount[date].blocked++;
    });
    
    // 日別データをソート
    const dailyData = Object.values(dailyCount).sort((a, b) => 
      a.date.localeCompare(b.date)
    );
    
    const stats = {
      period: {
        days: daysNum,
        from: new Date(cutoffTime).toISOString(),
        to: new Date(now).toISOString()
      },
      summary: {
        total: logs.length,
        modes: modeCount,
        reasons: reasonCount,
        domains: domainCount
      },
      daily: dailyData,
      recentLogs: logs.slice(0, 20)
    };
    
    return res.status(200).json(stats);
    
  } catch (error) {
    console.error('Stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
};