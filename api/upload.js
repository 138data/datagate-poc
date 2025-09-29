// DataGate Upload API - Simplified
const crypto = require('crypto');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // GET request
    if (req.method === 'GET') {
        // Email test
        if (req.query.test === 'email') {
            try {
                // Check if nodemailer is available
                const nodemailer = require('nodemailer');
                
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: '138data@gmail.com',
                        pass: 'xaov vyif bulp rxnl'
                    }
                });
                
                await transporter.sendMail({
                    from: '138data@gmail.com',
                    to: req.query.email || '138data@gmail.com',
                    subject: 'DataGate Test',
                    text: 'OTP: 123456'
                });
                
                return res.json({ success: true, message: 'Email sent' });
            } catch (e) {
                return res.json({ success: false, error: e.message });
            }
        }
        
        return res.json({ 
            success: true, 
            message: 'Upload API', 
            method: 'GET' 
        });
    }
    
    // POST request
    if (req.method === 'POST') {
        return res.json({ 
            success: true, 
            message: 'Upload would happen here',
            method: 'POST'
        });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
};