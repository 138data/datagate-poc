/**
 * CSV生成ユーティリティ
 * 監査ログをCSV形式にエクスポートする機能を提供
 * 
 * Phase 54 機能2: ログ管理画面 + CSV DL
 */

/**
 * 監査ログのデータ型定義
 */
export interface AuditLogEntry {
  timestamp: number;
  event: 'upload' | 'download' | 'delete' | 'revoke' | 'email_sent' | 'otp_verified';
  actor: string;
  fileId?: string;
  fileName?: string;
  to?: string;
  mode?: 'link' | 'attach' | 'blocked';
  reason?: string;
  size?: number;
  status?: 'success' | 'error' | 'warning';
  metadata?: Record<string, any>;
}

/**
 * CSV出力オプション
 */
export interface CsvOptions {
  delimiter?: string;
  includeHeader?: boolean;
  dateFormat?: 'iso' | 'timestamp' | 'readable';
  encoding?: BufferEncoding;
}

/**
 * CSV出力のヘッダー定義
 * 日本語ヘッダーを使用してユーザビリティを向上
 */
const CSV_HEADERS = [
  'タイムスタンプ',
  '日時',
  'イベント種別',
  'アクター',
  'ファイルID',
  'ファイル名',
  '宛先',
  '配信モード',
  '理由',
  'サイズ(bytes)',
  'ステータス',
  'メタデータ'
];

/**
 * イベント種別の日本語マッピング
 */
const EVENT_LABELS: Record<string, string> = {
  upload: 'アップロード',
  download: 'ダウンロード',
  delete: '削除',
  revoke: '失効',
  email_sent: 'メール送信',
  otp_verified: 'OTP検証'
};

/**
 * 配信モードの日本語マッピング
 */
const MODE_LABELS: Record<string, string> = {
  link: 'リンク送付',
  attach: '添付直送',
  blocked: 'ブロック'
};

/**
 * ステータスの日本語マッピング
 */
const STATUS_LABELS: Record<string, string> = {
  success: '成功',
  error: 'エラー',
  warning: '警告'
};

/**
 * CSVセル値のエスケープ処理
 * ダブルクォーテーション、カンマ、改行を含む値を適切に処理
 * 
 * @param value - エスケープする値
 * @returns エスケープされた文字列
 */
function escapeCsvValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  // ダブルクォーテーション、カンマ、改行を含む場合はダブルクォーテーションで囲む
  if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * タイムスタンプを指定形式に変換
 * 
 * @param timestamp - UNIXタイムスタンプ（ミリ秒）
 * @param format - 出力形式
 * @returns フォーマットされた日時文字列
 */
function formatTimestamp(timestamp: number, format: 'iso' | 'timestamp' | 'readable'): string {
  const date = new Date(timestamp);

  switch (format) {
    case 'iso':
      return date.toISOString();
    case 'timestamp':
      return String(timestamp);
    case 'readable':
      return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    default:
      return date.toISOString();
  }
}

/**
 * 監査ログエントリをCSV行に変換
 * 
 * @param entry - 監査ログエントリ
 * @param options - CSV出力オプション
 * @returns CSV形式の行文字列
 */
function logEntryToCsvRow(entry: AuditLogEntry, options: CsvOptions): string {
  const dateFormat = options.dateFormat || 'iso';
  const delimiter = options.delimiter || ',';

  const values = [
    entry.timestamp,
    formatTimestamp(entry.timestamp, dateFormat),
    EVENT_LABELS[entry.event] || entry.event,
    entry.actor || '',
    entry.fileId || '',
    entry.fileName || '',
    entry.to || '',
    entry.mode ? (MODE_LABELS[entry.mode] || entry.mode) : '',
    entry.reason || '',
    entry.size !== undefined ? String(entry.size) : '',
    entry.status ? (STATUS_LABELS[entry.status] || entry.status) : '',
    entry.metadata ? JSON.stringify(entry.metadata) : ''
  ];

  return values.map(escapeCsvValue).join(delimiter);
}

/**
 * 監査ログ配列をCSV文字列に変換
 * 
 * @param logs - 監査ログエントリの配列
 * @param options - CSV出力オプション
 * @returns CSV形式の文字列
 */
export function generateCsv(logs: AuditLogEntry[], options: CsvOptions = {}): string {
  const includeHeader = options.includeHeader !== false;
  const delimiter = options.delimiter || ',';
  const lines: string[] = [];

  // ヘッダー行を追加
  if (includeHeader) {
    lines.push(CSV_HEADERS.map(escapeCsvValue).join(delimiter));
  }

  // データ行を追加
  for (const log of logs) {
    lines.push(logEntryToCsvRow(log, options));
  }

  return lines.join('\n');
}

