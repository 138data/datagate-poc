if (!global.dataGateStorage) {
    global.dataGateStorage = new Map();
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
    
    const file = global.dataGateStorage.get(id);
    if (!file) {
        return res.status(404).json({ 
            error: 'File not found',
            hint: 'Try test: ID=test123, OTP=123456'
        });
    }
    
    if (req.method === 'GET') {
        return res.status(200).json({
            success: true,
            fileName: file.fileName,
            remainingDownloads: file.maxDownloads - file.downloadCount
        });
    }
    
    if (req.method === 'POST') {
        let body = '';
        await new Promise(r => {
            req.on('data', c => body += c);
            req.on('end', r);
        });
        
        const { otp } = JSON.parse(body);
        if (otp !== file.otp) return res.status(401).json({ error: 'Invalid OTP' });
        if (file.downloadCount >= file.maxDownloads) return res.status(403).json({ error: 'Limit exceeded' });
        
        file.downloadCount++;
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
        return res.status(200).send(file.fileData);
    }
};
