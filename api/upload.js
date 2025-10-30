// api/upload.js - Vercel Blob対応版（非同期タイミング修正）
const { kv } = require('@vercel/kv');
const Busboy = require('busboy');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { encryptFile, generateOTP } = require('../lib/encryption');
const { sendEmail } = require('../lib/email-service');
const { canUseDirectAttach, DIRECT_ATTACH_MAX_SIZE } = require('../lib/environment');
const { uploadToBlob } = require('../lib/blob-storage');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // busboy 1.6.0 対応: Busboy を直接 new で初期化
    const bb = Busboy({ headers: req.headers });

    let fileBuffer = null;
    let fileName = '';
    let recipient = '';
    let fileProcessed = false;

    // Promise で file.on('end') の完了を待つ
    const filePromise = new Promise((resolve, reject) => {
      bb.on('file', (fieldname, file, info) => {
        fileName = Buffer.from(info.filename, 'latin1').toString('utf8');
        const chunks = [];

        file.on('data', (chunk) => {
          chunks.push(chunk);
        });

        file.on('end', () => {
          fileBuffer = Buffer.concat(chunks);
          fileProcessed = true;
          console.log('[INFO] File received:', fileName, fileBuffer.length, 'bytes');
          resolve();
        });

        file.on('error', (error) => {
          reject(error);
        });
      });
    });

    bb.on('field', (fieldname, value) => {
      if (fieldname === 'recipientEmail') {
        recipient = value;
      }
    });

    bb.on('finish', async () => {
      try {
        // ファイル処理の完了を待つ
        if (fileProcessed === false) {
          console.log('[INFO] Waiting for file processing to complete...');
          await filePromise;
        }

        if (!fileBuffer || !fileName) {
          return res.status(400).json({ error: 'ファイルが選択されていません' });
        }

        if (!recipient) {
          return res.status(400).json({ error: '受信者のメールアドレスが指定されていません' });
        }

        const fileId = uuidv4();
        const otp = generateOTP();

        console.log('[INFO] Encrypting file:', fileName);
        const encryptedData = encryptFile(fileBuffer, fileName);

        console.log('[INFO] Uploading to Blob:', fileName);
        console.log('[DEBUG] uploadToBlob args:', {
          fileId,
          bufferSize: encryptedData.encryptedBuffer.length,
          fileName
        });

        const blobResult = await uploadToBlob(fileId, encryptedData.encryptedBuffer, fileName);

        const metadata = {
          fileId,
          fileName,
          fileSize: fileBuffer.length,
          recipient,
          otp,
          salt: encryptedData.salt,
          iv: encryptedData.iv,
          blobUrl: blobResult.url,
          blobDownloadUrl: blobResult.downloadUrl,
          uploadedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          downloadCount: 0,
          maxDownloads: 3
        };

        console.log('[INFO] Saving metadata to KV:', fileId);
        await kv.set(`file:${fileId}:meta`, JSON.stringify(metadata), { ex: 7 * 24 * 60 * 60 });

        const downloadUrl = `${process.env.BASE_URL || 'https://datagate-poc.vercel.app'}/d?id=${fileId}`;

        console.log('[INFO] Sending email to:', recipient);
        const directAttach = canUseDirectAttach(recipient, fileBuffer.length);

        await sendEmail({
          to: recipient,
          fileName,
          fileSize: fileBuffer.length,
          downloadUrl,
          otp,
          mode: directAttach ? 'attach' : 'link',
          attachment: directAttach ? { buffer: fileBuffer, filename: fileName } : null
        });

        console.log('[INFO] Upload complete:', fileId);
        res.status(200).json({
          success: true,
          fileId,
          fileName,
          downloadUrl,
          expiresAt: metadata.expiresAt,
          mode: directAttach ? 'attach' : 'link'
        });

      } catch (error) {
        console.error('[ERROR] Upload processing failed:', error);
        res.status(500).json({
          error: 'アップロード処理中にエラーが発生しました',
          details: error.message
        });
      }
    });

    bb.on('error', (error) => {
      console.error('[ERROR] Busboy error:', error);
      res.status(500).json({
        error: 'ファイルアップロード中にエラーが発生しました',
        details: error.message
      });
    });

    req.pipe(bb);

  } catch (error) {
    console.error('[ERROR] Unexpected error:', error);
    res.status(500).json({
      error: 'サーバーエラーが発生しました',
      details: error.message
    });
  }
};