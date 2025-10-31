import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const LOGS_FILE = path.join(process.cwd(), 'logs.json');

// ログタイプの定義
export const LOG_TYPES = {
  AUTH: 'auth',
  UPLOAD: 'upload',
  DOWNLOAD: 'download',
  DELETE: 'delete',
  USER: 'user',
  SYSTEM: 'system',
  ERROR: 'error'
};

// ログレベルの定義
export const LOG_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

// ログの初期化
function initLogs() {
  if (!fs.existsSync(LOGS_FILE)) {
    fs.writeFileSync(LOGS_FILE, JSON.stringify({ logs: [] }, null, 2));
  }
}

// ログの記録
export async function logActivity({
  type,
  level = LOG_LEVELS.INFO,
  user = 'system',
  action,
  details = {},
  ip = null
}) {
  initLogs();
  
  const logEntry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    type,
    level,
    user,
    action,
    details,
    ip
  };
  
  try {
    const data = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    data.logs.unshift(logEntry); // 最新のログを先頭に
    
    // ログサイズ管理（最大1000件）
    if (data.logs.length > 1000) {
      data.logs = data.logs.slice(0, 1000);
    }
    
    fs.writeFileSync(LOGS_FILE, JSON.stringify(data, null, 2));
    return logEntry;
  } catch (error) {
    console.error('Failed to write log:', error);
    return null;
  }
}

// ログの取得
export function getLogs(filters = {}) {
  initLogs();
  
  try {
    const data = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    let logs = data.logs || [];
    
    // フィルタ適用
    if (filters.type) {
      logs = logs.filter(log => log.type === filters.type);
    }
    if (filters.level) {
      logs = logs.filter(log => log.level === filters.level);
    }
    if (filters.user) {
      logs = logs.filter(log => 
        log.user.toLowerCase().includes(filters.user.toLowerCase())
      );
    }
    if (filters.startDate) {
      logs = logs.filter(log => 
        new Date(log.timestamp) >= new Date(filters.startDate)
      );
    }
    if (filters.endDate) {
      logs = logs.filter(log => 
        new Date(log.timestamp) <= new Date(filters.endDate)
      );
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      logs = logs.filter(log => 
        log.action.toLowerCase().includes(searchLower) ||
        JSON.stringify(log.details).toLowerCase().includes(searchLower)
      );
    }
    
    return logs;
  } catch (error) {
    console.error('Failed to read logs:', error);
    return [];
  }
}

// ログの削除（古いログのクリーンアップ）
export function cleanupLogs(daysToKeep = 30) {
  initLogs();
  
  try {
    const data = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const originalCount = data.logs.length;
    data.logs = data.logs.filter(log => 
      new Date(log.timestamp) > cutoffDate
    );
    
    const deletedCount = originalCount - data.logs.length;
    fs.writeFileSync(LOGS_FILE, JSON.stringify(data, null, 2));
    
    return { deletedCount, remainingCount: data.logs.length };
  } catch (error) {
    console.error('Failed to cleanup logs:', error);
    return { deletedCount: 0, remainingCount: 0 };
  }
}

export default { logActivity, getLogs, LOG_TYPES, LOG_LEVELS, cleanupLogs };