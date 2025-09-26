module.exports = (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Parse query parameters
    const url = new URL(req.url, `http://${req.headers.host}`);
    const id = url.searchParams.get('id');
    
    if (!id) {
        return res.status(400).json({ error: 'ID parameter is required' });
    }
    
    // Initialize stores
    if (!global.fileStore) global.fileStore = new Map();
    if (!global.otpStore) global.otpStore = new Map();
    
    const fileStore = global.fileStore;
    const otpStore = global.otpStore;
    
    // Handle GET request
    if (req.method === 'GET') {
        const fileData = fileStore.get(id);
        
        if (!fileData) {
            return res.status(404).json({ 
                error: 'File not found',
                id: id,
                availableFiles: Array.from(fileStore.keys())
            });
        }
        
        return res.status(200).json({
            exists: true,
            fileName: fileData.originalName || 'download.txt',
            requiresOTP: true
        });
    }
    
    // Handle POST request
    if (req.method === 'POST') {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const { otp } = JSON.parse(body);
                const fileData = fileStore.get(id);
                const storedOtp = otpStore.get(id);
                
                console.log(`Download attempt - ID: ${id}, OTP: ${otp}, Stored OTP: ${storedOtp}`);
                
                if (!fileData) {
                    return res.status(404).json({ error: 'File not found' });
                }
                
                if (!otp || otp !== storedOtp) {
                    return res.status(401).json({ error: 'Invalid or missing OTP' });
                }
                
                // Update download count
                fileData.downloadCount = (fileData.downloadCount || 0) + 1;
                
                if (fileData.downloadCount > 3) {
                    fileStore.delete(id);
                    otpStore.delete(id);
                    return res.status(403).json({ error: 'Download limit exceeded' });
                }
                
                // Send file
                res.setHeader('Content-Type', 'application/octet-stream');
                res.setHeader('Content-Disposition', `attachment; filename="${fileData.originalName || 'download'}"`);
                return res.end(Buffer.from(fileData.buffer));
                
            } catch (error) {
                console.error('Error processing download:', error);
                return res.status(500).json({ error: 'Server error' });
            }
        });
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
};
