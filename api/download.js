// 統一されたストレージ名
if (!global.sharedStorage) {
    global.sharedStorage = new Map();
    // テストファイル
    global.sharedStorage.set("test123", {
        fileName: "test.txt",
        fileData: Buffer.from("Test content"),
        otp: "123456",
        downloadCount: 0,
        maxDownloads: 100
    });
}

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    
    if (req.method === "OPTIONS") return res.status(200).end();
    
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "ID required" });
    
    console.log("Looking for:", id, "Available:", Array.from(global.sharedStorage.keys()));
    
    const file = global.sharedStorage.get(id);
    if (!file) {
        return res.status(404).json({ 
            error: "File not found",
            availableIds: Array.from(global.sharedStorage.keys())
        });
    }
    
    if (req.method === "GET") {
        return res.status(200).json({
            success: true,
            fileName: file.fileName,
            remainingDownloads: file.maxDownloads - file.downloadCount
        });
    }
    
    if (req.method === "POST") {
        let body = "";
        await new Promise(r => {
            req.on("data", c => body += c);
            req.on("end", r);
        });
        
        const { otp } = JSON.parse(body);
        if (otp !== file.otp) return res.status(401).json({ error: "Invalid OTP" });
        
        file.downloadCount++;
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", "attachment; filename=download");
        return res.status(200).send(file.fileData);
    }
};