/**
 * ログ管理API
 * 監査ログの取得・フィルタリング・CSV出力機能
 * 
 * Phase 54 機能2: ログ管理画面 + CSV DL
 * 
 * エンドポイント:
 * - GET /api/admin/logs?format=json - ログ一覧取得（JSON）
 * - GET /api/admin/logs?format=csv - ログCSVダウンロード
 */

const { kv } = require('@vercel/kv');
const jwt = require('jsonwebtoken');
const {
  generateCsvBuffer,
  generateCsvFilename,
  filterLogs,
  calculateLogStatistics
} = require('../../../lib/csv-utils');

/**
 * デフォルト設定
 */
const DEFAULT_DAYS = 7;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/**
 * JWT トークンの検証
 * 
 * @param {string} token - JWT トークン
 * @returns {Object|null} デコードされたペイロード（検証失敗時は null）
 */
function verifyToken(token) {
  try {
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
      console.error('ADMIN_JWT_SECRET が設定されていません');
      return null;
    }

    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: '138datagate',
      audience: 'admin-dashboard'
    });

    return decoded;
  } catch (error) {
    console.error('JWT検証エラー:', error.message);
    return null;
  }
}

/**
 * リクエストヘッダーからトークンを抽出
 * 
 * @param {Object} req - Vercel リクエスト
 * @returns {string|null} JWT トークン（存在しない場合は null）
 */
function extractTokenFromHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

/**
 * JWT認証チェック
 * 
 * @param {Object} req - Vercel リクエスト
 * @param {Object} res - Vercel レスポンス
 * @returns {boolean} 認証済みの場合は true、それ以外は false
 */
function requireAuth(req, res) {
  const token = extractTokenFromHeader(req);

  if (!token) {
    res.status(401).json({
      success: false,
      error: '認証が必要です'
    });
    return false;
  }

  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      error: 'トークンが無効または期限切れです'
    });
    return false;
  }

  // リクエストオブジェクトにユーザー情報を追加
  req.user = {
    username: payload.user,
    role: payload.role
  };

  return true;
}

/**
 * Vercel KV から監査ログを取得
 * 
 * @param {number} days - 過去何日分のログを取得するか
 * @returns {Promise<Array>} 監査ログエントリの配列
 */
async function fetchAuditLogs(days) {
  try {
    const now = Date.now();
    const startTime = now - days * 24 * 60 * 60 * 1000;

    // audit:* パターンでキーを検索
    const keys = await kv.keys('audit:*');

    // 期間内のログのみをフィルタリング
    const relevantKeys = keys.filter(key => {
      const parts = key.split(':');
      if (parts.length < 2) return false;

      const timestamp = parseInt(parts[1], 10);
      return timestamp >= startTime && timestamp <= now;
    });

    // ログデータを並列取得
    const logs = await Promise.all(
      relevantKeys.map(async key => {
        const data = await kv.get(key);
        if (!data) return null;

        try {
          // KVに保存されているデータが文字列の場合はパース
          const parsed = typeof data === 'string' ? JSON.parse(data) : data;
          return parsed;
        } catch {
          return null;
        }
      })
    );

    // null を除外してタイムスタンプでソート（新しい順）
    return logs
      .filter(log => log !== null)
      .sort((a, b) => b.timestamp - a.timestamp);

  } catch (error) {
    console.error('監査ログ取得エラー:', error);
    throw new Error('監査ログの取得に失敗しました');
  }
}

/**
 * クエリパラメータの解析
 * 
 * @param {Object} query - Vercelリクエストのクエリ
 * @returns {Object} 解析されたパラメータ
 */
function parseQueryParams(query) {
  const params = {
    format: query.format || 'json',
    days: query.days,
    startDate: query.startDate,
    endDate: query.endDate,
    event: query.event,
    actor: query.actor,
    status: query.status,
    limit: query.limit,
    offset: query.offset
  };

  // days パラメータを数値に変換
  let parsedDays = DEFAULT_DAYS;
  if (params.days) {
    const days = parseInt(params.days, 10);
    if (!isNaN(days) && days > 0 && days <= 90) {
      parsedDays = days;
    }
  }

  return { ...params, parsedDays };
}

/**
 * フィルター条件の構築
 * 
 * @param {Object} params - クエリパラメータ
 * @returns {Object} フィルター条件
 */
