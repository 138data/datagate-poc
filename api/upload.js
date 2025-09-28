// DataGate Upload API - Upstash Redis対応版
const crypto = require('crypto');

let redis;
try {
    const { Redis } = require('@upstash/redis');
    redis = new Redis({
        url: 'https://joint-whippet-14198.upstash.io',
        token: 'ATd2AAIncDJmMmE5NWE5OWE4YTE0NDg3OTAwMDQwNmJlZTBlMDkzZXAyMTQxOTg'
    });
    console.log('[Upload] Upstash Redis connected');
} catch (e) {
    console.log('[Upload] Redis not available:', e.message);
}
module.exports = async (req, res) => {
    // CORS險ｭ螳・    res.setHeader('Access-Control-Allow-Origin', '*');
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
        // 繝懊ョ繧｣繝・・繧ｿ蜿朱寔
        const chunks = [];
        let totalSize = 0;
        
        await new Promise((resolve, reject) => {
            req.on('data', chunk => {
                totalSize += chunk.length;
                if (totalSize > MAX_FILE_SIZE) {
                    reject(new Error('繝輔ぃ繧､繝ｫ繧ｵ繧､繧ｺ縺・0MB繧定ｶ・∴縺ｦ縺・∪縺・));
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', resolve);
            req.on('error', reject);
        });
        
        const buffer = Buffer.concat(chunks);
        
        // 繝輔ぃ繧､繝ｫID縺ｨOTP逕滓・
        const fileId = crypto.randomBytes(16).toString('hex'); // 32譁・ｭ・        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // 繝輔ぃ繧､繝ｫ諠・ｱ繧ｪ繝悶ず繧ｧ繧ｯ繝・        const fileInfo = {
            fileName: 'uploaded-file.dat',
            fileSize: buffer.length,
            mimeType: 'application/octet-stream',
            otp: otp,
            uploadTime: new Date().toISOString(),
            downloadCount: 0,
            maxDownloads: 3,
            expiryTime: new Date(Date.now() + FILE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
        };
        
        // 繧ｹ繝医Ξ繝ｼ繧ｸ縺ｫ菫晏ｭ・        if (redis) {
            // redis Storage縺悟茜逕ｨ蜿ｯ閭ｽ縺ｪ蝣ｴ蜷・            console.log('[Upload] Saving to redis Storage...');
            
            // 繝｡繧ｿ繝・・繧ｿ繧剃ｿ晏ｭ・            await redis.set(`file:${fileId}:meta`, JSON.stringify(fileInfo), {
                ex: FILE_EXPIRY_DAYS * 24 * 60 * 60 // TTL in seconds
            });
            
            // 繝輔ぃ繧､繝ｫ繝・・繧ｿ繧剃ｿ晏ｭ假ｼ・ase64繧ｨ繝ｳ繧ｳ繝ｼ繝会ｼ・            await redis.set(`file:${fileId}:data`, buffer.toString('base64'), {
                ex: FILE_EXPIRY_DAYS * 24 * 60 * 60
            });
            
            console.log(`[Upload] File saved to redis: ${fileId}`);
            
        } else {
            // 繝｡繝｢繝ｪ繧ｹ繝医Ξ繝ｼ繧ｸ縺ｫ繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ
            console.log('[Upload] Using memory storage (temporary)');
            fileInfo.fileData = buffer;
            memoryStorage.set(fileId, fileInfo);
            
            // 繧ｰ繝ｭ繝ｼ繝舌Ν螟画焚縺ｫ繧ゆｿ晏ｭ假ｼ井ｺ呈鋤諤ｧ縺ｮ縺溘ａ・・            global.fileStorage = global.fileStorage || new Map();
            global.fileStorage.set(fileId, fileInfo);
        }
        
        // 繝ｬ繧ｹ繝昴Φ繧ｹ
        const baseUrl = 'https://datagate-poc.vercel.app';
        const downloadPath = `/download.html?id=${fileId}`;
        const fullDownloadUrl = `${baseUrl}${downloadPath}`;
        
        return res.status(200).json({
            success: true,
            message: '繝輔ぃ繧､繝ｫ縺梧ｭ｣蟶ｸ縺ｫ繧｢繝・・繝ｭ繝ｼ繝峨＆繧後∪縺励◆',
            fileId: fileId,
            downloadLink: fullDownloadUrl,
            otp: otp,
            fileName: fileInfo.fileName,
            fileSize: fileInfo.fileSize,
            storageType: redis ? 'redis Storage (Persistent)' : 'Memory (Temporary)',
            expiryDate: fileInfo.expiryTime
        });
        
    } catch (error) {
        console.error('[Upload Error]', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Upload failed'
        });
    }
};

// 繝｡繝｢繝ｪ繧ｹ繝医Ξ繝ｼ繧ｸ繧偵お繧ｯ繧ｹ繝昴・繝茨ｼ井ｺ呈鋤諤ｧ縺ｮ縺溘ａ・・module.exports.fileStorage = memoryStorage;

// 繝・せ繝育畑繧ｨ繝ｳ繝峨・繧､繝ｳ繝茨ｼ・api/test-upload・・module.exports.testUpload = async (req, res) => {
    const fileId = 'test123';
    const otp = '123456';
    
    const testFile = {
        fileName: 'test-file.txt',
        fileSize: 27,
        mimeType: 'text/plain',
        otp: otp,
        uploadTime: new Date().toISOString(),
        downloadCount: 0,
        maxDownloads: 100,
        expiryTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    if (redis) {
        await redis.set(`file:${fileId}:meta`, JSON.stringify(testFile), {
            ex: 30 * 24 * 60 * 60
        });
        await redis.set(`file:${fileId}:data`, Buffer.from('This is a test file content').toString('base64'), {
            ex: 30 * 24 * 60 * 60
        });
        console.log('[Test] Created test file in redis Storage');
    } else {
        testFile.fileData = Buffer.from('This is a test file content');
        memoryStorage.set(fileId, testFile);
        if (global.fileStorage) {
            global.fileStorage.set(fileId, testFile);
        }
        console.log('[Test] Created test file in memory storage');
    }
    
    res.status(200).json({
        success: true,
        message: 'Test file created',
        fileId: fileId,
        otp: otp,
        storageType: redis ? 'redis Storage' : 'Memory'
    });
};


