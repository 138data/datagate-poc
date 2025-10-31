// DataGate Upload API - グローバルストレージ対応版
const crypto = require('crypto');

// グローバルストレージ（Vercelでの永続化のため）
global.fileStorage = global.fileStorage || new Map();

// テストファイルを事前に作成
if (global.fileStorage.size === 0) {
    const testId = 'test123';
    global.fileStorage.set(testId, {
        fileName: 'test-file.txt',
        fileData: Buffer.from('This is a test file content'),
        fileSize: 27,
        mimeType: 'text/plain',
        otp: '123456',
        uploadTime: new Date().toISOString(),
        downloadCount: 0,
        maxDownloads: 100
    });
    console.log('Test file created with ID:', testId);
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use POST.'
        });
    }
    
    try {
        const chunks = [];
        let totalSize = 0;
        
        await new Promise((resolve, reject) => {
            req.on('data', chunk => {
                totalSize += chunk.length;
                if (totalSize > MAX_FILE_SIZE) {
                    reject(new Error('File size exceeds 10MB limit'));
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', resolve);
            req.on('error', reject);
        });
        
        const buffer = Buffer.concat(chunks);
        const fileId = crypto.randomBytes(16).toString('hex'); // 短いIDに
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // グローバルストレージに保存
        global.fileStorage.set(fileId, {
            fileName: 'uploaded-file.dat',
            fileData: buffer,
            fileSize: buffer.length,
            mimeType: 'application/octet-stream',
            otp: otp,
            uploadTime: new Date().toISOString(),
            downloadCount: 0,
            maxDownloads: 3
        });
        
        console.log('File stored with ID:', fileId, 'Storage size:', global.fileStorage.size);
        
        const baseUrl = 'https://datagate-poc.vercel.app';
        const downloadPath = `/download.html?id=${fileId}`;
        const fullDownloadUrl = `${baseUrl}${downloadPath}`;
        
        return res.status(200).json({
            success: true,
            message: 'ファイルが正常にアップロードされました',
            fileId: fileId,
            downloadLink: fullDownloadUrl,
            otp: otp,
            fileName: 'uploaded-file.dat',
            fileSize: buffer.length,
            testLink: `${baseUrl}/download.html?id=test123` // テスト用リンク
        });
        
    } catch (error) {
        console.error('[Upload Error]', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Upload failed'
        });
    }
};
