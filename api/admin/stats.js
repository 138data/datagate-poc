// api/admin/stats.js
import { searchAuditLogs } from '../../lib/audit-log.js';

/**
 * 統計データを集計
 * @param {Array} logs - 監査ログエントリ
 * @returns {Object} 集計結果
 */
function aggregateStats(logs) {
  const stats = {
    totalEvents: logs.length,
    modeDistribution: {
      link: 0,
      attach: 0,
      blocked: 0
    },
    reasonDistribution: {},
    domainDistribution: {},
    dailyStats: {},
    eventDistribution: {
      upload_success: 0,
      download_success: 0,
      download_failed: 0,
      download_blocked: 0
    },
    totalFileSize: 0
  };

  logs.forEach(log => {
    // 安全なログ処理（古いフォーマット対応）
    if (!log || typeof log !== 'object') {
      return;
    }

    // Mode 分布
    if (log.mode) {
      stats.modeDistribution[log.mode] = (stats.modeDistribution[log.mode] || 0) + 1;
    }

    // Reason 分布
    if (log.reason) {
      stats.reasonDistribution[log.reason] = (stats.reasonDistribution[log.reason] || 0) + 1;
    }

    // Domain 分布
    if (log.recipientDomain) {
      stats.domainDistribution[log.recipientDomain] = (stats.domainDistribution[log.recipientDomain] || 0) + 1;
    }

    // Event 分布
    if (log.event) {
      stats.eventDistribution[log.event] = (stats.eventDistribution[log.event] || 0) + 1;
    }

    // 日次統計（timestamp が存在する場合のみ）
    if (log.timestamp && typeof log.timestamp === 'string') {
      const date = log.timestamp.split('T')[0]; // YYYY-MM-DD
      if (!stats.dailyStats[date]) {
        stats.dailyStats[date] = {
          uploads: 0,
          downloads: 0,
          failures: 0,
          totalSize: 0
        };
      }
      
      if (log.event === 'upload_success') {
        stats.dailyStats[date].uploads += 1;
      } else if (log.event === 'download_success') {
        stats.dailyStats[date].downloads += 1;
      } else if (log.event === 'download_failed' || log.event === 'download_blocked') {
        stats.dailyStats[date].failures += 1;
      }
      
      if (log.size) {
        stats.dailyStats[date].totalSize += log.size;
        stats.totalFileSize += log.size;
      }
    }
  });

  return stats;
}

export default async function handler(req, res) {
  // Cache-Control: no-store
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // CORS（開発環境用）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // TODO: JWT認証を実装（Phase 42-P1）
    // 現在は認証なしで動作（開発環境のみ使用）

    // クエリパラメータから日数を取得（デフォルト7日）
    const days = parseInt(req.query.days || '7', 10);
    
    if (days < 1 || days > 90) {
      return res.status(400).json({ error: 'Days must be between 1 and 90' });
    }

    console.log(`[api/admin/stats] Fetching audit logs for ${days} days`);

    // 監査ログを検索
    const logs = await searchAuditLogs(days);

    console.log(`[api/admin/stats] Found ${logs.length} log entries`);

    // 統計を集計
    const stats = aggregateStats(logs);

    return res.status(200).json({
      success: true,
      days: days,
      stats: stats,
      logCount: logs.length
    });

  } catch (error) {
    console.error('[api/admin/stats] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}