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

// api/kpi/realtime.js
// 138DataGate - リアルタイムKPI取得API

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
    const today = new Date().toISOString().split('T')[0];
    const key = `kpi:${today}`;

    const data = await kvClient.get(key) || {
      date: today,
      uploads: 0,
      totalSize: 0,
      compressedSize: 0,
      compressionSaved: 0,
      avgUploadTime: 0,
      errors: 0,
      uploadTimes: []
    };

    // KVコマンド数の推定（概算）
    const estimatedCommands = data.uploads * 4; // upload:2, download:2

    // しきい値チェック
    const warnings = [];

    if (data.avgUploadTime > 8000) {
      warnings.push({
        level: 'critical',
        message: '平均アップロード時間が8秒を超えています',
        recommendation: 'ファイルサイズ制限の引き下げまたは圧縮の強化を検討してください'
      });
    } else if (data.avgUploadTime > 5000) {
      warnings.push({
        level: 'warning',
        message: '平均アップロード時間が5秒を超えています',
        recommendation: '監視を継続してください'
      });
    }

    if (estimatedCommands > 8000) {
      warnings.push({
        level: 'critical',
        message: '推定コマンド数が8,000を超えています',
        recommendation: 'Upstash有料プランへの移行を検討してください'
      });
    }

    if (data.compressionSaved > 0 && data.totalSize > 0) {
      const savedRatio = data.compressionSaved / data.totalSize;
      if (savedRatio > 0.3) {
        warnings.push({
          level: 'info',
          message: `圧縮により${(savedRatio * 100).toFixed(1)}%の容量削減に成功しています`,
          recommendation: '圧縮が効果的に機能しています'
        });
      }
    }

    res.status(200).json({
      success: true,
      date: today,
      kpi: {
        uploads: data.uploads,
        totalSize: data.totalSize,
        totalSizeMB: (data.totalSize / 1024 / 1024).toFixed(2),
        compressedSize: data.compressedSize,
        compressedSizeMB: (data.compressedSize / 1024 / 1024).toFixed(2),
        compressionSaved: data.compressionSaved,
        compressionSavedMB: (data.compressionSaved / 1024 / 1024).toFixed(2),
        avgUploadTime: data.avgUploadTime,
        avgUploadTimeSeconds: (data.avgUploadTime / 1000).toFixed(2),
        errors: data.errors,
        errorRate: data.uploads > 0 ? (data.errors / data.uploads * 100).toFixed(2) : 0,
        estimatedCommands: estimatedCommands,
      },
      warnings,
      thresholds: {
        commandsPerDay: 10000,
        currentCommands: estimatedCommands,
        commandsRemaining: 10000 - estimatedCommands,
        avgUploadTimeMax: 8000, // ms
        avgUploadTimeCurrent: data.avgUploadTime,
      },
    });

  } catch (error) {
    console.error('[KPI] エラー:', error);

    res.status(500).json({
      success: false,
      error: 'リアルタイムKPIの取得に失敗しました',
      details: error.message,
    });
  }
}
