// DataGate Upload API - Vercel KV Storage対応版
// Version: 2.0.0 (KV Storage)
// Last Updated: 2025-09-26

const crypto = require('crypto');

// Vercel KV Storage (環境変数で有効な場合のみ)
let kv;
try {
    kv = require('@vercel/kv').kv;
} catch (e) {
    console.log('[Upload] KV Storage not available, using memory storage');
}

// フォールバック用メモリストレージ
const memoryStorage = new Map();

// ストレージ設定
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const FILE_EXPIRY_DAYS = 7; // 7日間

module.exports = async (req, res) => {
    // CORS設定
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
        // ボディデータ収集
        const chunks = [];
        let totalSize = 0;
        
        await new Promise((resolve, reject) => {
            req.on('data', chunk => {
                totalSize += chunk.length;
                if (totalSize > MAX_FILE_SIZE) {
                    reject(new Error('ファイルサイズが10MBを超えています'));
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', resolve);
            req.on('error', reject);
        });
        
        const buffer = Buffer.concat(chunks);
        
        // ファイルIDとOTP生成
        const fileId = crypto.randomBytes(16).toString('hex'); // 32文字
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // ファイル情報オブジェクト
        const fileInfo = {
            fileName: 'uploaded-file.dat',
            fileSize: buffer.length,
            mimeType: 'application/octet-stream',
            otp: otp,
            uploadTime: new Date().toISOString(),
            downloadCount: 0,
            maxDownloads: 3,
            expiryTime: new Date(Date.now() + FILE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
        };
        
        // ストレージに保存
        if (kv) {
            // KV Storageが利用可能な場合
            console.log('[Upload] Saving to KV Storage...');
            
            // メタデータを保存
            await kv.set(`file:${fileId}:meta`, JSON.stringify(fileInfo), {
                ex: FILE_EXPIRY_DAYS * 24 * 60 * 60 // TTL in seconds
            });
            
            // ファイルデータを保存（Base64エンコード）
            await kv.set(`file:${fileId}:data`, buffer.toString('base64'), {
                ex: FILE_EXPIRY_DAYS * 24 * 60 * 60
            });
            
            console.log(`[Upload] File saved to KV: ${fileId}`);
            
        } else {
            // メモリストレージにフォールバック
            console.log('[Upload] Using memory storage (temporary)');
            fileInfo.fileData = buffer;
            memoryStorage.set(fileId, fileInfo);
            
            // グローバル変数にも保存（互換性のため）
            global.fileStorage = global.fileStorage || new Map();
            global.fileStorage.set(fileId, fileInfo);
        }
        
        // レスポンス
        const baseUrl = 'https://datagate-poc.vercel.app';
        const downloadPath = `/download.html?id=${fileId}`;
        const fullDownloadUrl = `${baseUrl}${downloadPath}`;
        
        return res.status(200).json({
            success: true,
            message: 'ファイルが正常にアップロードされました',
            fileId: fileId,
            downloadLink: fullDownloadUrl,
            otp: otp,
            fileName: fileInfo.fileName,
            fileSize: fileInfo.fileSize,
            storageType: kv ? 'KV Storage (Persistent)' : 'Memory (Temporary)',
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

// メモリストレージをエクスポート（互換性のため）
module.exports.fileStorage = memoryStorage;

// テスト用エンドポイント（/api/test-upload）
module.exports.testUpload = async (req, res) => {
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
    
    if (kv) {
        await kv.set(`file:${fileId}:meta`, JSON.stringify(testFile), {
            ex: 30 * 24 * 60 * 60
        });
        await kv.set(`file:${fileId}:data`, Buffer.from('This is a test file content').toString('base64'), {
            ex: 30 * 24 * 60 * 60
        });
        console.log('[Test] Created test file in KV Storage');
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
        storageType: kv ? 'KV Storage' : 'Memory'
    });
};
