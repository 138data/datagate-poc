// api/test-upload-flow.js
import { canUseDirectAttach } from './environment.js';
import { saveAuditLog } from './audit-log.js';
import { sendDownloadLinkEmail, sendFileAsAttachment } from './email-service.js';

export default async function handler(req, res) {
  try {
    const directAttachCheck = canUseDirectAttach('datagate@138io.com', 1024);
    
    await saveAuditLog({
      event: 'test',
      actor: 'test',
      to: 'datagate@138io.com',
      mode: 'link',
      reason: 'test',
      fileId: 'test123',
      fileName: 'test.txt',
      fileSize: 1024,
      status: 'success'
    });
    
    res.status(200).json({
      success: true,
      tests: {
        canUseDirectAttach: directAttachCheck,
        auditLogSaved: true,
        emailFunctionsAvailable: {
          sendDownloadLinkEmail: typeof sendDownloadLinkEmail === 'function',
          sendFileAsAttachment: typeof sendFileAsAttachment === 'function'
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      phase: 'test-upload-flow'
    });
  }
}
