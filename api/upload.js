const multer = require("multer");
const crypto = require("crypto");

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }});

module.exports = (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    
    const fileId = crypto.randomBytes(32).toString("hex");
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    res.json({
      success: true,
      fileId: fileId,
      downloadLink: `https://datagate-poc.vercel.app/api/download/${fileId}`,
      otp: otp,
      message: "File uploaded successfully"
    });
  });
};
