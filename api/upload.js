// DataGate Upload API v5 - GET/POST対応
const crypto = require('crypto');

global.fileStorage = global.fileStorage || new Map();

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
    
    // OPTIONS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // GET method
    if (req.method === 'GET') {
        // Email test mode
        if (req.query.test === 'email') {
            const email = req.query.email || '138data@gmail.com';
            
            try {
                const nodemailer = require('nodemailer');
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: '138data@gmail.com',
                        pass: 'xaov vyif bulp rxnl'
                    }
                });
                
                const info = await transporter.sendMail({
                    from: '138data@gmail.com',
                    to: email,
                    subject: 'DataGate Test ' + Date.now(),
                    text: 'Test OTP: 123456',
                    html: '<h2>DataGate</h2><p>OTP: <b>123456</b></p>'
                });
                
                return res.json({
                    success: true,
                    messageId: info.messageId,
                    to: email
                });
            } catch (err) {
                return res.json({
                    success: false,
                    error: err.message
                });
            }
        }
        
        // Default GET response
        return res.json({
            success: true,
            message: 'Upload API v5',
            method: 'GET',
            endpoints: {
                upload: 'POST /api/upload',
                emailTest: 'GET /api/upload?test=email'
            }
        });
    }
    
    // POST method
    if (req.method === 'POST') {
        try {
            const chunks = [];
            let size = 0;
            
            await new Promise((resolve, reject) => {
                req.on('data', chunk => {
                    size += chunk.length;
                    if (size > 10485760) {
                        reject(new Error('File too large'));
                        return;
                    }
                    chunks.push(chunk);
                });
                req.on('end', resolve);
                req.on('error', reject);
            });
            
            const buffer = Buffer.concat(chunks);
            const fileId = crypto.randomBytes(16).toString('hex');
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            
            global.fileStorage.set(fileId, {
                fileName: 'file.dat',
                fileData: buffer,
                fileSize: buffer.length,
                mimeType: 'application/octet-stream',
                otp: otp,
                uploadTime: new Date().toISOString(),
                downloadCount: 0,
                maxDownloads: 3
            });
            
            return res.json({
                success: true,
                fileId: fileId,
                downloadLink: 'https://datagate-poc.vercel.app/download.html?id=' + fileId,
                otp: otp
            });
            
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    
    // Other methods
    return res.status(405).json({
        success: false,
        error: 'Method not allowed'
    });
};