module.exports = (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'Test email endpoint is working',
        timestamp: new Date().toISOString()
    });
};
