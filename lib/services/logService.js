// lib/services/logService.js
import { kv } from '@vercel/kv';

/**
 * 拡張ログ形式
 * @typedef {Object} FileLog
 * @property {string} fileId - ファイルID
 * @property {string} sender - 送信者メールアドレス
 * @property {string} senderName - 送信者名（任意）
 * @property {string} recipient - 受信者メールアドレス
 * @property {number} uploadedAt - アップロード日時（UNIX timestamp）
 * @property {number|null} downloadedAt - ダウンロード日時（null可）
 * @property {number|null} deletedAt - 削除日時（null可）
 * @property {string|null} deletedBy - 削除者（'sender' | 'auto' | 'admin'）
 * @property {number|null} notifiedAt - 開封通知送信日時（null可）
 * @property {string} fileName - ファイル名
 * @property {number} fileSize - ファイルサイズ（バイト）
 * @property {string} deliveryMode - 配信モード（'link' | 'attach' | 'blocked'）
 * @property {string} ipAddress - アップロード元IP
 * @property {string|null} downloadIp - ダウンロード元IP（null可）
 */

/**
 * ログをKVに保存
 * @param {FileLog} logData - ログデータ
 * @returns {Promise<void>}
 */
export async function saveLog(logData) {
  const logKey = `log:${logData.fileId}`;
  
  // ログデータをKVに保存（14日TTL）
  await kv.set(logKey, logData, {
    ex: 14 * 24 * 60 * 60, // 14日間保持
  });
  
  // インデックス用に送信者別リストも更新
  const senderLogsKey = `logs:sender:${logData.sender}`;
  await kv.sadd(senderLogsKey, logData.fileId);
  await kv.expire(senderLogsKey, 14 * 24 * 60 * 60);
  
  // 全ログリストも更新（管理者用）
  await kv.sadd('logs:all', logData.fileId);
}

/**
 * ログを更新（部分更新）
 * @param {string} fileId - ファイルID
 * @param {Partial<FileLog>} updates - 更新内容
 * @returns {Promise<FileLog|null>}
 */
export async function updateLog(fileId, updates) {
  const logKey = `log:${fileId}`;
  const existingLog = await kv.get(logKey);
  
  if (!existingLog) {
    return null;
  }
  
  const updatedLog = {
    ...existingLog,
    ...updates,
  };
  
  await kv.set(logKey, updatedLog, {
    ex: 14 * 24 * 60 * 60,
  });
  
  return updatedLog;
}

/**
 * ログを取得
 * @param {string} fileId - ファイルID
 * @returns {Promise<FileLog|null>}
 */
export async function getLog(fileId) {
  const logKey = `log:${fileId}`;
  return await kv.get(logKey);
}

/**
 * 送信者のログ一覧を取得
 * @param {string} senderEmail - 送信者メールアドレス
 * @returns {Promise<FileLog[]>}
 */
export async function getLogsBySender(senderEmail) {
  const senderLogsKey = `logs:sender:${senderEmail}`;
  const fileIds = await kv.smembers(senderLogsKey);
  
  if (!fileIds || fileIds.length === 0) {
    return [];
  }
  
  const logs = await Promise.all(
    fileIds.map(fileId => getLog(fileId))
  );
  
  return logs.filter(log => log !== null);
}

/**
 * 全ログを取得（管理者用）
 * @param {number} limit - 取得件数上限
 * @returns {Promise<FileLog[]>}
 */
export async function getAllLogs(limit = 100) {
  const fileIds = await kv.smembers('logs:all');
  
  if (!fileIds || fileIds.length === 0) {
    return [];
  }
  
  // 最新のlimit件のみ取得
  const limitedFileIds = Array.from(fileIds).slice(0, limit);
  
  const logs = await Promise.all(
    limitedFileIds.map(fileId => getLog(fileId))
  );
  
  // タイムスタンプ降順でソート
  return logs
    .filter(log => log !== null)
    .sort((a, b) => b.uploadedAt - a.uploadedAt);
}

/**
 * ログをCSV形式に変換
 * @param {FileLog[]} logs - ログデータ配列
 * @returns {string} CSV文字列
 */
export function convertLogsToCSV(logs) {
  const headers = [
    'ファイルID',
    '送信者',
    '送信者名',
    '受信者',
    'アップロード日時',
    'ダウンロード日時',
    '削除日時',
    '削除者',
    '開封通知日時',
    'ファイル名',
    'ファイルサイズ(バイト)',
    '配信モード',
    'アップロード元IP',
    'ダウンロード元IP',
  ];
  
  const rows = logs.map(log => [
    log.fileId,
    log.sender,
    log.senderName || '',
    log.recipient,
    new Date(log.uploadedAt).toLocaleString('ja-JP'),
    log.downloadedAt ? new Date(log.downloadedAt).toLocaleString('ja-JP') : '',
    log.deletedAt ? new Date(log.deletedAt).toLocaleString('ja-JP') : '',
    log.deletedBy || '',
    log.notifiedAt ? new Date(log.notifiedAt).toLocaleString('ja-JP') : '',
    log.fileName,
    log.fileSize,
    log.deliveryMode,
    log.ipAddress,
    log.downloadIp || '',
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');
  
  return csvContent;
}