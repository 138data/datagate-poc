// api/files/download.js [完全版 - Part 1/2]
const { createClient } = require('@vercel/kv');

module.exports = async (req, res) => {
  // CORS設定
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  const { fileId, otp } = req.body;

  if (!fileId || !otp) {
    return res.status(400).json({ 
      success: false, 
      error: 'ファイルIDとOTPが必要です' 
    });
  }

  try {
    console.log('Download request:', { fileId, otp });

    // Vercel KV クライアントの初期化
    const kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });

    // ファイル情報の取得
    const fileKey = `file:${fileId}`;
    const fileData = await kv.hgetall(fileKey);

    if (!fileData) {
      console.error('File not found:', fileId);
      return res.status(404).json({ 
        success: false, 
        error: 'ファイルが見つかりません' 
      });
    }

    console.log('File metadata:', fileData);

    // OTP検証（大文字小文字を区別しない）
    if (fileData.otp.toUpperCase() !== otp.toUpperCase()) {
      console.error('OTP verification failed:', { 
        expected: fileData.otp, 
        received: otp 
      });
      return res.status(403).json({ 
        success: false, 
        error: 'OTPが正しくありません' 
      });
    }

    // 有効期限チェック
    if (fileData.expiresAt && new Date(fileData.expiresAt) < new Date()) {
      await kv.del(fileKey);
      await kv.del(`file-data:${fileId}`);
      return res.status(410).json({ 
        success: false, 
        error: 'このファイルは有効期限切れです' 
      });
    }
// api/files/download.js [完全版 - Part 2/2]
    // バイナリデータの取得
    const dataKey = `file-data:${fileId}`;
    const fileBuffer = await kv.get(dataKey);

    if (!fileBuffer) {
      console.error('File data not found:', fileId);
      return res.status(404).json({ 
        success: false, 
        error: 'ファイルデータが見つかりません' 
      });
    }

    // ファイル名の取得と処理
    let fileName = fileData.originalFileName || fileData.fileName || 'download';
    
    // ファイル名のサニタイズ（日本語を保持）
    const sanitizedFileName = fileName
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')  // 危険な文字を置換
      .replace(/^\.+/, '_')  // 先頭のドットを置換
      .replace(/\s+/g, '_')  // 空白をアンダースコアに
      .substring(0, 255);  // 最大長を制限

    // MIMEタイプの設定
    const mimeType = fileData.mimeType || 'application/octet-stream';

    console.log('Download success:', {
      fileId,
      fileName: sanitizedFileName,
      size: fileBuffer.length,
      mimeType
    });

    // レスポンスヘッダーの設定
    res.setHeader('Content-Type', mimeType);
    
    // ファイル名のエンコード（RFC 5987準拠）
    const asciiFileName = sanitizedFileName.replace(/[^\x00-\x7F]/g, '_');
    const utf8FileName = encodeURIComponent(sanitizedFileName);
    
    res.setHeader(
      'Content-Disposition', 
      `attachment; filename="${asciiFileName}"; filename*=UTF-8''${utf8FileName}`
    );
    
    res.setHeader('Content-Length', fileBuffer.length);
    
    // キャッシュ制御
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // バイナリデータを送信
    res.status(200).end(Buffer.from(fileBuffer));

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'ダウンロード処理中にエラーが発生しました',
      details: error.message 
    });
  }
};