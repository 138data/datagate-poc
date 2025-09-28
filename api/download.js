// DataGate Download API - Upstash Redis対応版
let redis;
try {
    const { Redis } = require('@upstash/redis');
    redis = new Redis({
        url: 'https://joint-whippet-14198.upstash.io',
        token: 'ATd2AAIncDJmMmE5NWE5OWE4YTE0NDg3OTAwMDQwNmJlZTBlMDkzZXAyMTQxOTg'
    });
    console.log('[Download] Upstash Redis connected');
} catch (e) {
    console.log('[Download] Redis not available:', e.message);
}
module.exports = async (req, res) => {
    // CORS險ｭ螳・    res.setHeader('Access-Control-Allow-Origin', '*');
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
    
    console.log(`[Download] Looking for file: ${id}`);
    
    // 繝輔ぃ繧､繝ｫ諠・ｱ蜿門ｾ・    let fileInfo = null;
    let fileData = null;
    
    try {
        if (redis) {
            // redis Storage縺九ｉ蜿門ｾ・            console.log('[Download] Checking redis Storage...');
            const metaKey = `file:${id}:meta`;
            const dataKey = `file:${id}:data`;
            
            const metaJson = await redis.get(metaKey);
            if (metaJson) {
                fileInfo = JSON.parse(metaJson);
                const base64Data = await redis.get(dataKey);
                if (base64Data) {
                    fileData = Buffer.from(base64Data, 'base64');
                    console.log(`[Download] Found in redis Storage: ${id}`);
                }
            }
        } else {
            // 繝｡繝｢繝ｪ繧ｹ繝医Ξ繝ｼ繧ｸ縺九ｉ蜿門ｾ・            console.log('[Download] Checking memory storage...');
            
            // 繧ｰ繝ｭ繝ｼ繝舌Ν螟画焚繧偵メ繧ｧ繝・け
            if (global.fileStorage && global.fileStorage.has(id)) {
                fileInfo = global.fileStorage.get(id);
                fileData = fileInfo.fileData;
                console.log(`[Download] Found in global storage: ${id}`);
            } else if (memoryStorage.has(id)) {
                fileInfo = memoryStorage.get(id);
                fileData = fileInfo.fileData;
                console.log(`[Download] Found in memory storage: ${id}`);
            }
        }
        
        // 繝・せ繝医ヵ繧｡繧､繝ｫ縺ｮ迚ｹ蛻･蜃ｦ逅・        if (!fileInfo && id === 'test123') {
            console.log('[Download] Creating test file...');
            fileInfo = {
                fileName: 'test-file.txt',
                fileSize: 27,
                mimeType: 'text/plain',
                otp: '123456',
                uploadTime: new Date().toISOString(),
                downloadCount: 0,
                maxDownloads: 100
            };
            fileData = Buffer.from('This is a test file content');
            
            // redis Storage縺ｫ菫晏ｭ假ｼ亥茜逕ｨ蜿ｯ閭ｽ縺ｪ蝣ｴ蜷茨ｼ・            if (redis) {
                await redis.set(`file:test123:meta`, JSON.stringify(fileInfo), { ex: 86400 });
                await redis.set(`file:test123:data`, fileData.toString('base64'), { ex: 86400 });
            }
        }
        
    } catch (error) {
        console.error('[Download] Storage error:', error);
    }
    
    if (!fileInfo) {
        return res.status(404).json({
            success: false,
            error: 'File not found',
            availableTest: true,
            hint: 'Use file ID "test123" with OTP "123456" for testing'
        });
    }
    
    // GET繝ｪ繧ｯ繧ｨ繧ｹ繝茨ｼ壹ヵ繧｡繧､繝ｫ諠・ｱ遒ｺ隱・    if (req.method === 'GET') {
        return res.status(200).json({
            success: true,
            exists: true,
            fileName: fileInfo.fileName,
            fileSize: fileInfo.fileSize,
            uploadTime: fileInfo.uploadTime,
            remainingDownloads: fileInfo.maxDownloads - fileInfo.downloadCount,
            requiresOTP: true,
            storageType: redis ? 'redis Storage' : 'Memory'
        });
    }
    
    // POST繝ｪ繧ｯ繧ｨ繧ｹ繝茨ｼ唹TP隱崎ｨｼ縺ｨ繝繧ｦ繝ｳ繝ｭ繝ｼ繝・    if (req.method === 'POST') {
        let body = '';
        await new Promise((resolve) => {
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', resolve);
        });
        
        let otp;
        try {
            const data = JSON.parse(body);
            otp = data.otp;
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: 'Invalid request body'
            });
        }
        
        if (!otp) {
            return res.status(400).json({
                success: false,
                error: 'OTP is required'
            });
        }
        
        if (otp !== fileInfo.otp) {
            console.log(`[Download] OTP mismatch: provided=${otp}, expected=${fileInfo.otp}`);
            return res.status(401).json({
                success: false,
                error: 'Invalid OTP',
                hint: id === 'test123' ? 'For test file, use OTP: 123456' : undefined
            });
        }
        
        // 繝繧ｦ繝ｳ繝ｭ繝ｼ繝牙屓謨ｰ繝√ぉ繝・け
        if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
            return res.status(403).json({
                success: false,
                error: 'Download limit exceeded'
            });
        }
        
        // 繝繧ｦ繝ｳ繝ｭ繝ｼ繝牙屓謨ｰ繧貞｢怜刈
        fileInfo.downloadCount++;
        console.log(`[Download] Download ${fileInfo.downloadCount}/${fileInfo.maxDownloads}`);
        
        // redis Storage縺ｮ蝣ｴ蜷医・譖ｴ譁ｰ
        if (redis && id !== 'test123') {
            try {
                const metaKey = `file:${id}:meta`;
                await redis.set(metaKey, JSON.stringify(fileInfo), {
                    ex: Math.max(1, Math.floor((new Date(fileInfo.expiryTime) - new Date()) / 1000))
                });
                
                // 繝繧ｦ繝ｳ繝ｭ繝ｼ繝牙宛髯舌↓驕斐＠縺溘ｉ蜑企勁
                if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
                    console.log(`[Download] Removing file ${id} (max downloads reached)`);
                    await redis.del(`file:${id}:meta`);
                    await redis.del(`file:${id}:data`);
                }
            } catch (error) {
                console.error('[Download] redis update error:', error);
            }
        }
        
        // 繝輔ぃ繧､繝ｫ縺悟ｭ伜惠縺励↑縺・ｴ蜷・        if (!fileData) {
            return res.status(500).json({
                success: false,
                error: 'File data not found'
            });
        }
        
        // 繝輔ぃ繧､繝ｫ騾∽ｿ｡
        res.setHeader('Content-Type', fileInfo.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.fileName}"`);
        res.setHeader('Content-Length', fileData.length);
        
        return res.status(200).send(fileData);
    }
    
    return res.status(405).json({
        success: false,
        error: 'Method not allowed'
    });
};

// 繧ｹ繝医Ξ繝ｼ繧ｸ諠・ｱ蜿門ｾ暦ｼ医ョ繝舌ャ繧ｰ逕ｨ・・module.exports.getStorageInfo = async () => {
    const info = {
        kvAvailable: !!redis,
        memoryCount: memoryStorage.size,
        globalCount: global.fileStorage ? global.fileStorage.size : 0
    };
    
    if (redis) {
        try {
            // redis Storage縺ｮ繧ｭ繝ｼ繧貞叙蠕暦ｼ医ヱ繧ｿ繝ｼ繝ｳ繝槭ャ繝・ｼ・            const keys = await redis.keys('file:*:meta');
            info.kvCount = keys.length;
            info.kvKeys = keys.slice(0, 5); // 譛蛻昴・5莉ｶ
        } catch (e) {
            info.kvError = e.message;
        }
    }
    
    return info;
};


