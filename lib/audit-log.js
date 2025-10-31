// lib/audit-log.js
import { kv } from '@vercel/kv';

/**
 * 監査ログを保存
 * @param {Object} logEntry - ログエントリ
 */
export async function saveAuditLog(logEntry) {
  try {
    const logId = `audit:${Date.now()}:${Math.random().toString(36).substring(7)}`;
    const ttl = 14 * 24 * 60 * 60; // 14日間

    await kv.set(logId, JSON.stringify(logEntry), { ex: ttl });
    
    console.log('Audit log saved:', logId, logEntry);
  } catch (error) {
    console.error('Failed to save audit log:', error.message);
    // 監査ログの失敗は処理を止めない
  }
}