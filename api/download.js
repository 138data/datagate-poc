module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const { id } = req.query;
    
    if (req.method === 'GET') {
        return res.status(200).json({
            success: true,
            message: 'Download GET endpoint working',
            fileId: id || 'none',
            timestamp: new Date().toISOString()
        });
    }
    
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const data = body ? JSON.parse(body) : {};
                res.status(200).json({
                    success: true,
                    message: 'Download POST endpoint working',
                    fileId: id || 'none',
                    otp: data.otp || 'none',
                    timestamp: new Date().toISOString()
                });
            } catch (e) {
                res.status(400).json({ error: 'Invalid JSON' });
            }
        });
        return;
    }
    
    res.status(405).json({ error: 'Method not allowed' });
};
