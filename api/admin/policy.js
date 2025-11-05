/**
 * Policy Management API
 * Phase 43-Step 2: ポリシー管理API
 * 
 * エンドポイント:
 * - GET /api/admin/policy - ポリシー取得
 * - PUT /api/admin/policy - ポリシー更新
 * - POST /api/admin/policy?action=reset - ポリシーリセット
 * - GET /api/admin/policy?history=true - 変更履歴取得
 */

import jwt from 'jsonwebtoken';
import {
  getPolicy,
  updatePolicy,
  resetPolicy,
  getPolicyHistory,
  exportPolicy,
  importPolicy
} from '../../lib/policy-manager.js';

/**
 * JWT トークンの検証
 */
function verifyToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    throw new Error('Token required');
  }

  try {
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: '138datagate',
      audience: 'admin-dashboard'
    });
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

/**
 * CORS ヘッダーの設定
 */
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

/**
 * メインハンドラ
 */
export default async function handler(req, res) {
  setCorsHeaders(res);

  // OPTIONS リクエスト（プリフライト）
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // JWT 認証
  try {
    verifyToken(req);
  } catch (error) {
    return res.status(401).json({
      error: error.message === 'Token required' 
        ? 'Unauthorized: Token required' 
        : 'Invalid or expired token'
    });
  }

  // ルーティング
  try {
    if (req.method === 'GET') {
      return await handleGet(req, res);
    } else if (req.method === 'PUT') {
      return await handlePut(req, res);
    } else if (req.method === 'POST') {
      return await handlePost(req, res);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Policy API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

/**
 * GET ハンドラ
 * - クエリなし: 現在のポリシー取得
 * - ?history=true: 変更履歴取得
 * - ?export=true: ポリシーエクスポート
 */
async function handleGet(req, res) {
  const { history, export: exportFlag } = req.query;

  // 変更履歴取得
  if (history === 'true') {
    const histories = await getPolicyHistory(20);
    return res.status(200).json({
      success: true,
      histories
    });
  }

  // ポリシーエクスポート
  if (exportFlag === 'true') {
    const jsonString = await exportPolicy();
    return res.status(200).json({
      success: true,
      policy: JSON.parse(jsonString)
    });
  }

  // 通常のポリシー取得
  const policy = await getPolicy();
  return res.status(200).json({
    success: true,
    policy
  });
}

/**
 * PUT ハンドラ - ポリシー更新
 */
async function handlePut(req, res) {
  const updates = req.body;

  if (!updates || Object.keys(updates).length === 0) {
    return res.status(400).json({
      error: 'No updates provided'
    });
  }

  // 更新者情報を取得（JWTから）
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const decoded = jwt.decode(token);
  const updatedBy = decoded?.user || 'admin';

  try {
    const newPolicy = await updatePolicy(updates, updatedBy);
    return res.status(200).json({
      success: true,
      policy: newPolicy,
      message: 'Policy updated successfully'
    });
  } catch (error) {
    // バリデーションエラー
    if (error.message.startsWith('Validation failed')) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.message
      });
    }
    throw error;
  }
}

/**
 * POST ハンドラ
 * - ?action=reset: ポリシーリセット
 * - ?action=import: ポリシーインポート
 */
async function handlePost(req, res) {
  const { action } = req.query;

  // 更新者情報を取得
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const decoded = jwt.decode(token);
  const updatedBy = decoded?.user || 'admin';

  // ポリシーリセット
  if (action === 'reset') {
    const resetPolicyData = await resetPolicy(updatedBy);
    return res.status(200).json({
      success: true,
      policy: resetPolicyData,
      message: 'Policy reset to default values'
    });
  }

  // ポリシーインポート
  if (action === 'import') {
    const { jsonString } = req.body;

    if (!jsonString) {
      return res.status(400).json({
        error: 'JSON string required for import'
      });
    }

    try {
      const importedPolicy = await importPolicy(jsonString, updatedBy);
      return res.status(200).json({
        success: true,
        policy: importedPolicy,
        message: 'Policy imported successfully'
      });
    } catch (error) {
      return res.status(400).json({
        error: 'Import failed',
        message: error.message
      });
    }
  }

  return res.status(400).json({
    error: 'Invalid action',
    message: 'Supported actions: reset, import'
  });
}