/**
 * 監査ログ配列をCSV Bufferに変換
 * ダウンロード用のバイナリデータを生成
 * 
 * @param logs - 監査ログエントリの配列
 * @param options - CSV出力オプション
 * @returns UTF-8エンコードされたBuffer
 */
export function generateCsvBuffer(logs: AuditLogEntry[], options: CsvOptions = {}): Buffer {
  const encoding = options.encoding || 'utf8';
  const csvString = generateCsv(logs, options);

  // BOM付きUTF-8で出力（Excelでの文字化け防止）
  if (encoding === 'utf8') {
    const bom = Buffer.from('\ufeff', 'utf8');
    const csvBuffer = Buffer.from(csvString, 'utf8');
    return Buffer.concat([bom, csvBuffer]);
  }

  return Buffer.from(csvString, encoding);
}

/**
 * CSVファイル名を生成
 * 
 * @param prefix - ファイル名のプレフィックス
 * @param startDate - 期間開始日（オプション）
 * @param endDate - 期間終了日（オプション）
 * @returns CSVファイル名
 */
export function generateCsvFilename(
  prefix: string = 'audit-logs',
  startDate?: Date,
  endDate?: Date
): string {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];

  if (startDate && endDate) {
    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];
    return `${prefix}_${start}_to_${end}_${timestamp}.csv`;
  }

  return `${prefix}_${timestamp}.csv`;
}

/**
 * 監査ログをフィルタリング
 * 
 * @param logs - 監査ログエントリの配列
 * @param filters - フィルター条件
 * @returns フィルタリングされた監査ログ
 */
export interface LogFilters {
  startDate?: Date;
  endDate?: Date;
  event?: string;
  actor?: string;
  status?: string;
}

export function filterLogs(logs: AuditLogEntry[], filters: LogFilters): AuditLogEntry[] {
  return logs.filter(log => {
    // 期間フィルター
    if (filters.startDate && log.timestamp < filters.startDate.getTime()) {
      return false;
    }
    if (filters.endDate && log.timestamp > filters.endDate.getTime()) {
      return false;
    }

    // イベント種別フィルター
    if (filters.event && log.event !== filters.event) {
      return false;
    }

    // アクターフィルター
    if (filters.actor && !log.actor?.includes(filters.actor)) {
      return false;
    }

    // ステータスフィルター
    if (filters.status && log.status !== filters.status) {
      return false;
    }

    return true;
  });
}

/**
 * 監査ログを日付範囲でグループ化
 * 
 * @param logs - 監査ログエントリの配列
 * @returns 日付ごとにグループ化されたログ
 */
export function groupLogsByDate(logs: AuditLogEntry[]): Map<string, AuditLogEntry[]> {
  const grouped = new Map<string, AuditLogEntry[]>();

  for (const log of logs) {
    const date = new Date(log.timestamp).toISOString().split('T')[0];
    const group = grouped.get(date) || [];
    group.push(log);
    grouped.set(date, group);
  }

  return grouped;
}

/**
 * 監査ログの統計情報を計算
 * 
 * @param logs - 監査ログエントリの配列
 * @returns 統計情報
 */
export interface LogStatistics {
  total: number;
  byEvent: Record<string, number>;
  byStatus: Record<string, number>;
  byMode: Record<string, number>;
  totalSize: number;
  averageSize: number;
}

export function calculateLogStatistics(logs: AuditLogEntry[]): LogStatistics {
  const stats: LogStatistics = {
    total: logs.length,
    byEvent: {},
    byStatus: {},
    byMode: {},
    totalSize: 0,
    averageSize: 0
  };

  for (const log of logs) {
    // イベント種別ごとの集計
    stats.byEvent[log.event] = (stats.byEvent[log.event] || 0) + 1;

    // ステータスごとの集計
    if (log.status) {
      stats.byStatus[log.status] = (stats.byStatus[log.status] || 0) + 1;
    }

    // 配信モードごとの集計
    if (log.mode) {
      stats.byMode[log.mode] = (stats.byMode[log.mode] || 0) + 1;
    }

    // ファイルサイズの集計
    if (log.size) {
      stats.totalSize += log.size;
    }
  }

  // 平均サイズを計算
  const logsWithSize = logs.filter(log => log.size !== undefined);
  if (logsWithSize.length > 0) {
    stats.averageSize = stats.totalSize / logsWithSize.length;
  }

  return stats;
}