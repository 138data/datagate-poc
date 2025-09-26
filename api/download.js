module.exports = (req, res) => {
    // CORSヘッダー
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // URLからIDを取得（/api/download?id=xxx形式）
    const { id } = req.query;
    
    if (!id) {
        return res.status(400).json({ error: 'ID is required' });
    }
    
    const fileStore = global.fileStore || new Map();
    const otpStore = global.otpStore || new Map();
    
    if (req.method === 'GET') {
        const fileData = fileStore.get(id);
        
        if (!fileData) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        return res.status(200).json({
            exists: true,
            fileName: fileData.originalName || 'download.txt',
            requiresOTP: true
        });
    }
    
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            const { otp } = JSON.parse(body);
            const fileData = fileStore.get(id);
            const storedOtp = otpStore.get(id);
            
            if (!fileData) {
                return res.status(404).json({ error: 'File not found' });
            }
            
            if (otp !== storedOtp) {
                return res.status(401).json({ error: 'Invalid OTP' });
            }
            
            // ダウンロード回数をチェック
            fileData.downloadCount = (fileData.downloadCount || 0) + 1;
            
            if (fileData.downloadCount > 3) {
                fileStore.delete(id);
                otpStore.delete(id);
                return res.status(403).json({ error: 'Download limit exceeded' });
            }
            
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${fileData.originalName || 'download'}"`);
            return res.send(fileData.buffer);
        });
        
        return;
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
};