function buildFilters(params) {
  const filters = {};

  // 日付範囲フィルター
  if (params.startDate) {
    const startDate = new Date(params.startDate);
    if (!isNaN(startDate.getTime())) {
      filters.startDate = startDate;
    }
  }

  if (params.endDate) {
    const endDate = new Date(params.endDate);
    if (!isNaN(endDate.getTime())) {
      filters.endDate = endDate;
    }
  }

  // イベント種別フィルター
  if (params.event) {
    filters.event = params.event;
  }

  // アクターフィルター
  if (params.actor) {
    filters.actor = params.actor;
  }

  // ステータスフィルター
  if (params.status) {
    filters.status = params.status;
  }

  return filters;
}

/**
 * ページネーション処理
 * 
 * @param {Array} logs - ログエントリの配列
 * @param {number} limit - 1ページあたりの件数
 * @param {number} offset - オフセット
 * @returns {Object} ページネーションされたログと情報
 */
function paginateLogs(logs, limit, offset) {
  const total = logs.length;
  const paginatedLogs = logs.slice(offset, offset + limit);

  return {
    logs: paginatedLogs,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    }
  };
}

/**
 * JSON形式でログを返却
 * 
 * @param {Object} res - Vercel レスポンス
 * @param {Array} logs - 監査ログエントリの配列
 * @param {Object} params - クエリパラメータ
 */
function respondWithJson(res, logs, params) {
  // フィルタリング
  const filters = buildFilters(params);
  const filteredLogs = filterLogs(logs, filters);

  // ページネーション
  const limit = Math.min(
    parseInt(params.limit || String(DEFAULT_LIMIT), 10),
    MAX_LIMIT
  );
  const offset = parseInt(params.offset || '0', 10);

  const { logs: paginatedLogs, pagination } = paginateLogs(filteredLogs, limit, offset);

  // 統計情報を計算
  const statistics = calculateLogStatistics(filteredLogs);

  // JSON レスポンス
  res.status(200).json({
    success: true,
    logs: paginatedLogs,
    statistics,
    pagination
  });
}

/**
 * CSV形式でログをダウンロード
 * 
 * @param {Object} res - Vercel レスポンス
 * @param {Array} logs - 監査ログエントリの配列
 * @param {Object} params - クエリパラメータ
 */
function respondWithCsv(res, logs, params) {
  // フィルタリング
  const filters = buildFilters(params);
  const filteredLogs = filterLogs(logs, filters);

  // CSV ファイル名を生成
  const filename = generateCsvFilename(
    'audit-logs',
    filters.startDate,
    filters.endDate
  );

  // CSV データを生成
  const csvBuffer = generateCsvBuffer(filteredLogs, {
    includeHeader: true,
    dateFormat: 'readable',
    encoding: 'utf8'
  });

  // レスポンスヘッダーを設定
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', csvBuffer.length);

  // CSV データを送信
  res.status(200).send(csvBuffer);
}

/**
 * エラーレスポンス
 * 
 * @param {Object} res - Vercel レスポンス
 * @param {number} statusCode - HTTPステータスコード
 * @param {string} message - エラーメッセージ
 */
function respondWithError(res, statusCode, message) {
  res.status(statusCode).json({
    success: false,
    error: message
  });
}

/**
 * CORS ヘッダーの設定
 * 
 * @param {Object} res - Vercel レスポンス
 */
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * メインハンドラー
 * 
 * @param {Object} req - Vercel リクエスト
 * @param {Object} res - Vercel レスポンス
 */
module.exports = async function handler(req, res) {
  // CORS ヘッダーを設定
  setCorsHeaders(res);

  // OPTIONS リクエスト（プリフライト）の処理
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // GET リクエストのみ許可
  if (req.method !== 'GET') {
    respondWithError(res, 405, `メソッド ${req.method} はサポートされていません`);
    return;
  }

  // JWT 認証チェック
  const isAuthenticated = requireAuth(req, res);
  if (!isAuthenticated) {
    return; // requireAuth が既にレスポンスを返している
  }

  try {
    // クエリパラメータを解析
    const params = parseQueryParams(req.query);

    // 監査ログを取得
    const logs = await fetchAuditLogs(params.parsedDays);

    // format パラメータに応じてレスポンス
    if (params.format === 'csv') {
      respondWithCsv(res, logs, params);
    } else {
      respondWithJson(res, logs, params);
    }

  } catch (error) {
    console.error('ログ管理API エラー:', error);
    respondWithError(res, 500, 'サーバーエラーが発生しました');
  }
};

/**
 * ログ管理APIの使用例
 * 
 * JSON形式:
 * GET /api/admin/logs?format=json&days=7&limit=50
 * 
 * CSV形式:
 * GET /api/admin/logs?format=csv&days=30&event=upload
 * 
 * フィルター付き:
 * GET /api/admin/logs?format=json&startDate=2025-11-01&endDate=2025-11-07&actor=user@example.com
 */
