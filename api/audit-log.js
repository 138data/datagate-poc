// api/audit-log.js - 完全版（Part 1/1）

import { kv } from '@vercel/kv';
import { randomBytes } from 'crypto';

/**
 * 監査ログをKVに保存
 * @param {object} logEntry - ログエントリ
 * @param {string} logEntry.event - イベント種別（例: 'file_send'）
 * @param {string} logEntry.actor - 実行者（メールアドレスまたはIP）
 * @param {string} logEntry.to - 送信先メールアドレス
 * @param {'link'|'attach'|'blocked'} logEntry.mode - 送信モード
 * @param {string|null} logEntry.reason - 理由（size_exceeded, domain_not_allowed, sandbox_mode, feature_disabled等）
 * @param {string} logEntry.fileId - ファイルID
 * @param {string} logEntry.fileName - ファイル名
 * @param {number} logEntry.fileSize - ファイルサイズ（バイト）
 * @param {'success'|'failed'} logEntry.status - ステータス
 * @returns {Promise<{success: boolean, logId: string}>}
 */
export async function saveAuditLog(logEntry) {
  try {
    const timestamp = new Date().toISOString();
    const logId = `audit:${Date.now()}:${randomBytes(16).toString("hex")}`;
    
    const fullLogEntry = {
      ...logEntry,
      timestamp: timestamp
    };
    
    // KVに保存（TTL: 14日 = 1209600秒）
    await kv.set(logId, JSON.stringify(fullLogEntry), {
      ex: 1209600 // 14日間保持
    });
    
    console.log('[AuditLog] Saved:', logId, fullLogEntry);
    
    return {
      success: true,
      logId: logId
    };
  } catch (error) {
    console.error('[AuditLog] Save failed:', error);
    return {
      success: false,
      logId: null
    };
  }
}

/**
 * 監査ログを取得（管理画面用）
 * @param {number} limit - 取得件数（デフォルト: 100）
 * @returns {Promise<Array>}
 */
export async function getAuditLogs(limit = 100) {
  try {
    // KVからaudit:*パターンのキーを取得
    const keys = await kv.keys('audit:*');
    
    if (!keys || keys.length === 0) {
      return [];
    }
    
    // 最新順にソート（タイムスタンプ降順）
    const sortedKeys = keys.sort().reverse().slice(0, limit);
    
    // 各ログエントリを取得
    const logs = [];
    for (const key of sortedKeys) {
      const logData = await kv.get(key);
      if (logData) {
        const parsed = typeof logData === 'string' ? JSON.parse(logData) : logData;
        logs.push({
          logId: key,
          ...parsed
        });
      }
    }
    
    return logs;
  } catch (error) {
    console.error('[AuditLog] Get failed:', error);
    return [];
  }
}

/**
 * 特定の送信先への監査ログを検索
 * @param {string} recipient - 送信先メールアドレス
 * @param {number} limit - 取得件数
 * @returns {Promise<Array>}
 */
export async function getAuditLogsByRecipient(recipient, limit = 50) {
  try {
    const allLogs = await getAuditLogs(500); // 多めに取得してフィルタ
    
    const filtered = allLogs
      .filter(log => log.to === recipient)
      .slice(0, limit);
    
    return filtered;
  } catch (error) {
    console.error('[AuditLog] Search failed:', error);
    return [];
  }
}

/**
 * 特定のファイルIDの監査ログを検索
 * @param {string} fileId - ファイルID
 * @returns {Promise<Array>}
 */
export async function getAuditLogsByFileId(fileId) {
  try {
    const allLogs = await getAuditLogs(500);
    
    const filtered = allLogs.filter(log => log.fileId === fileId);
    
    return filtered;
  } catch (error) {
    console.error('[AuditLog] Search by fileId failed:', error);
    return [];
  }
}
