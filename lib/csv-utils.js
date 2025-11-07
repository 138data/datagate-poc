/**
 * CSV生成ユーティリティ
 * 監査ログをCSV形式にエクスポートする機能を提供
 *
 * Phase 54 機能2: ログ管理画面 + CSV DL
 * 修正: ts フィールド対応
 */

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
const EVENT_LABELS = {
  upload: 'アップロード',
  download: 'ダウンロード',
  delete: '削除',
  revoke: '失効',
  email_send: 'メール送信',
  email_sent: 'メール送信',
  otp_verified: 'OTP検証',
  upload_success: 'アップロード成功',
  download_success: 'ダウンロード成功',
  file_upload: 'ファイルアップロード',
  file_revoked: 'ファイル失効'
};

/**
 * 配信モードの日本語マッピング
 */
const MODE_LABELS = {
  link: 'リンク送付',
  attach: '添付直送',
  blocked: 'ブロック'
};

/**
 * ステータスの日本語マッピング
 */
const STATUS_LABELS = {
  success: '成功',
  error: 'エラー',
  warning: '警告'
};

/**
 * CSVセル値のエスケープ処理
 * ダブルクォーテーション、カンマ、改行を含む値を適切に処理
 *
 * @param {any} value - エスケープする値
 * @returns {string} エスケープされた文字列
 */
function escapeCsvValue(value) {
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
 * @param {number|string} timestamp - UNIXタイムスタンプ（ミリ秒）またはISO文字列
 * @param {string} format - 出力形式（'iso' | 'timestamp' | 'readable'）
 * @returns {string} フォーマットされた日時文字列
 */
function formatTimestamp(timestamp, format = 'iso') {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);

  if (isNaN(date.getTime())) {
    return '';
  }

  switch (format) {
    case 'iso':
      return date.toISOString();
    case 'timestamp':
      return String(date.getTime());
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
 * @param {Object} entry - 監査ログエントリ
 * @param {Object} options - CSV出力オプション
 * @returns {string} CSV形式の行文字列
 */
function logEntryToCsvRow(entry, options = {}) {
  const dateFormat = options.dateFormat || 'readable';
  const delimiter = options.delimiter || ',';

  // tsフィールドを優先、なければtimestampにフォールバック
  const timestamp = entry.ts || entry.timestamp;

  const values = [
    timestamp || '',
    formatTimestamp(timestamp, dateFormat),
    EVENT_LABELS[entry.event] || entry.event || '',
    entry.actor || '',
    entry.fileId || '',
    entry.fileName || '',
    entry.to || '',
    entry.mode ? (MODE_LABELS[entry.mode] || entry.mode) : '',
    entry.reason || '',
    entry.fileSize !== undefined ? String(entry.fileSize) : (entry.size !== undefined ? String(entry.size) : ''),
    entry.status ? (STATUS_LABELS[entry.status] || entry.status) : '',
    entry.metadata ? JSON.stringify(entry.metadata) : ''
  ];

  return values.map(escapeCsvValue).join(delimiter);
}

/**
 * 監査ログ配列をCSV文字列に変換
 *
 * @param {Array} logs - 監査ログエントリの配列
 * @param {Object} options - CSV出力オプション
 * @returns {string} CSV形式の文字列
 */
function generateCsv(logs, options = {}) {
  const includeHeader = options.includeHeader !== false;
  const delimiter = options.delimiter || ',';
  const lines = [];

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
 * @param {Array} logs - 監査ログエントリの配列
 * @param {Object} options - CSV出力オプション
 * @returns {Buffer} UTF-8エンコードされたBuffer
 */
function generateCsvBuffer(logs, options = {}) {
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
 * @param {string} prefix - ファイル名のプレフィックス
 * @param {Date} startDate - 期間開始日（オプション）
 * @param {Date} endDate - 期間終了日（オプション）
 * @returns {string} CSVファイル名
 */
function generateCsvFilename(prefix = 'audit-logs', startDate = null, endDate = null) {
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
 * @param {Array} logs - 監査ログエントリの配列
 * @param {Object} filters - フィルター条件
 * @returns {Array} フィルタリングされた監査ログ
 */
function filterLogs(logs, filters = {}) {
  return logs.filter(log => {
    // tsフィールドを優先
    const timestamp = log.ts || log.timestamp;
    const logTime = timestamp ? new Date(timestamp).getTime() : 0;

    // 期間フィルター
    if (filters.startDate && logTime < filters.startDate.getTime()) {
      return false;
    }
    if (filters.endDate && logTime > filters.endDate.getTime()) {
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
 * @param {Array} logs - 監査ログエントリの配列
 * @returns {Map} 日付ごとにグループ化されたログ
 */
function groupLogsByDate(logs) {
  const grouped = new Map();

  for (const log of logs) {
    const timestamp = log.ts || log.timestamp;
    if (!timestamp) continue;

    const date = new Date(timestamp).toISOString().split('T')[0];
    const group = grouped.get(date) || [];
    group.push(log);
    grouped.set(date, group);
  }

  return grouped;
}

/**
 * 監査ログの統計情報を計算
 *
 * @param {Array} logs - 監査ログエントリの配列
 * @returns {Object} 統計情報
 */
function calculateLogStatistics(logs) {
  const stats = {
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

    // ファイルサイズの集計（fileSizeとsizeの両方をチェック）
    const size = log.fileSize || log.size;
    if (size) {
      stats.totalSize += size;
    }
  }

  // 平均サイズを計算
  const logsWithSize = logs.filter(log => (log.fileSize !== undefined) || (log.size !== undefined));
  if (logsWithSize.length > 0) {
    stats.averageSize = stats.totalSize / logsWithSize.length;
  }

  return stats;
}

// エクスポート
module.exports = {
  generateCsv,
  generateCsvBuffer,
  generateCsvFilename,
  filterLogs,
  groupLogsByDate,
  calculateLogStatistics,
  // 内部関数も必要に応じてエクスポート
  escapeCsvValue,
  formatTimestamp,
  EVENT_LABELS,
  MODE_LABELS,
  STATUS_LABELS
};
