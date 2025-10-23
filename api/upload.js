import formidable from 'formidable';
import { createReadStream, promises as fs } from 'fs';
import { randomBytes } from 'crypto';
import { kv } from '@vercel/kv';

export const config = {
  api: {
    bodyParser: false,
  },
};

function generateOTP() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let otp = '';
  const randomBytesArray = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    otp += chars[randomBytesArray[i] % chars.length];
  }
  return otp;
}

async function performAVScan(fileBuffer, fileName) {
  // AV機能の仕込み（現在は無効）
  const enableAVScan = process.env.ENABLE_AV_SCAN === 'true';
  
  if (!enableAVScan) {
    // AV無効時は常にクリーンと判定
    return { clean: true, skipped: true };
  }
  
  // 将来的なAVサービス連携用のコード（現在は実行されない）
  const avServiceUrl = process.env.AV_SERVICE_URL;
  const avApiKey = process.env.AV_API_KEY;
  
  if (!avServiceUrl || !avApiKey) {
    console.warn('AV service not configured');
    return { clean: true, skipped: true };
  }
  
  // 将来のAVサービスAPI呼び出し用のプレースホルダー
  try {
    // const response = await fetch(avServiceUrl, {...});
    // return response.json();
    return { clean: true };
  } catch (error) {
    console.error('AV scan failed:', error);
    return { clean: true, error: true };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'),
  });

  try {
    const [fields, files] = await form.parse(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    
    if (!file) {
      return res.status(400).json({ error: 'ファイルが選択されていません' });
    }

    // ファイル読み込み
    const fileBuffer = await fs.readFile(file.filepath);
    
    // AV仕込み（現在は無効で影響なし）
    const avResult = await performAVScan(fileBuffer, file.originalFilename);
    
    if (!avResult.clean && !avResult.skipped) {
      // 将来的にウイルスが検出された場合の処理
      await fs.unlink(file.filepath);
      return res.status(400).json({ error: 'セキュリティチェックに失敗しました' });
    }

    // ファイルIDとOTP生成
    const fileId = randomBytes(16).toString('hex');
    const otp = generateOTP();

    // KVに保存
    const metadata = {
      originalName: file.originalFilename || 'unknown',
      size: file.size,
      mimeType: file.mimetype || 'application/octet-stream',
      uploadedAt: new Date().toISOString(),
      otp: otp,
      avScanResult: avResult, // AV結果を記録（将来の参照用）
    };

    // ファイル本体とメタデータを保存
    await kv.set(`file:${fileId}`, fileBuffer, { ex: 7 * 24 * 60 * 60 });
    await kv.set(`meta:${fileId}`, metadata, { ex: 7 * 24 * 60 * 60 });

    // 一時ファイル削除
    await fs.unlink(file.filepath);

    return res.status(200).json({
      success: true,
      fileId: fileId,
      otp: otp,
      message: 'ファイルが正常にアップロードされました',
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ 
      error: 'アップロード中にエラーが発生しました',
      details: error.message 
    });
  }
}