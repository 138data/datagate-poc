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
        // Upstash REST API 直接使用
        const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
        const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
        
        // Redisからデータ取得
        const key = `file:${id}`;
        const getResponse = await fetch(`${REDIS_URL}/get/${key}`, {
            headers: {
                'Authorization': `Bearer ${REDIS_TOKEN}`
            }
        });
        
        if (!getResponse.ok) {
            return res.status(404).json({ 
                success: false, 
                error: 'File not found or expired'
            });
        }
        
        const data = await getResponse.json();
        if (!data.result) {
            return res.status(404).json({ 
                success: false, 
                error: 'File not found or expired'
            });
        }
        
        const fileInfo = JSON.parse(data.result);
        
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
            
            // 更新または削除
            if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
                await fetch(`${REDIS_URL}/del/${key}`, {
                    headers: { 'Authorization': `Bearer ${REDIS_TOKEN}` }
                });
            } else {
                await fetch(`${REDIS_URL}/set/${key}/${JSON.stringify(fileInfo)}`, {
                    headers: { 'Authorization': `Bearer ${REDIS_TOKEN}` }
                });
            }
            
            const fileBuffer = Buffer.from(fileInfo.fileData, 'base64');
            
            res.setHeader('Content-Type', fileInfo.mimeType || 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.fileName}"`);
            res.setHeader('Content-Length', fileBuffer.length);
            
            return res.status(200).send(fileBuffer);
        }
        
    } catch (error) {
        console.error('[Download Error]', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Download failed'
        });
    }
};
