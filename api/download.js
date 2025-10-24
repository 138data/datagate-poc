// api/download.js
// 138DataGate - ファイルダウンロードAPI（Vercel KV対応版）

const kv = require('@vercel/kv');

/**
 * ファイルダウンロードAPI
 * 
 * GET /api/download?id={fileId}
 *   - メタ情報を返却（fileName, fileSize, uploadTime, remainingDownloads）
 * 
 * POST /api/download?id={fileId}
 *   - body: { otp }
 *   - OTP認証後、ファイルバイナリを返却
 */
export default async function handler(req, res) {
  const { method } = req;
  const { id } = req.query;

  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS対応
  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ファイルID必須チェック
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'ファイルIDが必要です'
    });
  }

  try {
    // KVからメタデータ取得
    const metadata = await kv.get(`file:${id}`);

    if (!metadata) {
      return res.status(404).json({
        success: false,
        error: 'ファイルが見つかりません'
      });
    }

    // 有効期限チェック
    if (new Date(metadata.expiresAt) < new Date()) {
      // 期限切れファイルは削除
      await kv.del(`file:${id}`);
      await kv.del(`otp:${id}`);
      
      return res.status(410).json({
        success: false,
        error: 'ファイルの有効期限が切れています'
      });
    }

    // GETリクエスト: メタ情報を返却
    if (method === 'GET') {
      return res.status(200).json({
        success: true,
        file: {
          fileName: metadata.fileName,
          fileSize: metadata.size,
          uploadTime: metadata.uploadedAt,
          remainingDownloads: metadata.remainingDownloads || 10,
          expiresAt: metadata.expiresAt
        }
      });
    }

    // POSTリクエスト: OTP認証 + ファイルダウンロード
    if (method === 'POST') {
      // リクエストボディ取得
      let body;
      try {
        if (req.body && typeof req.body === 'object') {
          body = req.body;
        } else {
          const rawBody = await getRawBody(req);
          body = JSON.parse(rawBody);
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'リクエストボディが不正です'
        });
      }

      const { otp } = body;

      if (!otp) {
        return res.status(400).json({
          success: false,
          error: 'OTPが必要です'
        });
      }

      // KVからOTP取得
      const storedOTP = await kv.get(`otp:${id}`);

      if (!storedOTP) {
        return res.status(404).json({
          success: false,
          error: 'OTPが見つかりません（有効期限切れの可能性があります）'
        });
      }

      // OTP検証（大文字小文字を区別しない）
      if (otp.toLowerCase() !== storedOTP.toLowerCase()) {
        return res.status(401).json({
          success: false,
          error: 'OTPが正しくありません'
        });
      }

      // ダウンロード回数チェック
      if (metadata.remainingDownloads <= 0) {
        // ダウンロード回数上限
        await kv.del(`file:${id}`);
        await kv.del(`otp:${id}`);

        return res.status(410).json({
          success: false,
          error: 'ダウンロード回数の上限に達しました'
        });
      }

      // ダウンロード回数を減らす
      metadata.remainingDownloads -= 1;

      // 残り回数が0なら削除、そうでなければ更新
      if (metadata.remainingDownloads <= 0) {
        await kv.del(`file:${id}`);
        await kv.del(`otp:${id}`);
      } else {
        await kv.set(`file:${id}`, metadata, { ex: 7 * 24 * 60 * 60 }); // 7日間
      }

      // ファイルバイナリ取得
      const fileBuffer = Buffer.from(metadata.data, 'base64');

      // ファイルダウンロードレスポンス
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(metadata.fileName)}"`);
      res.setHeader('Content-Length', fileBuffer.length);

      return res.status(200).send(fileBuffer);
    }

    // 未サポートのメソッド
    return res.status(405).json({
      success: false,
      error: 'サポートされていないメソッドです'
    });

  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({
      success: false,
      error: 'ファイルのダウンロードに失敗しました',
      details: error.message
    });
  }
}

/**
 * リクエストボディを生データとして取得
 */
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      resolve(data);
    });
    req.on('error', reject);
  });
}
