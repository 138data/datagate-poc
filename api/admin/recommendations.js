/**
 * Policy Recommendations API
 * Phase 43-Step 4: 統計ベース推奨値API
 * 
 * エンドポイント:
 * - GET /api/admin/recommendations?days=7 - 推奨値取得
 */

import jwt from 'jsonwebtoken';
import { getPolicyRecommendations } from '../../lib/policy-analytics.js';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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

  // GET のみ許可
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
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

  // 推奨値の取得
  try {
    const days = parseInt(req.query.days) || 7;
    
    // 日数のバリデーション（1-30日）
    if (days < 1 || days > 30) {
      return res.status(400).json({
        error: 'Invalid days parameter',
        message: 'Days must be between 1 and 30'
      });
    }

    const recommendations = await getPolicyRecommendations(days);
    
    return res.status(200).json(recommendations);

  } catch (error) {
    console.error('Recommendations API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}