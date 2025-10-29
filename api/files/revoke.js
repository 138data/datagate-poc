/**
 * ファイル失効API
 *
 * PUT /api/files/revoke
 *   - 送信者専用: manageToken を使ってファイルを失効
 *   - Body: { fileId: string, token: string }
 */
import { kv } from '@vercel/kv';
import { saveAuditLog } from '../../lib/audit-log.js';

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // CORS プリフライト
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // PUT のみ許可
  if (req.method !== 'PUT') {
    return res.status(405).json({
      success: false,
      message: 'PUT メソッドのみ許可されています'
    });
  }

  try {
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    const { fileId, token } = body;

    // 必須パラメータチェック
    if (!fileId || !token) {
      return res.status(400).json({
        success: false,
        message: 'fileId と token が必要です'
      });
    }

    // メタデータ取得
    const metadataJson = await kv.get(`file:${fileId}:meta`);
    
    if (!metadataJson) {
      return res.status(404).json({
        success: false,
        message: 'ファイルが見つかりません'
      });
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

      return res.status(403).json({
        success: false,
        message: '無効なトークンです'
      });
    }

    // 既に失効済み
    if (metadata.revokedAt) {
      return res.status(200).json({
        success: true,
        message: '既に失効済みです',
        revokedAt: metadata.revokedAt
      });
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

    return res.status(200).json({
      success: true,
      message: 'ファイルを失効しました',
      revokedAt: metadata.revokedAt
    });

  } catch (error) {
    console.error('Error in revoke handler:', error);
    return res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました'
    });
  }
};