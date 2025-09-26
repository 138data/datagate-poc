module.exports = (req, res) => {
    const { id } = req.query;
    const fileStore = global.fileStore || new Map();
    const otpStore = global.otpStore || new Map();
    
    if (req.method === 'POST') {
        const { otp } = req.body;
        const fileData = fileStore.get(id);
        const storedOtp = otpStore.get(id);
        
        if (!fileData) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        if (otp !== storedOtp) {
            return res.status(401).json({ error: 'Invalid OTP' });
        }
        
        res.setHeader('Content-Type', fileData.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', 'attachment; filename="download"');
        return res.send(fileData.buffer);
    }
    
    return res.status(200).json({ message: 'Download API', id: id });
};