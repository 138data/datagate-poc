// api/upload.js - Vercel Blob対応版
const { kv } = require('@vercel/kv');
const busboy = require('busboy');
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
    const bb = busboy({ headers: req.headers });
    let fileBuffer = null;
    let fileName = '';
    let recipient = '';

    bb.on('file', (fieldname, file, info) => {
      fileName = Buffer.from(info.filename, 'latin1').toString('utf8');
      const chunks = [];

      file.on('data', (chunk) => {
        chunks.push(chunk);
      });

      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
        console.log('[INFO] File received:', fileName, fileBuffer.length, 'bytes');
      });
    });

    bb.on('field', (fieldname, value) => {
      if (fieldname === 'recipient') {
        recipient = value;
      }
    });

    bb.on('finish', async () => {
      try {
        if (!fileBuffer || !fileName || !recipient) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        // ファイルID生成
        const fileId = uuidv4();
        const otp = generateOTP();
        const manageToken = crypto.randomBytes(32).toString('hex');

        console.log('[INFO] Generated fileId:', fileId);
        console.log('[INFO] Generated OTP:', otp);

        // 暗号化
        const encryptedData = encryptFile(fileBuffer);
        console.log('[INFO] File encrypted');

        // Blob にアップロード
        const encryptedBuffer = encryptedData.encryptedData;
        const blobUrl = await uploadToBlob(fileId, encryptedBuffer, fileName);
        console.log('[INFO] Uploaded to Blob:', blobUrl);

        // メタデータ作成
        const now = new Date();
        const ttlSeconds = 7 * 24 * 60 * 60; // 7日間
        const metadata = {
          fileId,
          fileName,
          fileSize: fileBuffer.length,
          recipient,
          otp,
          uploadedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
          downloadCount: 0,
          maxDownloads: 3,
          manageToken,
          revokedAt: null,
          blobUrl,  // Blob URL を保存
          salt: encryptedData.salt,
          iv: encryptedData.iv,
          authTag: encryptedData.authTag
        };

        // メタデータを KV に保存
        await kv.set('file:' + fileId + ':meta', JSON.stringify(metadata), {
          ex: ttlSeconds
        });

        console.log('[INFO] Metadata saved to KV');

        // 管理URL生成
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['host'] || req.headers['x-forwarded-host'] || 'localhost';
        const manageUrl = protocol + '://' + host + '/manage.html?id=' + fileId + '&token=' + manageToken;
        
        // ダウンロードURL生成（メール送信前に必要）
        const downloadUrl = `${protocol}://${host}/download.html?fileId=${fileId}`;

        // 添付直送判定
        const shouldAttach = canUseDirectAttach(recipient, fileBuffer.length);

        // メール送信（新しい形式で呼び出し）
        const emailResult = await sendEmail(
          recipient,
          fileId,
          fileName,
          fileBuffer.length,
          downloadUrl,
          otp,
          'link'
        );

        console.log('[INFO] Email result:', emailResult);

        // レスポンス

        return res.status(200).json({
          success: true,
          fileId,
          downloadUrl,
          otp,
          fileName,
          fileSize: fileBuffer.length,
          manageUrl,
          email: emailResult
        });

      } catch (error) {
        console.error('[ERROR] Upload processing failed:', error);
        return res.status(500).json({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    bb.on('error', (error) => {
      console.error('[ERROR] Busboy error:', error);
      return res.status(500).json({ error: 'File upload failed' });
    });

    req.pipe(bb);

  } catch (error) {
    console.error('[ERROR] Upload handler error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

