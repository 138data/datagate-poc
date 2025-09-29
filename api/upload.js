module.exports = (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    
    const response = {
        success: true,
        message: "Upload API Working",
        method: req.method,
        timestamp: new Date().toISOString()
    };
    
    res.status(200).json(response);
};
