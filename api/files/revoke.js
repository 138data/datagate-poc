/**
 * ファイル失効API
 * 
 * PUT /api/files/revoke
 *   - 送信者専用: manageToken を使ってファイルを失効
 *   - Body: { fileId: string, token: string }
 */
import { kv } from '@vercel/kv';
import { saveAuditLog } from '../../lib/audit-log.js';

export default async function handler(request) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // CORS プリフライト
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  // PUT のみ許可
  if (request.method !== 'PUT') {
    return new Response(
      JSON.stringify({ success: false, message: 'PUT メソッドのみ許可されています' }),
      { status: 405, headers }
    );
  }

  try {
    const body = await request.json();
    const { fileId, token } = body;

    // 必須パラメータチェック
    if (!fileId || !token) {
      return new Response(
        JSON.stringify({ success: false, message: 'fileId と token が必要です' }),
        { status: 400, headers }
      );
    }

    // メタデータ取得
    const metadataJson = await kv.get(`file:${fileId}:meta`);

    if (!metadataJson) {
      return new Response(
        JSON.stringify({ success: false, message: 'ファイルが見つかりません' }),
        { status: 404, headers }
      );
    }

    const metadata = typeof metadataJson === 'string' 
      ? JSON.parse(metadataJson) 
      : metadataJson;

    // トークン検証
    if (metadata.manageToken !== token) {
      // 監査ログ（不正なトークン試行）
      await saveAuditLog({
        event: 'revoke_failed',
        fileId,
        fileName: metadata.fileName,
        reason: 'invalid_token',
        size: metadata.fileSize,
      });

      return new Response(
        JSON.stringify({ success: false, message: '無効なトークンです' }),
        { status: 403, headers }
      );
    }

    // 既に失効済み
    if (metadata.revokedAt) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: '既に失効済みです',
          revokedAt: metadata.revokedAt
        }),
        { status: 200, headers }
      );
    }

    // 失効処理
    metadata.revokedAt = new Date().toISOString();
    
    // メタデータを更新（TTLはそのまま）
    await kv.set(`file:${fileId}:meta`, JSON.stringify(metadata));

    // 監査ログ
    await saveAuditLog({
      event: 'file_revoked',
      fileId,
      fileName: metadata.fileName,
      recipient: metadata.recipient,
      size: metadata.fileSize,
      revokedAt: metadata.revokedAt,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'ファイルを失効しました',
        revokedAt: metadata.revokedAt
      }),
      { status: 200, headers }
    );
  } catch (error) {
    console.error('Error in revoke handler:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'サーバーエラーが発生しました' 
      }),
      { status: 500, headers }
    );
  }
}
