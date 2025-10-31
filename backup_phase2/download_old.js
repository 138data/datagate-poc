// DataGate Download API - グローバルストレージ対応版

// グローバルストレージにアクセス
global.fileStorage = global.fileStorage || new Map();

// テストファイルを常に利用可能に
if (!global.fileStorage.has('test123')) {
    global.fileStorage.set('test123', {
        fileName: 'test-file.txt',
        fileData: Buffer.from('This is a test file content'),
        fileSize: 27,
        mimeType: 'text/plain',
        otp: '123456',
        uploadTime: new Date().toISOString(),
        downloadCount: 0,
        maxDownloads: 100
    });
}

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
            error: 'File ID is required'
        });
    }
    
    console.log('Looking for file ID:', id, 'Storage size:', global.fileStorage.size);
    console.log('Available IDs:', Array.from(global.fileStorage.keys()));
    
    const fileInfo = global.fileStorage.get(id);
    
    if (!fileInfo) {
        return res.status(404).json({
            success: false,
            error: 'File not found',
            availableTest: 'Use ID "test123" with OTP "123456" for testing'
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
            requiresOTP: true
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
            console.log(`OTP mismatch: provided=${otp}, expected=${fileInfo.otp}`);
            return res.status(401).json({
                success: false,
                error: 'Invalid OTP',
                hint: 'For test file, use OTP: 123456'
            });
        }
        
        // ダウンロード回数チェック
        if (fileInfo.downloadCount >= fileInfo.maxDownloads) {
            return res.status(403).json({
                success: false,
                error: 'Download limit exceeded'
            });
        }
        
        fileInfo.downloadCount++;
        
        // ファイル送信
        res.setHeader('Content-Type', fileInfo.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.fileName}"`);
        res.setHeader('Content-Length', fileInfo.fileSize);
        
        return res.status(200).send(fileInfo.fileData);
    }
    
    return res.status(405).json({
        success: false,
        error: 'Method not allowed'
    });
};
