module.exports = (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    
    const testData = {
        test123: {
            fileName: "test.txt",
            otp: "123456"
        }
    };
    
    const { id } = req.query;
    
    if (req.method === "GET") {
        if (testData[id]) {
            return res.status(200).json({
                success: true,
                exists: true,
                fileName: testData[id].fileName
            });
        }
        return res.status(404).json({ error: "Not found" });
    }
    
    res.status(200).json({ message: "Download API Working" });
};
