const { Redis } = require('@upstash/redis');

const redis = new Redis({
    url: 'https://joint-whippet-14198.upstash.io',
    token: 'ATd2AAIncDJmMmE5NWE5OWE4YTE0NDg3OTAwMDQwNmJlZTBlMDkzZXAyMTQxOTg'
});

// 起動時にtest123を作成
(async () => {
    try {
        await redis.set('file:test123:meta', JSON.stringify({
            fileName: 'test-file.txt',
            otp: '123456',
            downloadCount: 0,
            maxDownloads: 100
        }), { ex: 86400 });
        await redis.set('file:test123:data', Buffer.from('Test file content').toString('base64'), { ex: 86400 });
        console.log('Test file created');
    } catch (e) {
        console.log('Test file creation skipped');
    }
})();

module.exports = async (req, res) => {
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
            error: 'File ID required'
        });
    }
    
    try {
        // Redisから取得（重要！）
        const metaJson = await redis.get(`file:${id}:meta`);
        
        if (!metaJson) {
            return res.status(404).json({
                success: false,
                error: 'File not found',
                hint: 'Try test file: ID=test123, OTP=123456'
            });
        }
        
        const fileInfo = typeof metaJson === 'string' ? JSON.parse(metaJson) : metaJson;
        
        // GET: ファイル情報
        if (req.method === 'GET') {
            return res.status(200).json({
                success: true,
                exists: true,
                fileName: fileInfo.fileName,
                fileSize: fileInfo.fileSize,
                remainingDownloads: fileInfo.maxDownloads - fileInfo.downloadCount,
                requiresOTP: true
            });
        }
        
        // POST: ダウンロード
        if (req.method === 'POST') {
            let body = '';
            await new Promise((resolve) => {
                req.on('data', chunk => { body += chunk.toString(); });
                req.on('end', resolve);
            });
            
            const { otp } = JSON.parse(body);
            
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
            
            // ファイルデータ取得
            const base64Data = await redis.get(`file:${id}:data`);
            if (!base64Data) {
                return res.status(500).json({
                    success: false,
                    error: 'File data not found'
                });
            }
            
            const fileData = Buffer.from(base64Data, 'base64');
            
            // カウント更新
            fileInfo.downloadCount++;
            await redis.set(`file:${id}:meta`, JSON.stringify(fileInfo), {
                ex: 7 * 24 * 60 * 60
            });
            
            // ファイル送信
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.fileName}"`);
            return res.status(200).send(fileData);
        }
        
    } catch (error) {
        console.error('Download error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
