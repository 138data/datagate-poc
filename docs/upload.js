// api/upload.js - Phase 28 完全版

import { kv } from '@vercel/kv';
import { randomBytes } from 'crypto';
import { encryptFile, generateOTP } from '../lib/encryption.js';
import { sendDownloadLinkEmail, sendFileAsAttachment } from '../lib/email-service.js';
import { getEnvironmentConfig, canUseDirectAttach } from '../lib/environment.js';
import { saveAuditLog } from '../lib/audit-log.js';

let Busboy;

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

export default async function handler(req, res) {
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
    const envConfig = getEnvironmentConfig();
    console.log('[Upload] Environment:', envConfig.environment);
    console.log('[Upload] Email enabled:', envConfig.enableEmailSending);
    console.log('[Upload] Direct attach enabled:', envConfig.enableDirectAttach);

    const formData = await parseMultipartFormData(req);

    if (!formData.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { file, fields } = formData;
    const recipient = fields.recipient || null;

    console.log('[Upload] File received:', {
      fileName: file.fileName,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
      recipient: recipient
    });

    // ファイルID、OTP、有効期限を生成
    const fileId = randomBytes(16).toString('hex');
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // ファイルを暗号化
    console.log('[Upload] Encrypting file...');
    const encryptedData = encryptFile(file.fileContent);

    // メタデータを作成（salt, iv, authTag を含む）
    const metadata = {
      fileName: file.fileName,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
      uploadedAt: new Date().toISOString(),
      expiresAt: expiresAt,
      downloadCount: 0,
      maxDownloads: 3,
      otp: otp,
      salt: encryptedData.salt,
      iv: encryptedData.iv,
      authTag: encryptedData.authTag
    };

    // KVに保存
    console.log('[Upload] Saving to KV...');
    await kv.set(`file:${fileId}:meta`, JSON.stringify(metadata), {
      ex: 7 * 24 * 60 * 60
    });

    await kv.set(`file:${fileId}:data`, encryptedData.encryptedData, {
      ex: 7 * 24 * 60 * 60
    });

    console.log('[Upload] File saved successfully:', fileId);

    const baseUrl = `https://${req.headers.host}`;
    const downloadUrl = `${baseUrl}/download.html?id=${fileId}`;

    const response = {
      success: true,
      fileId: fileId,
      fileName: file.fileName,
      fileSize: file.fileSize,
      expiresAt: expiresAt,
      downloadUrl: downloadUrl,
      otp: otp
    };

    // メール送信処理
    if (recipient && envConfig.enableEmailSending) {
      console.log('[Upload] Processing email send...');

      const directAttachCheck = canUseDirectAttach(recipient, file.fileSize);
      console.log('[Upload] Direct attach check:', directAttachCheck);

      let emailResult;
      let sendMode;
      let sendReason = null;

      if (directAttachCheck.allowed) {
        // 添付直送モード
        console.log('[Upload] Sending file as attachment...');
        emailResult = await sendFileAsAttachment({
          to: recipient,
          fileName: file.fileName,
          fileContent: file.fileContent,
          mimeType: file.mimeType
        });
        sendMode = emailResult.success ? 'attach' : 'blocked';
        if (!emailResult.success) {
          sendReason = 'send_failed';
        }
      } else {
        // リンク送付モード（フォールバック）
        console.log('[Upload] Sending download link (reason:', directAttachCheck.reason, ')');
        emailResult = await sendDownloadLinkEmail({
          to: recipient,
          downloadUrl: downloadUrl,
          otp: otp,
          expiresAt: expiresAt
        });
        sendMode = emailResult.success ? 'link' : 'blocked';
        sendReason = directAttachCheck.reason;
        if (!emailResult.success) {
          sendReason = 'send_failed';
        }
      }

      // 監査ログを保存
      await saveAuditLog({
        event: 'file_send',
        actor: req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown',
        to: recipient,
        mode: sendMode,
        reason: sendReason,
        fileId: fileId,
        fileName: file.fileName,
        fileSize: file.fileSize,
        status: emailResult.success ? 'success' : 'failed'
      });

      response.email = {
        sent: true,
        success: emailResult.success,
        mode: sendMode,
        reason: sendReason,
        messageId: emailResult.messageId || null,
        statusCode: emailResult.statusCode || null,
        error: emailResult.error || null
      };

      console.log('[Upload] Email processing complete:', response.email);
    } else {
      response.email = {
        sent: false,
        reason: !recipient ? 'no_recipient' : 'email_disabled'
      };
      console.log('[Upload] Email not sent:', response.email.reason);
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('[Upload] Error:', error);
    return res.status(500).json({
      error: 'Upload failed',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * Multipart form data をパース（busboy使用）
 */
async function parseMultipartFormData(req) {
  if (!Busboy) {
    const busboyModule = await import('busboy');
    Busboy = busboyModule.default || busboyModule;
  }

  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers });
    const fields = {};
    let file = null;

    bb.on('file', (fieldname, fileStream, info) => {
      const { filename, encoding, mimeType } = info;
      const chunks = [];

      console.log('[Parse] File field detected:', { fieldname, filename, mimeType });

      fileStream.on('data', (chunk) => {
        chunks.push(chunk);
      });

      fileStream.on('end', () => {
        const fileBuffer = Buffer.concat(chunks);
        file = {
          fileName: filename,
          fileContent: fileBuffer,
          fileSize: fileBuffer.length,
          mimeType: mimeType || 'application/octet-stream'
        };
        console.log('[Parse] File received:', {
          fileName: file.fileName,
          fileSize: file.fileSize,
          mimeType: file.mimeType
        });
      });

      fileStream.on('error', (error) => {
        console.error('[Parse] File stream error:', error);
        reject(error);
      });
    });

    bb.on('field', (fieldname, value) => {
      fields[fieldname] = value;
      console.log('[Parse] Field received:', { fieldname, value });
    });

    bb.on('finish', () => {
      console.log('[Parse] Parsing complete');
      resolve({ file, fields });
    });

    bb.on('error', (error) => {
      console.error('[Parse] Busboy error:', error);
      reject(error);
    });

    req.pipe(bb);
  });
}
