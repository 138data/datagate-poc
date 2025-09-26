module.exports = (req, res) => {
    res.status(200).json({
        status: 'ok',
        version: '7.0.0',
        message: 'Health endpoint active',
        timestamp: new Date().toISOString()
    });
};
