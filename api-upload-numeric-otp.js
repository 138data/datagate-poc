// api/upload.js
// ファイルアップロードAPI - Vercel KV版
// 最終更新: 2025年10月21日
// OTP: 数字のみバージョン

import { kv } from '@vercel/kv';
import formidable from 'formidable';
import fs from 'fs';
import crypto from 'crypto';

// Vercelのボディパーサー制限を50MBに設定
export const config = {
  api: {
    bodyParser: false,
    responseLimit: '50mb'
  }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method Not Allowed' 
    });
  }

  try {
    const form = formidable({
      maxFileSize: 50 * 1024 * 1024,
      keepExtensions: true,
      multiples: false
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const file = files.file;
    if (!file || (Array.isArray(file) && file.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'ファイルがアップロードされていません'
      });
    }

    const uploadedFile = Array.isArray(file) ? file[0] : file;
    const fileName = uploadedFile.originalFilename || uploadedFile.newFilename;
    const fileSize = uploadedFile.size;
    const mimeType = uploadedFile.mimetype || 'application/octet-stream';
    const filePath = uploadedFile.filepath;

    console.log('[Upload] ファイル情報:', {
      fileName,
      fileSize,
      mimeType,
      filePath
    });

    const fileBuffer = fs.readFileSync(filePath);
    const fileBase64 = fileBuffer.toString('base64');
    const fileId = crypto.randomBytes(16).toString('hex');
    
    // ✅ 修正: OTPを6桁の数字のみに変更
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 100000-999999

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const fileData = {
      fileId,
      otp,
      fileName,
      fileSize,
      mimeType,
      data: fileBase64,
      uploadedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    await kv.set(`file:${fileId}`, fileData, {
      ex: 7 * 24 * 60 * 60
    });

    console.log('[Upload] KVに保存成功:', { fileId, otp });

    fs.unlinkSync(filePath);

    return res.status(200).json({
      success: true,
      fileId,
      otp,
      fileName,
      fileSize,
      expiresAt: expiresAt.toISOString(),
      downloadUrl: `/download.html?id=${fileId}`
    });

  } catch (error) {
    console.error('[Upload] エラー:', error);
    return res.status(500).json({
      success: false,
      error: 'ファイルのアップロードに失敗しました',
      details: error.message
    });
  }
}

// [完全版]
