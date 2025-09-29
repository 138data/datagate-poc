const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

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
        return res.status(405).json({ success: false, error: 'Method not allowed' });
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
        const bodyString = buffer.toString();
        
        // multipart/form-dataから情報を抽出
        let fileName = 'uploaded-file';
        let fileData = buffer;
        let mimeType = 'application/octet-stream';
        
        // ファイル名を探す
        const filenameMatch = bodyString.match(/filename="([^"]+)"/);
        if (filenameMatch) {
            fileName = filenameMatch[1];
            
            // 拡張子からMIMEタイプを判定
            const ext = fileName.split('.').pop().toLowerCase();
            const mimeTypes = {
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'gif': 'image/gif',
                'pdf': 'application/pdf',
                'doc': 'application/msword',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'txt': 'text/plain',
                'zip': 'application/zip'
            };
            mimeType = mimeTypes[ext] || 'application/octet-stream';
        }
        
        // バウンダリーを見つけてファイルデータを抽出
        const boundary = req.headers['content-type']?.split('boundary=')[1];
        if (boundary) {
            const parts = bodyString.split(`--${boundary}`);
            for (const part of parts) {
                if (part.includes('Content-Disposition') && part.includes('filename=')) {
                    const dataStart = part.indexOf('\r\n\r\n') + 4;
                    const dataEnd = part.lastIndexOf('\r\n');
                    if (dataStart > 3 && dataEnd > dataStart) {
                        const startIndex = bodyString.indexOf(part) + dataStart;
                        const endIndex = bodyString.indexOf(part) + dataEnd;
                        fileData = buffer.slice(startIndex, endIndex);
                        break;
                    }
                }
            }
        }
        
        const fileId = crypto.randomBytes(16).toString('hex');
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        const fileInfo = {
            fileName: fileName,  // 元のファイル名を保存！
            fileSize: fileData.length,
            mimeType: mimeType,  // MIMEタイプも保存！
            otp: otp,
            uploadTime: new Date().toISOString(),
            downloadCount: 0,
            maxDownloads: 3
        };
        
        // Redisに保存
        await redis.set(`file:${fileId}:meta`, JSON.stringify(fileInfo), { ex: 7 * 24 * 60 * 60 });
        await redis.set(`file:${fileId}:data`, fileData.toString('base64'), { ex: 7 * 24 * 60 * 60 });
        
        console.log(`Uploaded: ${fileName} as ${fileId}`);
        
        return res.status(200).json({
            success: true,
            fileId: fileId,
            downloadLink: `https://datagate-poc.vercel.app/download.html?id=${fileId}`,
            otp: otp,
            fileName: fileName,
            fileSize: fileData.length
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
