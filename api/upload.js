const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

// Upstash Redis接続
const redis = new Redis({
    url: 'https://joint-whippet-14198.upstash.io',
    token: 'ATd2AAIncDJmMmE5NWE5OWE4YTE0NDg3OTAwMDQwNmJlZTBlMDkzZXAyMTQxOTg'
});

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
            error: 'Method not allowed'
        });
    }
    
    try {
        const chunks = [];
        let totalSize = 0;
        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        
        await new Promise((resolve, reject) => {
            req.on('data', chunk => {
                totalSize += chunk.length;
                if (totalSize > MAX_FILE_SIZE) {
                    reject(new Error('File too large'));
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', resolve);
            req.on('error', reject);
        });
        
        const buffer = Buffer.concat(chunks);
        const fileId = crypto.randomBytes(16).toString('hex');
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Redisに保存（重要！）
        const fileInfo = {
            fileName: 'uploaded-file.dat',
            fileSize: buffer.length,
            otp: otp,
            uploadTime: new Date().toISOString(),
            downloadCount: 0,
            maxDownloads: 3
        };
        
        // メタデータとファイルデータを別々に保存
        await redis.set(`file:${fileId}:meta`, JSON.stringify(fileInfo), {
            ex: 7 * 24 * 60 * 60 // 7日間
        });
        
        await redis.set(`file:${fileId}:data`, buffer.toString('base64'), {
            ex: 7 * 24 * 60 * 60
        });
        
        console.log(`Uploaded to Redis: ${fileId}`);
        
        return res.status(200).json({
            success: true,
            fileId: fileId,
            downloadLink: `https://datagate-poc.vercel.app/download.html?id=${fileId}`,
            otp: otp,
            fileName: fileInfo.fileName,
            fileSize: fileInfo.fileSize
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
