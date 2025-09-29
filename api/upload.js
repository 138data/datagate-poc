const crypto = require('crypto');

// Vercel環境でのグローバルストレージ
if (!global.dataGateStorage) {
    global.dataGateStorage = new Map();
    // テストファイルを常に含める
    global.dataGateStorage.set('test123', {
        fileName: 'test-file.txt',
        fileData: Buffer.from('This is a test file content'),
        otp: '123456',
        downloadCount: 0,
        maxDownloads: 100
    });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    
    try {
        const chunks = [];
        let totalSize = 0;
        
        await new Promise((resolve, reject) => {
            req.on('data', chunk => {
                totalSize += chunk.length;
                if (totalSize > 10485760) reject(new Error('File too large'));
                chunks.push(chunk);
            });
            req.on('end', resolve);
        });
        
        const buffer = Buffer.concat(chunks);
        const bodyString = buffer.toString();
        
        // Parse multipart form data (simplified)
        let fileName = 'uploaded-file.dat';
        let fileData = buffer;
        
        const boundary = req.headers['content-type']?.split('boundary=')[1];
        if (boundary) {
            const parts = bodyString.split(`--${boundary}`);
            for (const part of parts) {
                if (part.includes('filename="')) {
                    const match = part.match(/filename="([^"]+)"/);
                    if (match) fileName = match[1];
                    
                    const dataStart = part.indexOf('\r\n\r\n') + 4;
                    const dataEnd = part.lastIndexOf('\r\n');
                    if (dataStart > 3 && dataEnd > dataStart) {
                        const startIndex = bodyString.indexOf(part) + dataStart;
                        const endIndex = bodyString.indexOf(part) + dataEnd;
                        fileData = buffer.slice(startIndex, endIndex);
                    }
                }
            }
        }
        
        const fileId = crypto.randomBytes(8).toString('hex'); // 短いIDに変更
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        const fileInfo = {
            fileName: fileName,
            fileData: fileData,
            otp: otp,
            downloadCount: 0,
            maxDownloads: 3,
            uploadTime: Date.now()
        };
        
        global.dataGateStorage.set(fileId, fileInfo);
        
        console.log(`[Upload] Stored file: ${fileId}, Total files: ${global.dataGateStorage.size}`);
        console.log(`[Upload] Available IDs: ${Array.from(global.dataGateStorage.keys()).join(', ')}`);
        
        return res.status(200).json({
            success: true,
            fileId: fileId,
            downloadLink: `/download.html?id=${fileId}`,
            otp: otp,
            fileName: fileName,
            message: 'File uploaded successfully',
            debug: {
                storageSize: global.dataGateStorage.size,
                availableIds: Array.from(global.dataGateStorage.keys())
            }
        });
    } catch (error) {
        console.error('[Upload Error]', error);
        return res.status(500).json({ error: error.message });
    }
};
