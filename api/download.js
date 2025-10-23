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

    // AVスキャン結果の確認（将来の拡張用）
    if (metadata.avScanResult && !metadata.avScanResult.clean && !metadata.avScanResult.skipped) {
      // 将来的にウイルスが検出されたファイルへのアクセスを防ぐ
      return res.status(403).json({ error: 'このファイルはダウンロードできません' });
    }

    // ファイル本体を取得
    const fileBuffer = await kv.get(`file:${id}`);
    
    if (!fileBuffer) {
      return res.status(404).json({ error: 'ファイルデータが見つかりません' });
    }

    // バッファーに変換
    const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);

    // ヘッダー設定
    res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(metadata.originalName)}"`);
    res.setHeader('Content-Length', buffer.length);

    // ファイル送信
    return res.status(200).send(buffer);

  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({ 
      error: 'ダウンロード中にエラーが発生しました',
      details: error.message 
    });
  }
}