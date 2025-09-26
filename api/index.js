const express = require('express');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// CORS設定
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

app.use(express.json());

// メモリストレージ（Vercelでは一時的）
const fileStore = new Map();
const otpStore = new Map();

// ========== HEALTH CHECK ==========
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'DataGate API - Fully Integrated',
        version: '3.0.0',
        features: {
            fileUpload: true,
            otpAuthentication: true,
            downloadEndpoint: true,
            mode: 'production'
        },
        endpoints: {
            health: 'GET /api/health',
            upload: 'POST /api/upload',
            checkFile: 'GET /api/download?id={fileId}',
            downloadFile: 'POST /api/download?id={fileId}'
        },
        timestamp: new Date().toISOString()
    });
});

// ========== DOWNLOAD API - GET ==========
app.get('/api/download', (req, res) => {
    const { id } = req.query;
    
    console.log('Download check request:', { id, method: 'GET' });
    
    if (!id) {
        return res.status(400).json({ 
            error: 'ID parameter is required',
            usage: 'GET /api/download?id=YOUR_FILE_ID'
        });
    }
    
    const fileData = fileStore.get(id);
    
    if (!fileData) {
        // デバッグ情報
        console.log('Available files:', Array.from(fileStore.keys()));
        return res.status(404).json({ 
            error: 'File not found',
            id: id,
            message: 'The file may have expired or been deleted'
        });
    }
    
    return res.json({
        exists: true,
        fileName: fileData.originalName,
        size: fileData.size,
        uploadedAt: fileData.uploadedAt,
        downloadCount: fileData.downloadCount || 0,
        requiresOTP: true
    });
});

// ========== DOWNLOAD API - POST ==========
app.post('/api/download', (req, res) => {
    const { id } = req.query;
    const { otp } = req.body;
    
    console.log('Download request:', { id, otp, method: 'POST' });
    
    if (!id) {
        return res.status(400).json({ 
            error: 'ID parameter is required',
            usage: 'POST /api/download?id=YOUR_FILE_ID'
        });
    }
    
    if (!otp) {
        return res.status(400).json({ 
            error: 'OTP is required',
            format: '{ "otp": "123456" }'
        });
    }
    
    const fileData = fileStore.get(id);
    const storedOtp = otpStore.get(id);
    
    if (!fileData) {
        return res.status(404).json({ 
            error: 'File not found',
            id: id
        });
    }
    
    if (otp !== storedOtp) {
        console.log('OTP verification failed:', { provided: otp, expected: storedOtp });
        return res.status(401).json({ 
            error: 'Invalid OTP',
            message: 'The OTP is incorrect or has expired'
        });
    }
    
    // ダウンロード回数を更新
    fileData.downloadCount = (fileData.downloadCount || 0) + 1;
    console.log(`File ${id} downloaded ${fileData.downloadCount} times`);
    
    if (fileData.downloadCount > 3) {
        fileStore.delete(id);
        otpStore.delete(id);
        return res.status(403).json({ 
            error: 'Download limit exceeded',
            message: 'This file has reached the maximum download limit'
        });
    }
    
    // ファイルを送信
    res.setHeader('Content-Type', fileData.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileData.originalName}"`);
    res.setHeader('Content-Length', fileData.buffer.length);
    
    return res.send(Buffer.from(fileData.buffer));
});

// ========== UPLOAD API ==========
app.post('/api/upload', upload.single('file'), (req, res) => {
    console.log('Upload request received');
    
    if (!req.file) {
        return res.status(400).json({ 
            error: 'No file uploaded',
            message: 'Please select a file to upload'
        });
    }
    
    const fileId = crypto.randomBytes(32).toString('hex');
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // ファイルをメモリに保存
    fileStore.set(fileId, {
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedAt: new Date().toISOString(),
        downloadCount: 0
    });
    
    // OTPを保存
    otpStore.set(fileId, otp);
    
    console.log('File uploaded successfully:', { 
        id: fileId, 
        name: req.file.originalname, 
        size: req.file.size,
        otp: otp 
    });
    
    // URLを生成
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    return res.json({
        success: true,
        fileId: fileId,
        downloadLink: `${baseUrl}/download/${fileId}`,
        apiEndpoint: `${baseUrl}/api/download?id=${fileId}`,
        otp: otp,
        message: 'File uploaded successfully. Save the OTP to download the file.',
        expiresIn: '24 hours',
        maxDownloads: 3
    });
});

// ========== TEST ENDPOINT ==========
app.post('/api/test-upload', (req, res) => {
    // テスト用: ダミーファイルを作成
    const fileId = 'test-' + Date.now();
    const otp = '123456';
    
    fileStore.set(fileId, {
        buffer: Buffer.from('This is a test file'),
        originalName: 'test.txt',
        mimeType: 'text/plain',
        size: 19,
        uploadedAt: new Date().toISOString(),
        downloadCount: 0
    });
    
    otpStore.set(fileId, otp);
    
    console.log('Test file created:', { id: fileId, otp });
    
    res.json({
        success: true,
        fileId: fileId,
        otp: otp,
        message: 'Test file created',
        testDownloadUrl: `/api/download?id=${fileId}`
    });
});

// ========== ROOT REDIRECT ==========
app.get('/', (req, res) => {
    res.redirect('/api/health');
});

app.get('/api', (req, res) => {
    res.redirect('/api/health');
});

// ========== 404 HANDLER ==========
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found',
        requestedPath: req.path,
        method: req.method,
        availableEndpoints: {
            health: 'GET /api/health',
            upload: 'POST /api/upload',
            download: 'GET/POST /api/download?id={fileId}',
            testUpload: 'POST /api/test-upload'
        }
    });
});

// Vercel用エクスポート
module.exports = app;

// ローカル開発用
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log('Available endpoints:');
        console.log('  GET  /api/health');
        console.log('  POST /api/upload');
        console.log('  GET  /api/download?id={fileId}');
        console.log('  POST /api/download?id={fileId}');
        console.log('  POST /api/test-upload');
    });
}
