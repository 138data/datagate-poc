import formidable from 'formidable';
import { promises as fs } from 'fs';
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Content-Typeを確認
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ 
        error: 'Invalid content type. Expected multipart/form-data' 
      });
    }

    const form = formidable({
      maxFileSize: 52428800, // 50MB
      keepExtensions: true,
      multiples: false
    });

    const [fields, files] = await form.parse(req);
    
    // ファイル取得（配列の場合は最初の要素）
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    
    if (!file) {
      return res.status(400).json({ error: 'ファイルが選択されていません' });
    }

    // ファイル読み込み
    const fileBuffer = await fs.readFile(file.filepath);
    
    // ファイルIDとOTP生成
    const fileId = randomBytes(16).toString('hex');
    const otp = generateOTP();

    // メタデータ作成
    const metadata = {
      originalName: file.originalFilename || 'unknown',
      size: file.size,
      mimeType: file.mimetype || 'application/octet-stream',
      uploadedAt: new Date().toISOString(),
      otp: otp,
      avScanResult: { clean: true, skipped: true } // Phase 22準備
    };

    // KVに保存
    await kv.set(`file:${fileId}`, fileBuffer.toString('base64'), { ex: 604800 }); // base64として保存
    await kv.set(`meta:${fileId}`, metadata, { ex: 604800 });

    // 一時ファイル削除
    try {
      await fs.unlink(file.filepath);
    } catch (e) {
      console.log('Temp file cleanup failed:', e);
    }

    return res.status(200).json({
      success: true,
      fileId: fileId,
      otp: otp,
      message: 'ファイルが正常にアップロードされました',
    });

  } catch (error) {
    console.error('Upload error details:', error);
    return res.status(500).json({ 
      error: 'アップロード中にエラーが発生しました',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}