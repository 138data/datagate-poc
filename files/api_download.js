// DataGate Download API
// Version: 2.0.0
// Last Updated: 2025-09-26

// Upload APIからストレージを共有
let fileStorage;

module.exports = async (req, res) => {
    // ストレージ初期化（遅延読み込み）
    if (!fileStorage) {
        try {
            const uploadModule = require('./upload');
            fileStorage = uploadModule.fileStorage || new Map();
        } catch (e) {
            // Upload APIがまだロードされていない場合は新規作成
            fileStorage = new Map();
        }
    }
    
    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // URLからファイルID取得
    const { id } = req.query;
    
    if (!id) {
        return res.status(400).json({
            success: false,
            error: 'File ID is required'
        });
    }
    
    // ファイル存在確認
    const fileInfo = fileStorage.get(id);
    
    if (!fileInfo) {
        return res.status(404).json({
            success: false,
            error: 'File not found or expired'
        });
    }
    
    // GETリクエスト：ファイル情報確認
    if (req.method === 'GET') {
        // 有効期限チェック
        if (fileInfo.expiryTime && new Date() > new Date(fileInfo.expiryTime)) {
            fileStorage.delete(id);
            return res.status(410).json({
                success: false,
                error: 'File has expired'
            });
        }
        
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
    
    // POSTリクエスト：OTP認証とダウンロード
    if (req.method === 'POST') {
        // リクエストボディ取得
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
        
        // OTP検証
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
                error: 'Invalid OTP'
            });
        }
        
        // ダウンロード回数チェック
        if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
            return res.status(403).json({
                success: false,
                error: `Download limit exceeded (max: ${fileInfo.maxDownloads})`
            });
        }
        
        // ダウンロード回数を増加
        fileInfo.downloadCount++;
        console.log(`[Download] File ${id} downloaded ${fileInfo.downloadCount}/${fileInfo.maxDownloads} times`);
        
        // ダウンロード制限に達した場合は削除
        if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
            console.log(`[Download] File ${id} reached max downloads, removing...`);
            fileStorage.delete(id);
        }
        
        // ファイルレスポンス
        res.setHeader('Content-Type', fileInfo.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.fileName}"`);
        res.setHeader('Content-Length', fileInfo.fileSize);
        
        // ファイルデータ送信
        return res.status(200).send(fileInfo.fileData);
    }
    
    // その他のメソッド
    return res.status(405).json({
        success: false,
        error: 'Method not allowed'
    });
};

// ストレージ状態を確認するユーティリティ（デバッグ用）
module.exports.getStorageInfo = () => {
    if (!fileStorage) return { count: 0, files: [] };
    
    const files = Array.from(fileStorage.entries()).map(([id, info]) => ({
        id: id.substring(0, 8) + '...',
        fileName: info.fileName,
        size: info.fileSize,
        downloads: `${info.downloadCount}/${info.maxDownloads}`,
        uploadTime: info.uploadTime
    }));
    
    return {
        count: fileStorage.size,
        files: files
    };
};
