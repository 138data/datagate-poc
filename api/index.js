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