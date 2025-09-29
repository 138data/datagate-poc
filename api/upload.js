const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// 一時ストレージファイル
const STORAGE_FILE = "/tmp/datagate-storage.json";

function loadStorage() {
    try {
        if (fs.existsSync(STORAGE_FILE)) {
            const data = fs.readFileSync(STORAGE_FILE, "utf8");
            return new Map(JSON.parse(data));
        }
    } catch (e) {
        console.error("Storage load error:", e);
    }
    return new Map();
}

function saveStorage(storage) {
    try {
        const data = Array.from(storage.entries());
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(data));
    } catch (e) {
        console.error("Storage save error:", e);
    }
}

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }
    
    try {
        const chunks = [];
        await new Promise((resolve) => {
            req.on("data", chunk => chunks.push(chunk));
            req.on("end", resolve);
        });
        
        const buffer = Buffer.concat(chunks);
        const fileId = crypto.randomBytes(8).toString("hex");
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // ストレージに保存
        const storage = loadStorage();
        storage.set(fileId, {
            fileName: "uploaded-file",
            fileData: buffer.toString("base64"),
            otp: otp,
            downloadCount: 0,
            maxDownloads: 3,
            timestamp: Date.now()
        });
        saveStorage(storage);
        
        console.log("Saved file:", fileId);
        
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