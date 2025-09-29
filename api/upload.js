const crypto = require('crypto');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    
    try {
        // Upstash Redis REST API 直接使用（SDKを使わない）
        const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
        const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
        
        const chunks = [];
        let totalSize = 0;
        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        
        await new Promise((resolve, reject) => {
            req.on('data', chunk => {
                totalSize += chunk.length;
                if (totalSize > MAX_FILE_SIZE) {
                    reject(new Error('File size exceeds 10MB'));
                }
                chunks.push(chunk);
            });
            req.on('end', resolve);
            req.on('error', reject);
        });
        
        const buffer = Buffer.concat(chunks);
        const bodyString = buffer.toString();
        const boundary = req.headers['content-type']?.split('boundary=')[1];
        
        let fileName = 'uploaded-file.dat';
        let fileData = buffer;
        let recipientEmail = 'test@example.com';
        
        if (boundary) {
            const parts = bodyString.split(`--${boundary}`);
            for (const part of parts) {
                if (part.includes('filename=')) {
                    const match = part.match(/filename="([^"]+)"/);
                    if (match) fileName = match[1];
                    
                    const headerEnd = part.indexOf('\r\n\r\n');
                    if (headerEnd > -1) {
                        const partStart = bodyString.indexOf(part);
                        const fileStart = partStart + headerEnd + 4;
                        const nextBoundary = bodyString.indexOf(`\r\n--${boundary}`, fileStart);
                        const fileEnd = nextBoundary > -1 ? nextBoundary : buffer.length;
                        fileData = buffer.slice(fileStart, fileEnd);
                    }
                }
                if (part.includes('name="recipientEmail"')) {
                    const match = part.match(/\r\n\r\n(.+)\r\n/);
                    if (match) recipientEmail = match[1].trim();
                }
            }
        }
        
        const fileId = crypto.randomBytes(16).toString('hex');
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        const fileInfo = {
            fileName: fileName,
            fileData: fileData.toString('base64'),
            fileSize: fileData.length,
            mimeType: 'application/octet-stream',
            otp: otp,
            recipientEmail: recipientEmail,
            uploadTime: new Date().toISOString(),
            downloadCount: 0,
            maxDownloads: 3
        };
        
        // Upstash REST API を直接呼び出し
        const key = `file:${fileId}`;
        const value = JSON.stringify(fileInfo);
        const ttl = 7 * 24 * 60 * 60; // 7 days
        
        const setResponse = await fetch(`${REDIS_URL}/set/${key}/${value}/ex/${ttl}`, {
            headers: {
                'Authorization': `Bearer ${REDIS_TOKEN}`
            }
        });
        
        if (!setResponse.ok) {
            throw new Error('Failed to save to Redis');
        }
        
        console.log(`[Upload] File saved: ${fileId} - ${fileName}`);
        
        return res.status(200).json({
            success: true,
            message: 'ファイルが正常にアップロードされました',
            fileId: fileId,
            downloadLink: `https://datagate-poc.vercel.app/download.html?id=${fileId}`,
            otp: otp,
            fileName: fileName,
            fileSize: fileData.length
        });
        
    } catch (error) {
        console.error('[Upload Error]', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Upload failed'
        });
    }
};
