// api/download.js
// ファイルダウンロードAPI（Phase 21対応・ハードニング適用版）

const { createClient } = require('@vercel/kv');

// Vercel KV クライアント初期化
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

module.exports = async function handler(req, res) {
  // CORSヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONSリクエスト対応
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GETメソッド：ファイル情報取得
  if (req.method === 'GET') {
    try {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'ファイルIDが必要です' });
      }

      // KVからファイルデータを取得
      const fileDataRaw = await kv.get(`file:${id}`);

      if (!fileDataRaw) {
        return res.status(404).json({ error: 'ファイルが見つかりません' });
      }

      // データの型を確認してパース
      let fileData;
      if (typeof fileDataRaw === 'string') {
        fileData = JSON.parse(fileDataRaw);
      } else {
        fileData = fileDataRaw;
      }

      // ファイル情報をレスポンス（OTPは含めない）
      return res.status(200).json({
        success: true,
        fileName: fileData.fileName,
        fileSize: fileData.fileSize,
        compressedSize: fileData.compressedSize || fileData.fileSize,
        compressed: fileData.compressed || false,
        uploadTime: fileData.uploadTime,
        expiryTime: fileData.expiryTime,
        remainingDownloads: fileData.remainingDownloads || 5,
        storageType: 'vercel-kv',
      });

    } catch (error) {
      console.error('ファイル情報取得エラー:', error);
      return res.status(500).json({ 
        error: 'ファイル情報の取得に失敗しました',
        details: error.message 
      });
    }
  }

  // POSTメソッド：ファイルダウンロード（クエリでIDを受け取る）
  if (req.method === 'POST') {
    try {
      // IDはクエリパラメータから取得
      const { id } = req.query;
      
      // OTPはボディから取得
      let otp;
      if (req.body && typeof req.body === 'object') {
        otp = req.body.otp;
      } else if (req.body && typeof req.body === 'string') {
        try {
          const parsed = JSON.parse(req.body);
          otp = parsed.otp;
        } catch (e) {
          return res.status(400).json({ error: 'リクエストボディが不正です' });
        }
      } else {
        return res.status(400).json({ error: 'OTPが必要です' });
      }

      if (!id) {
        return res.status(400).json({ error: 'ファイルIDが必要です' });
      }

      if (!otp) {
        return res.status(400).json({ error: 'OTPが必要です' });
      }

      // KVからファイルデータを取得
      const fileDataRaw = await kv.get(`file:${id}`);

      if (!fileDataRaw) {
        return res.status(404).json({ error: 'ファイルが見つかりません' });
      }

      // データの型を確認してパース
      let fileData;
      if (typeof fileDataRaw === 'string') {
        fileData = JSON.parse(fileDataRaw);
      } else {
        fileData = fileDataRaw;
      }

      // OTP検証
      if (fileData.otp !== otp) {
        return res.status(403).json({ error: 'OTPが正しくありません' });
      }

      // 有効期限チェック
      const now = new Date();
      const expiryTime = new Date(fileData.expiryTime);
      if (now > expiryTime) {
        // 期限切れファイルを削除
        await kv.del(`file:${id}`);
        return res.status(410).json({ error: 'ファイルの有効期限が切れています' });
      }

      // ダウンロード回数チェック
      if (fileData.remainingDownloads <= 0) {
        // ダウンロード上限に達したファイルを削除
        await kv.del(`file:${id}`);
        return res.status(410).json({ error: 'ダウンロード回数の上限に達しました' });
      }

      // base64からBufferに変換
      let fileBuffer = Buffer.from(fileData.fileBuffer, 'base64');

      // 圧縮されている場合は解凍
      if (fileData.compressed) {
        try {
          const zlib = require('zlib');
          const { promisify } = require('util');
          const gunzip = promisify(zlib.gunzip);
          
          fileBuffer = await gunzip(fileBuffer);
          
          console.log(`解凍実施: ${fileData.fileName}`);
          console.log(`圧縮サイズ: ${fileData.compressedSize} bytes`);
          console.log(`元のサイズ: ${fileData.fileSize} bytes`);
        } catch (decompressError) {
          console.error('解凍エラー:', decompressError);
          return res.status(500).json({ 
            error: 'ファイルの解凍に失敗しました',
            details: decompressError.message 
          });
        }
      }

      // ダウンロード回数を減らす
      fileData.remainingDownloads -= 1;

      // 残りダウンロード回数が0になったら削除、そうでなければ更新
      if (fileData.remainingDownloads <= 0) {
        await kv.del(`file:${id}`);
        console.log(`ファイル削除（ダウンロード上限）: ${fileData.fileName}`);
      } else {
        // TTLを保持したまま更新（元のTTLを計算）
        const uploadTime = new Date(fileData.uploadTime);
        const expiryTime = new Date(fileData.expiryTime);
        const remainingTTL = Math.floor((expiryTime - now) / 1000);
        
        if (remainingTTL > 0) {
          await kv.set(`file:${id}`, fileData, { ex: remainingTTL });
          console.log(`ダウンロード回数更新: ${fileData.fileName} (残り${fileData.remainingDownloads}回)`);
        }
      }

      // ファイル送信
      res.setHeader('Content-Type', fileData.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileData.fileName)}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      
      return res.status(200).send(fileBuffer);

    } catch (error) {
      console.error('ダウンロードエラー:', error);
      return res.status(500).json({ 
        error: 'ダウンロードに失敗しました',
        details: error.message 
      });
    }
  }

  // その他のメソッドは拒否
  return res.status(405).json({ error: 'Method not allowed' });
};
