// DataGate Download API - SMTP Version
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // グローバルストレージにアクセス
    const fileStorage = global.fileStorage || new Map();
    
    const { id } = req.query;
    
    if (!id) {
        return res.status(400).json({
            success: false,
            error: 'File ID is required'
        });
    }
    
    console.log(`[Download] Looking for file: ${id}`);
    console.log(`[Download] Storage size: ${fileStorage.size}`);
    
    const fileInfo = fileStorage.get(id);
    
    if (!fileInfo) {
        console.log(`[Download] File not found: ${id}`);
        return res.status(404).json({
            success: false,
            exists: false,
            error: 'File not found'
        });
    }
    
    // GETリクエスト: ファイル情報確認
    if (req.method === 'GET') {
        return res.status(200).json({
            success: true,
            exists: true,
            fileName: fileInfo.fileName || 'document.pdf',
            fileSize: fileInfo.fileSize,
            uploadTime: fileInfo.uploadTime,
            remainingDownloads: fileInfo.maxDownloads - fileInfo.downloadCount,
            requiresOTP: true
        });
    }
    
    // POSTリクエスト: OTP認証とダウンロード
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
        
        // OTP確認
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
                error: 'Download limit exceeded'
            });
        }
        
        // ダウンロード回数増加
        fileInfo.downloadCount++;
        console.log(`[Download] File downloaded ${fileInfo.downloadCount}/${fileInfo.maxDownloads} times`);
        
        // ファイル送信
        res.setHeader('Content-Type', fileInfo.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.fileName || 'download.pdf'}"`);
        res.setHeader('Content-Length', fileInfo.fileSize);
        
        return res.status(200).send(fileInfo.fileData);
    }
    
    return res.status(405).json({
        success: false,
        error: 'Method not allowed'
    });
};
