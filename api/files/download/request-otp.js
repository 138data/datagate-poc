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
  
  // ローカル部分の最初の1文字のみ表示
  const masked = localPart.length > 0 
    ? localPart[0] + '***'
    : '***';
  
  return `${masked}@${domain}`;
}

export default async function handler(request) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // CORS プリフライト
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  // POST のみ許可
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, message: 'POST メソッドのみ許可されています' }),
      { status: 405, headers }
    );
  }

  try {
    const body = await request.json();
    const { fileId } = body;

    // fileId のみ必須（email は不要）
    if (!fileId) {
      return new Response(
        JSON.stringify({ success: false, message: 'fileId が必要です' }),
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

    // 失効チェック
    if (metadata.revokedAt) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'このファイルは送信者により失効されました' 
        }),
        { status: 403, headers }
      );
    }

    // metadata.recipient 宛てに OTP 送信
    const result = await sendOTPEmail({
      to: metadata.recipient,
      fileId,
      fileName: metadata.fileName,
      otp: metadata.otp
    });

    if (result.success) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: '認証コードを送信しました',
          maskedEmail: maskEmail(metadata.recipient)
        }),
        { status: 200, headers }
      );
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: '認証コードの送信に失敗しました' 
        }),
        { status: 500, headers }
      );
    }
  } catch (error) {
    console.error('Error in request-otp handler:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'サーバーエラーが発生しました' 
      }),
      { status: 500, headers }
    );
  }
}
