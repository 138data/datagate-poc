// DataGate API - Temporary Fix
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

module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const path = req.url.split('?')[0];
    
    if (path === '/api/health') {
        return res.status(200).json({
            status: 'ok',
            version: '5.0.0',
            message: 'API is working'
        });
    }
    
    if (path === '/api/download') {
        return res.status(200).json({
            message: 'Download API is working',
            method: req.method
        });
    }
    
    return res.status(404).json({ error: 'Not found' });
};
