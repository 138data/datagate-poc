const crypto = require('crypto');
const fileStorage = new Map();
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
        const fileId = crypto.randomBytes(32).toString('hex');
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        fileStorage.set(fileId, {
            fileName: 'uploaded-file.dat',
            fileData: buffer,
            fileSize: buffer.length,
            otp: otp,
            uploadTime: new Date().toISOString(),
            downloadCount: 0,
            maxDownloads: 3
        });
        
        module.exports.fileStorage = fileStorage;
        
        return res.status(200).json({
            success: true,
            message: 'File uploaded successfully',
            fileId: fileId,
            downloadLink: `/download/${fileId}`,
            otp: otp,
            fileName: 'uploaded-file.dat',
            fileSize: buffer.length
        });
        
    } catch (error) {
        console.error('[Upload Error]', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Upload failed'
        });
    }
};

module.exports.fileStorage = fileStorage;
