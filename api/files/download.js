// api/files/download.js
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  try {
    console.log('=== Download Request Started ===');
    console.log('Method:', req.method);
    console.log('Query:', req.query);
    console.log('Body:', req.body);

    // パラメータ取得（GET/POST両対応）
    let fileId, otp, action;

    if (req.method === 'GET') {
      fileId = req.query.id;
      otp = req.query.otp;
      action = req.query.action;
    } else {
      const body = req.body || {};
      fileId = body.fileId || body.id || req.query.id;
      otp = body.otp || req.query.otp;
      action = body.action || req.query.action;
    }

    console.log('Parsed parameters:', { fileId, otp, action });

    // fileId検証
    if (!fileId) {
      console.error('Error: fileId is missing');
      return res.status(400).json({
        success: false,
        error: 'ファイルIDが指定されていません'
      });
    }

    // Vercel KVからメタデータ取得
    console.log('Fetching metadata from KV:', `file:${fileId}`);
    const metadata = await kv.get(`file:${fileId}`);

    if (!metadata) {
      console.error('Error: File not found in KV');
      return res.status(404).json({
        success: false,
        error: 'ファイルが見つかりません'
      });
    }

    console.log('Metadata found:', metadata);

    // verify action: メタデータのみ返す
    if (action === 'verify') {
      return res.status(200).json({
        success: true,
        file: {
          id: metadata.id,
          fileName: metadata.fileName,
          size: metadata.size,
          uploadedAt: metadata.uploadedAt,
          expiresAt: metadata.expiresAt
        }
      });
    }

    // OTP検証
    if (!otp) {
      console.error('Error: OTP is missing');
      return res.status(400).json({
        success: false,
        error: 'OTPが指定されていません'
      });
    }

    if (otp !== metadata.otp) {
      console.error('Error: Invalid OTP');
      return res.status(403).json({
        success: false,
        error: 'OTPが正しくありません'
      });
    }

    console.log('OTP verified successfully');

    // 有効期限チェック
    const now = new Date();
    const expiresAt = new Date(metadata.expiresAt);

    if (now > expiresAt) {
      console.error('Error: File expired');
      return res.status(410).json({
        success: false,
        error: 'ファイルの有効期限が切れています'
      });
    }

    // Vercel KVからファイルデータ取得
    console.log('Fetching file data from KV:', `filedata:${fileId}`);
    const base64Data = await kv.get(`filedata:${fileId}`);

    if (!base64Data) {
      console.error('Error: File data not found in KV');
      return res.status(404).json({
        success: false,
        error: 'ファイルデータが見つかりません'
      });
    }

    // Base64デコード
    const fileBuffer = Buffer.from(base64Data, 'base64');
    console.log('File data decoded, size:', fileBuffer.length);

    // レスポンス返却
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(metadata.fileName)}"`);
    res.setHeader('Content-Length', fileBuffer.length);

    console.log('=== Download Response Sent ===');
    return res.status(200).send(fileBuffer);

  } catch (error) {
    console.error('=== Download Error ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    return res.status(500).json({
      success: false,
      error: 'ダウンロード処理中にエラーが発生しました',
      details: error.message
    });
  }
}