// KVクライアント（REST API方式）
const fetch = require('node-fetch');

const kvClient = {
    async get(key) {
        const url = `${(process.env.KV_REST_API_URL || '').trim()}/get/${key}`;
        const token = (process.env.KV_REST_API_TOKEN || '').trim();

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`KV GET failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.result;
    },

    async set(key, value, opts = {}) {
        const url = `${(process.env.KV_REST_API_URL || '').trim()}/set/${key}`;
        const token = (process.env.KV_REST_API_TOKEN || '').trim();

        const body = { value };
        if (opts.ex) body.ex = opts.ex;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`KV SET failed: ${response.statusText}`);
        }

        return await response.json();
    },

    async keys(pattern) {
        const url = `${(process.env.KV_REST_API_URL || '').trim()}/keys/${pattern}`;
        const token = (process.env.KV_REST_API_TOKEN || '').trim();

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 404) return [];
            throw new Error(`KV KEYS failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.result || [];
    },

    async del(key) {
        const url = `${(process.env.KV_REST_API_URL || '').trim()}/del/${key}`;
        const token = (process.env.KV_REST_API_TOKEN || '').trim();

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`KV DEL failed: ${response.statusText}`);
        }

        return await response.json();
    }
};

// api/kpi/daily.js
// 138DataGate - 日次KPI取得API

import kv from '@vercel/kv';
import { verifyToken } from '../../lib/guard.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  // JWT認証（管理者のみ）
  const authResult = verifyToken(req);
  if (!authResult.valid) {
    return res.status(401).json({
      success: false,
      error: '認証が必要です',
    });
  }

  try {
    const { date, days } = req.query;

    // 日付指定がある場合は特定の日、ない場合は最近N日分
    const daysToFetch = parseInt(days) || 7;
    const kpiData = [];

    if (date) {
      // 特定の日のKPIを取得
      const key = `kpi:${date}`;
      const data = await kvClient.get(key);
      
      if (data) {
        kpiData.push(data);
      }
    } else {
      // 最近N日分のKPIを取得
      const today = new Date();
      
      for (let i = 0; i < daysToFetch; i++) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() - i);
        const dateStr = targetDate.toISOString().split('T')[0];
        
        const key = `kpi:${dateStr}`;
        const data = await kvClient.get(key);
        
        if (data) {
          kpiData.push(data);
        }
      }
    }

    // 集計
    const summary = {
      totalUploads: 0,
      totalSize: 0,
      totalCompressedSize: 0,
      totalCompressionSaved: 0,
      avgUploadTime: 0,
      totalErrors: 0,
      avgCompressionRatio: 0,
    };

    kpiData.forEach(day => {
      summary.totalUploads += day.uploads || 0;
      summary.totalSize += day.totalSize || 0;
      summary.totalCompressedSize += day.compressedSize || 0;
      summary.totalCompressionSaved += day.compressionSaved || 0;
      summary.totalErrors += day.errors || 0;
    });

    if (kpiData.length > 0) {
      const avgTimes = kpiData.map(d => d.avgUploadTime || 0);
      summary.avgUploadTime = avgTimes.reduce((a, b) => a + b, 0) / avgTimes.length;
      
      if (summary.totalSize > 0) {
        summary.avgCompressionRatio = summary.totalCompressedSize / summary.totalSize;
      }
    }

    res.status(200).json({
      success: true,
      summary,
      dailyData: kpiData.reverse(), // 古い順に並べ替え
      period: {
        from: kpiData[kpiData.length - 1]?.date,
        to: kpiData[0]?.date,
        days: kpiData.length,
      },
    });

  } catch (error) {
    console.error('[KPI] エラー:', error);

    res.status(500).json({
      success: false,
      error: 'KPIの取得に失敗しました',
      details: error.message,
    });
  }
}
