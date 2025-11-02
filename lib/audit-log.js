// lib/audit-log.js
import { kv } from '@vercel/kv';

const AUDIT_LOG_TTL = 30 * 24 * 60 * 60; // 30日保持（Phase 42対応）

/**
 * 監査ログを保存
 * @param {Object} params - ログパラメータ
 * @param {string} params.event - イベントタイプ (upload_success, download_success, download_failed, download_blocked)
 * @param {string} params.actor - アクター（メールアドレス）
 * @param {string} params.fileId - ファイルID
 * @param {string} params.fileName - ファイル名
 * @param {string} params.to - 受信者メールアドレス（オプション）
 * @param {string} params.mode - 配信モード (link, attach, blocked)
 * @param {string} params.reason - 理由（オプション）
 * @param {number} params.size - ファイルサイズ（バイト）
 * @param {string} params.status - ステータス（success, failed, blocked）
 * @param {number} params.downloadCount - ダウンロード回数（オプション）
 * @param {string} params.recipientDomain - 受信者ドメイン（オプション、自動抽出）
 */
export async function saveAuditLog(params) {
  try {
    const timestamp = Date.now();
    const logId = `audit:${timestamp}:${Math.random().toString(36).substring(2, 15)}`;

    // 受信者ドメインを抽出（小文字化）
    let recipientDomain = params.recipientDomain;
    if (!recipientDomain && params.to) {
      const match = params.to.match(/@(.+)$/);
      recipientDomain = match ? match[1].toLowerCase() : null;
    }

    const logEntry = {
      timestamp: new Date(timestamp).toISOString(),
      event: params.event,
      actor: params.actor,
      fileId: params.fileId,
      fileName: params.fileName,
      to: params.to || null,
      mode: params.mode || null,
      reason: params.reason || null,
      size: params.size || 0,
      status: params.status || 'success',
      downloadCount: params.downloadCount || null,
      recipientDomain: recipientDomain || null
    };

    await kv.set(logId, JSON.stringify(logEntry), {
      ex: AUDIT_LOG_TTL
    });

    console.log('[audit-log] Saved:', logId, logEntry);
  } catch (error) {
    console.error('[audit-log] Error saving audit log:', error);
    // ログ保存失敗してもメインフローは継続
  }
}

/**
 * 監査ログを検索（日数指定）
 * @param {number} days - 検索対象日数（デフォルト7日）
 * @returns {Promise<Array>} ログエントリの配列
 */
export async function searchAuditLogs(days = 7) {
  try {
    const now = Date.now();
    const startTime = now - (days * 24 * 60 * 60 * 1000);
    
    const keys = [];
    let cursor = '0';
    
    do {
      const [nextCursor, batch] = await kv.scan(cursor, {
        match: 'audit:*',
        count: 100
      });
      
      cursor = nextCursor;
      keys.push(...batch);
      
      // 無限ループ防止（最大1000件）
      if (keys.length >= 1000) {
        break;
      }
    } while (cursor !== '0');

    // タイムスタンプでフィルタリング
    const filteredKeys = keys.filter(key => {
      const parts = key.split(':');
      if (parts.length < 2) return false;
      const keyTimestamp = parseInt(parts[1], 10);
      return keyTimestamp >= startTime;
    });

    // ログエントリを取得
    const logs = [];
    for (const key of filteredKeys) {
      const entry = await kv.get(key);
      if (entry) {
        const parsed = typeof entry === 'string' ? JSON.parse(entry) : entry;
        logs.push(parsed);
      }
    }

    // タイムスタンプで降順ソート
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return logs;
  } catch (error) {
    console.error('[audit-log] Error searching audit logs:', error);
    return [];
  }
}