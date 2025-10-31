import { saveAuditLog, getAuditLogs } from './api/audit-log.js';

async function testAuditLog() {
  console.log('=== Audit Log Test ===\n');
  
  // テストログ保存
  const result = await saveAuditLog({
    event: 'file_send',
    actor: 'test@example.com',
    to: 'recipient@138io.com',
    mode: 'link',
    reason: null,
    fileId: 'test-file-123',
    fileName: 'test-document.pdf',
    fileSize: 1024000,
    status: 'success'
  });
  
  console.log('Save Result:', result);
  
  // ログ取得
  setTimeout(async () => {
    const logs = await getAuditLogs(10);
    console.log('\nRecent Logs:', logs);
  }, 1000);
}

testAuditLog();
