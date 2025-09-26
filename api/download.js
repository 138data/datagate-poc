let fileStorage;

module.exports = async (req, res) => {
    if (!fileStorage) {
        try {
            const uploadModule = require('./upload');
            fileStorage = uploadModule.fileStorage || new Map();
        } catch (e) {
            fileStorage = new Map();
        }
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const { id } = req.query;
    
    if (!id) {
        return res.status(400).json({
            success: false,
            error: 'File ID is required'
        });
    }
    
    const fileInfo = fileStorage.get(id);
    
    if (!fileInfo) {
        return res.status(404).json({
            success: false,
            error: 'File not found'
        });
    }
    
    if (req.method === 'GET') {
        return res.status(200).json({
            success: true,
            exists: true,
            fileName: fileInfo.fileName,
            fileSize: fileInfo.fileSize,
            uploadTime: fileInfo.uploadTime,
            remainingDownloads: fileInfo.maxDownloads - fileInfo.downloadCount,
            requiresOTP: true
        });
    }
    
    if (req.method === 'POST') {
        let body = '';
        await new Promise((resolve) => {
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', resolve);
        });
        
        const data = JSON.parse(body);
        
        if (data.otp !== fileInfo.otp) {
            return res.status(401).json({
                success: false,
                error: 'Invalid OTP'
            });
        }
        
        if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
            return res.status(403).json({
                success: false,
                error: 'Download limit exceeded'
            });
        }
        
        fileInfo.downloadCount++;
        
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.fileName}"`);
        
        return res.status(200).send(fileInfo.fileData);
    }
    
    return res.status(405).json({
        success: false,
        error: 'Method not allowed'
    });
};
