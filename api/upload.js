const crypto = require("crypto");

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
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    
    try {
        const chunks = [];
        await new Promise((resolve) => {
            req.on("data", chunk => chunks.push(chunk));
            req.on("end", resolve);
        });
        
        const buffer = Buffer.concat(chunks);
        const fileId = crypto.randomBytes(8).toString("hex");
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        global.sharedStorage.set(fileId, {
            fileName: "uploaded-file",
            fileData: buffer,
            otp: otp,
            downloadCount: 0,
            maxDownloads: 3
        });
        
        console.log("Stored:", fileId, "Total:", global.sharedStorage.size);
        
        return res.status(200).json({
            success: true,
            fileId: fileId,
            downloadLink: "/download.html?id=" + fileId,
            otp: otp
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};