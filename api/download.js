const fs = require("fs");

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
    
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "ID required" });
    
    const storage = loadStorage();
    const file = storage.get(id);
    
    if (!file) {
        return res.status(404).json({ 
            error: "File not found",
            hint: "File may have expired or wrong ID"
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
        if (otp !== file.otp) {
            return res.status(401).json({ error: "Invalid OTP" });
        }
        
        file.downloadCount++;
        if (file.downloadCount >= file.maxDownloads) {
            storage.delete(id);
        }
        saveStorage(storage);
        
        const fileData = Buffer.from(file.fileData, "base64");
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", "attachment; filename=file");
        return res.status(200).send(fileData);
    }
};