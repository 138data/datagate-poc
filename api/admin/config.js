import { kv } from '@vercel/kv';
import { authenticateRequest } from '../../lib/auth.js';

/**
 * 開封通知設定API
 * GET /api/admin/config
 *   - 現在の設定を取得
 * POST /api/admin/config
 *   - 設定を更新
 *   - Body: { enabled: boolean, mode: string, fallbackEmail: string }
 */
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  // OPTIONS リクエスト（プリフライト）
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  // 認証チェック
  const authPayload = authenticateRequest(req);
  if (!authPayload || authPayload.role !== 'admin') {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  try {
    // GET: 設定取得
    if (req.method === 'GET') {
      const config = await kv.get('config:notify').catch(() => null);
      
      // デフォルト設定
      const defaultConfig = {
        enabled: false,
        mode: 'first', // 'first' or 'every'
        fallbackEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@138data.com',
      };

      return res.status(200).json({
        success: true,
        config: config || defaultConfig,
      });
    }

    // POST: 設定更新
    if (req.method === 'POST') {
      let body;
      if (typeof req.body === 'string') {
        body = JSON.parse(req.body);
      } else {
        body = req.body;
      }

      const { enabled, mode, fallbackEmail } = body;

      // バリデーション
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'enabled must be a boolean'
        });
      }

      if (mode && !['first', 'every'].includes(mode)) {
        return res.status(400).json({
          success: false,
          message: 'mode must be "first" or "every"'
        });
      }

      if (fallbackEmail && !fallbackEmail.includes('@')) {
        return res.status(400).json({
          success: false,
          message: 'fallbackEmail must be a valid email'
        });
      }

      // 設定を保存（TTLなし = 永続）
      const newConfig = {
        enabled,
        mode: mode || 'first',
        fallbackEmail: fallbackEmail || process.env.SENDGRID_FROM_EMAIL || 'noreply@138data.com',
      };

      await kv.set('config:notify', JSON.stringify(newConfig));

      return res.status(200).json({
        success: true,
        message: 'Configuration updated',
        config: newConfig,
      });
    }

    // その他のメソッドは拒否
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });

  } catch (error) {
    console.error('Admin config API error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};