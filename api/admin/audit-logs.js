// api/admin/audit-logs.js
// Phase 35b: 監査ログ取得（管理者用）

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 簡易認証（本番では JWT や API Key を推奨）
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // クエリパラメータ
    const { limit = 100, offset = 0 } = req.query;
    const limitInt = Math.min(parseInt(limit), 1000);
    const offsetInt = parseInt(offset);

    // KV から監査ログ取得（LRANGE）
    const logs = await kv.lrange('audit:log', offsetInt, offsetInt + limitInt - 1);

    // JSON パース
    const parsedLogs = logs.map(log => {
      try {
        return JSON.parse(log);
      } catch {
        return { raw: log };
      }
    });

    res.status(200).json({
      logs: parsedLogs,
      count: parsedLogs.length,
      offset: offsetInt,
      limit: limitInt
    });

  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
}
