// Vercel環境での共有ストレージ
if (!global.dataGateStorage) {
    global.dataGateStorage = new Map();
    // テストファイルを常に含める
    global.dataGateStorage.set('test123', {
        fileName: 'test-file.txt',
        fileData: Buffer.from('This is a test file content'),
        otp: '123456',
        downloadCount: 0,
        maxDownloads: 100
    });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID required' });
    
    console.log(`[Download] Looking for ID: ${id}`);
    console.log(`[Download] Available IDs: ${Array.from(global.dataGateStorage.keys()).join(', ')}`);
    
    const file = global.dataGateStorage.get(id);
    
    if (!file) {
        return res.status(404).json({ 
            success: false,
            error: 'File not found',
            requestedId: id,
            availableIds: Array.from(global.dataGateStorage.keys()),
            hint: 'File may have expired or ID mismatch. Try test file: ID=test123, OTP=123456'
        });
    }
    
    if (req.method === 'GET') {
        return res.status(200).json({
            success: true,
            exists: true,
            fileName: file.fileName,
            remainingDownloads: file.maxDownloads - file.downloadCount,
            requiresOTP: true
        });
    }
    
    if (req.method === 'POST') {
        let body = '';
        await new Promise(resolve => {
            req.on('data', chunk => body += chunk);
            req.on('end', resolve);
        });
        
        let otp = '';
        try {
            const data = JSON.parse(body);
            otp = data.otp;
        } catch (e) {
            console.error('[Download] Parse error:', e);
        }
        
        console.log(`[Download] OTP check - Provided: ${otp}, Expected: ${file.otp}`);
        
        if (otp !== file.otp) {
            return res.status(401).json({ 
                error: 'Invalid OTP',
                debug: `Expected: ${file.otp}, Got: ${otp}` // デバッグ用
            });
        }
        
        if (file.downloadCount >= file.maxDownloads) {
            return res.status(403).json({ error: 'Download limit exceeded' });
        }
        
        file.downloadCount++;
        console.log(`[Download] Success - File: ${id}, Count: ${file.downloadCount}/${file.maxDownloads}`);
        
        // 制限に達したら削除
        if (file.downloadCount >= file.maxDownloads) {
            global.dataGateStorage.delete(id);
            console.log(`[Download] File deleted after max downloads: ${id}`);
        }
        
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
        return res.status(200).send(file.fileData);
    }
};
