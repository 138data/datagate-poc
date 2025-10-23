import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, otp } = req.method === 'GET' ? req.query : req.body;

  if (!id) {
    return res.status(400).json({ error: 'ファイルIDが必要です' });
  }

  if (!otp) {
    return res.status(400).json({ error: 'OTPが必要です' });
  }

  try {
    // メタデータ取得
    const metadata = await kv.get(`meta:${id}`);
    
    if (!metadata) {
      return res.status(404).json({ error: 'ファイルが見つかりません' });
    }

    // OTP検証
    if (metadata.otp !== otp) {
      return res.status(403).json({ error: 'OTPが正しくありません' });
    }

    // ファイル本体を取得（base64として保存されている）
    const fileData = await kv.get(`file:${id}`);
    
    if (!fileData) {
      return res.status(404).json({ error: 'ファイルデータが見つかりません' });
    }

    // base64からBufferに変換
    const fileBuffer = Buffer.from(fileData, 'base64');

    // ヘッダー設定
    res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(metadata.originalName)}"`);
    res.setHeader('Content-Length', fileBuffer.length);

    // ファイル送信
    return res.status(200).send(fileBuffer);

  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({ 
      error: 'ダウンロード中にエラーが発生しました',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}