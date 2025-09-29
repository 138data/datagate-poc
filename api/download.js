const { Redis } = require('@upstash/redis');

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ success: false, error: 'File ID required' });
    }
    
    try {
        const fileInfoJson = await redis.get(`file:${id}`);
        if (!fileInfoJson) {
            return res.status(404).json({ 
                success: false, 
                error: 'File not found or expired',
                hint: 'ファイルが見つからないか、有効期限が切れています'
            });
        }
        
        const fileInfo = JSON.parse(fileInfoJson);
        
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
                req.on('data', chunk => { body += chunk.toString(); });
                req.on('end', resolve);
            });
            
            const { otp } = JSON.parse(body);
            
            if (!otp) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'OTP is required' 
                });
            }
            
            if (otp !== fileInfo.otp) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'Invalid OTP',
                    hint: '正しいOTPを入力してください'
                });
            }
            
            if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Download limit exceeded' 
                });
            }
            
            fileInfo.downloadCount++;
            
            if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
                await redis.del(`file:${id}`);
            } else {
                const ttl = await redis.ttl(`file:${id}`);
                await redis.setex(`file:${id}`, ttl, JSON.stringify(fileInfo));
            }
            
            const fileBuffer = Buffer.from(fileInfo.fileData, 'base64');
            const encodedFileName = encodeURIComponent(fileInfo.fileName);
            
            res.setHeader('Content-Type', fileInfo.mimeType || 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.fileName}"; filename*=UTF-8''${encodedFileName}`);
            res.setHeader('Content-Length', fileBuffer.length);
            
            console.log(`[Download] Sending: ${fileInfo.fileName} (${fileInfo.downloadCount}/${fileInfo.maxDownloads})`);
            return res.status(200).send(fileBuffer);
        }
        
    } catch (error) {
        console.error('[Download Error]', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Download failed',
            hint: 'ダウンロードに失敗しました'
        });
    }
};
