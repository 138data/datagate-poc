// DataGate Shared Storage Module
const storage = new Map();

// テストファイルを初期登録
storage.set('test123', {
    fileName: 'test-file.pdf',
    fileData: Buffer.from('This is a test file'),
    fileSize: 19,
    mimeType: 'application/pdf',
    otp: '123456',
    recipientEmail: 'test@example.com',
    senderEmail: 'sender@example.com',
    senderName: 'Test Sender',
    subject: 'Test File',
    uploadTime: new Date().toISOString(),
    downloadCount: 0,
    maxDownloads: 100
});

module.exports = storage;
