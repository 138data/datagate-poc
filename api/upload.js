const crypto = require("crypto");
const nodemailer = require("nodemailer");

if (!global.dataGateStorage) {
    global.dataGateStorage = new Map();
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
        
        global.dataGateStorage.set(fileId, {
            fileName: "uploaded-file",
            fileData: buffer,
            otp: otp,
            downloadCount: 0,
            maxDownloads: 3
        });
        
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