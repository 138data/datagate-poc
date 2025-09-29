const crypto = require('crypto');

// グローバルストレージ（確実に共有）
if (!global.dataGateStorage) {
    global.dataGateStorage = new Map();
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
        const fileId = crypto.randomBytes(8).toString('hex');
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        global.dataGateStorage.set(fileId, {
            fileName: 'uploaded-file',
            fileData: buffer,
            otp: otp,
            downloadCount: 0,
            maxDownloads: 3
        });
        
        return res.status(200).json({
            success: true,
            fileId: fileId,
            downloadLink: `/download.html?id=${fileId}`,
            otp: otp
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
