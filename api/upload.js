// api/upload.js - 完全版（Part 1/2）

import { kv } from '@vercel/kv';
import { randomBytes } from 'crypto';
import { encryptFile, generateOTP } from '../lib/crypto.js';
import { sendDownloadLinkEmail, sendFileAsAttachment } from './email-service.js';
import { getEnvironmentConfig, canUseDirectAttach } from './environment.js';
import { saveAuditLog } from './audit-log.js';

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

/**
 * ファイルアップロードAPI
 */
export default async function handler(req, res) {
  // CORS設定
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

    // multipart/form-data のパース
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

    // ファイルID生成
    const fileId = randomBytes(16).toString('hex');
    
    // OTP生成（6桁数値）
    const otp = generateOTP();
    
    // 有効期限（7日後）
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // ファイル暗号化
    console.log('[Upload] Encrypting file...');
    const encryptedData = encryptFile(file.fileContent, fileId, otp);

    // メタデータ
    const metadata = {
      fileName: file.fileName,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
      uploadedAt: new Date().toISOString(),
      expiresAt: expiresAt,
      downloadCount: 0,
      maxDownloads: 3,
      otp: otp
    };

    // KVに保存
    console.log('[Upload] Saving to KV...');
    await kv.set(`file:${fileId}:meta`, JSON.stringify(metadata), {
      ex: 7 * 24 * 60 * 60 // 7日間
    });

    await kv.set(`file:${fileId}:data`, encryptedData.encryptedContent, {
      ex: 7 * 24 * 60 * 60 // 7日間
    });

    console.log('[Upload] File saved successfully:', fileId);

    // ダウンロードURL生成
    const baseUrl = `https://${req.headers.host}`;
    const downloadUrl = `${baseUrl}/download.html?id=${fileId}`;

    // 応答の基本構造
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
      
      // 添付直送判定
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
        // リンク送付モード（フォールバック含む）
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

      // 監査ログ保存
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

      // 応答に送信情報を追加
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
      // メール送信なし
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
      details: error.message
    });
  }
}

/**
 * multipart/form-data をパース
 */
async function parseMultipartFormData(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';
        const boundary = contentType.split('boundary=')[1];
        
        if (!boundary) {
          throw new Error('No boundary found in Content-Type');
        }
        
        const parts = parseMultipart(buffer, boundary);
        
        let file = null;
        const fields = {};
        
        for (const part of parts) {
          if (part.filename) {
            file = {
              fileName: part.filename,
              fileContent: part.data,
              fileSize: part.data.length,
              mimeType: part.contentType || 'application/octet-stream'
            };
          } else if (part.name) {
            fields[part.name] = part.data.toString('utf-8');
          }
        }
        
        resolve({ file, fields });
      } catch (error) {
        reject(error);
      }
    });
    
    req.on('error', reject);
  });
}

/**
 * マルチパートデータをパース
 */
function parseMultipart(buffer, boundary) {
  const parts = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const endBoundaryBuffer = Buffer.from(`--${boundary}--`);
  
  let start = 0;
  
  while (true) {
    const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
    
    if (boundaryIndex === -1) break;
    
    const nextBoundaryIndex = buffer.indexOf(boundaryBuffer, boundaryIndex + boundaryBuffer.length);
    const endBoundaryIndex = buffer.indexOf(endBoundaryBuffer, boundaryIndex);
    
    let end;
    if (nextBoundaryIndex === -1 || (endBoundaryIndex !== -1 && endBoundaryIndex < nextBoundaryIndex)) {
      end = endBoundaryIndex !== -1 ? endBoundaryIndex : buffer.length;
    } else {
      end = nextBoundaryIndex;
    }
    
    if (end > boundaryIndex + boundaryBuffer.length) {
      const partBuffer = buffer.slice(boundaryIndex + boundaryBuffer.length, end);
      const part = parsePart(partBuffer);
      if (part) {
        parts.push(part);
      }
    }
    
    start = end;
    
    if (endBoundaryIndex !== -1 && endBoundaryIndex < start + boundaryBuffer.length) {
      break;
    }
  }
  
  return parts;
}

/**
 * 個別パートをパース
 */
function parsePart(buffer) {
  const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'));
  
  if (headerEnd === -1) return null;
  
  const headerBuffer = buffer.slice(0, headerEnd);
  const dataBuffer = buffer.slice(headerEnd + 4);
  
  const headers = headerBuffer.toString('utf-8');
  
  const contentDisposition = headers.match(/Content-Disposition: (.+)/i);
  if (!contentDisposition) return null;
  
  const nameMatch = contentDisposition[1].match(/name="([^"]+)"/);
  const filenameMatch = contentDisposition[1].match(/filename="([^"]+)"/);
  
  const contentTypeMatch = headers.match(/Content-Type: (.+)/i);
  
  const trimmedData = dataBuffer.slice(0, dataBuffer.length - 2);
  
  return {
    name: nameMatch ? nameMatch[1] : null,
    filename: filenameMatch ? filenameMatch[1] : null,
    contentType: contentTypeMatch ? contentTypeMatch[1].trim() : null,
    data: trimmedData
  };
}