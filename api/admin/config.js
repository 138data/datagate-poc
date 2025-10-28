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
export default async function handler(request) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  };

  // OPTIONS リクエスト（プリフライト）
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...headers,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // 認証チェック
  const authPayload = authenticateRequest(request);
  if (!authPayload || authPayload.role !== 'admin') {
    return new Response(
      JSON.stringify({ success: false, message: 'Unauthorized' }),
      { status: 401, headers }
    );
  }

  try {
    // GET: 設定取得
    if (request.method === 'GET') {
      const config = await kv.get('config:notify').catch(() => null);

      // デフォルト設定
      const defaultConfig = {
        enabled: false,
        mode: 'first', // 'first' or 'every'
        fallbackEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@138data.com',
      };

      return new Response(
        JSON.stringify({
          success: true,
          config: config || defaultConfig,
        }),
        { status: 200, headers }
      );
    }

    // POST: 設定更新
    if (request.method === 'POST') {
      const body = await request.json();
      const { enabled, mode, fallbackEmail } = body;

      // バリデーション
      if (typeof enabled !== 'boolean') {
        return new Response(
          JSON.stringify({ success: false, message: 'enabled must be a boolean' }),
          { status: 400, headers }
        );
      }

      if (mode && !['first', 'every'].includes(mode)) {
        return new Response(
          JSON.stringify({ success: false, message: 'mode must be "first" or "every"' }),
          { status: 400, headers }
        );
      }

      if (fallbackEmail && !fallbackEmail.includes('@')) {
        return new Response(
          JSON.stringify({ success: false, message: 'fallbackEmail must be a valid email' }),
          { status: 400, headers }
        );
      }

      // 設定を保存（TTLなし = 永続）
      const newConfig = {
        enabled,
        mode: mode || 'first',
        fallbackEmail: fallbackEmail || process.env.SENDGRID_FROM_EMAIL || 'noreply@138data.com',
      };

      await kv.set('config:notify', JSON.stringify(newConfig));

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Configuration updated',
          config: newConfig,
        }),
        { status: 200, headers }
      );
    }

    // その他のメソッドは拒否
    return new Response(
      JSON.stringify({ success: false, message: 'Method not allowed' }),
      { status: 405, headers }
    );

  } catch (error) {
    console.error('Admin config API error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Internal server error',
      }),
      { status: 500, headers }
    );
  }
}
