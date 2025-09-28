// DataGate Download API - Vercel KV Storage対応版
// Version: 2.0.0 (KV Storage)
// Last Updated: 2025-09-26

// Vercel KV Storage
let kv;
try {
    kv = require('@vercel/kv').kv;
} catch (e) {
    console.log('[Download] KV Storage not available, using memory storage');
}

// フォールバック用メモリストレージ
const memoryStorage = new Map();

module.exports = async (req, res) => {
    // CORS設定
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
    
    console.log(`[Download] Looking for file: ${id}`);
    
    // ファイル情報取得
    let fileInfo = null;
    let fileData = null;
    
    try {
        if (kv) {
            // KV Storageから取得
            console.log('[Download] Checking KV Storage...');
            const metaKey = `file:${id}:meta`;
            const dataKey = `file:${id}:data`;
            
            const metaJson = await kv.get(metaKey);
            if (metaJson) {
                fileInfo = JSON.parse(metaJson);
                const base64Data = await kv.get(dataKey);
                if (base64Data) {
                    fileData = Buffer.from(base64Data, 'base64');
                    console.log(`[Download] Found in KV Storage: ${id}`);
                }
            }
        } else {
            // メモリストレージから取得
            console.log('[Download] Checking memory storage...');
            
            // グローバル変数をチェック
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
        
        // テストファイルの特別処理
        if (!fileInfo && id === 'test123') {
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
            
            // KV Storageに保存（利用可能な場合）
            if (kv) {
                await kv.set(`file:test123:meta`, JSON.stringify(fileInfo), { ex: 86400 });
                await kv.set(`file:test123:data`, fileData.toString('base64'), { ex: 86400 });
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
    
    // GETリクエスト：ファイル情報確認
    if (req.method === 'GET') {
        return res.status(200).json({
            success: true,
            exists: true,
            fileName: fileInfo.fileName,
            fileSize: fileInfo.fileSize,
            uploadTime: fileInfo.uploadTime,
            remainingDownloads: fileInfo.maxDownloads - fileInfo.downloadCount,
            requiresOTP: true,
            storageType: kv ? 'KV Storage' : 'Memory'
        });
    }
    
    // POSTリクエスト：OTP認証とダウンロード
    if (req.method === 'POST') {
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
        
        // ダウンロード回数チェック
        if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
            return res.status(403).json({
                success: false,
                error: 'Download limit exceeded'
            });
        }
        
        // ダウンロード回数を増加
        fileInfo.downloadCount++;
        console.log(`[Download] Download ${fileInfo.downloadCount}/${fileInfo.maxDownloads}`);
        
        // KV Storageの場合は更新
        if (kv && id !== 'test123') {
            try {
                const metaKey = `file:${id}:meta`;
                await kv.set(metaKey, JSON.stringify(fileInfo), {
                    ex: Math.max(1, Math.floor((new Date(fileInfo.expiryTime) - new Date()) / 1000))
                });
                
                // ダウンロード制限に達したら削除
                if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
                    console.log(`[Download] Removing file ${id} (max downloads reached)`);
                    await kv.del(`file:${id}:meta`);
                    await kv.del(`file:${id}:data`);
                }
            } catch (error) {
                console.error('[Download] KV update error:', error);
            }
        }
        
        // ファイルが存在しない場合
        if (!fileData) {
            return res.status(500).json({
                success: false,
                error: 'File data not found'
            });
        }
        
        // ファイル送信
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

// ストレージ情報取得（デバッグ用）
module.exports.getStorageInfo = async () => {
    const info = {
        kvAvailable: !!kv,
        memoryCount: memoryStorage.size,
        globalCount: global.fileStorage ? global.fileStorage.size : 0
    };
    
    if (kv) {
        try {
            // KV Storageのキーを取得（パターンマッチ）
            const keys = await kv.keys('file:*:meta');
            info.kvCount = keys.length;
            info.kvKeys = keys.slice(0, 5); // 最初の5件
        } catch (e) {
            info.kvError = e.message;
        }
    }
    
    return info;
};
