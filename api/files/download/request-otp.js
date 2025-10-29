/**
 * OTP送信API（Vercelルーティング対応版）
 *
 * POST /api/files/download/request-otp
 *   - fileId のみで metadata.recipient 宛てに OTP を送信
 *   - Body: { fileId: string }  ← email は不要
 */
import { kv } from '@vercel/kv';
import { sendOTPEmail } from '../../../lib/email-service.js';

/**
 * メールアドレスのマスク処理
 * 例: datagate@138io.com → d***@138io.com
 */
function maskEmail(email) {
  if (!email || !email.includes('@')) {
    return '***';
  }
  const [localPart, domain] = email.split('@');
  const masked = localPart.length > 0 ? localPart[0] + '***' : '***';
  return `${masked}@${domain}`;
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // CORS プリフライト
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // POST のみ許可
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'POST メソッドのみ許可されています'
    });
  }

  try {
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    const { fileId } = body;

    // fileId のみ必須（email は不要）
    if (!fileId) {
      return res.status(400).json({
        success: false,
        message: 'fileId が必要です'
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

    // 失効チェック
    if (metadata.revokedAt) {
      return res.status(403).json({
        success: false,
        message: 'このファイルは送信者により失効されました'
      });
    }

    // metadata.recipient 宛てに OTP 送信
    const result = await sendOTPEmail({
      to: metadata.recipient,
      fileId,
      fileName: metadata.fileName,
      otp: metadata.otp
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: '認証コードを送信しました',
        maskedEmail: maskEmail(metadata.recipient)
      });
    } else {
      return res.status(500).json({
        success: false,
        message: '認証コードの送信に失敗しました'
      });
    }

  } catch (error) {
    console.error('Error in request-otp handler:', error);
    return res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました'
    });
  }
};