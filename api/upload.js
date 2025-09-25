const multer = require("multer");
const crypto = require("crypto");

const storage = multer.memoryStorage();
const upload = multer({ 
  storage, 
  limits: { 
    fileSize: 4 * 1024 * 1024  // 4MB制限に変更
  }
});

module.exports = (req, res) => {
  // CORSヘッダー設定
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ 
          error: "ファイルサイズが大きすぎます。4MB以下のファイルを選択してください。" 
        });
      }
      return res.status(400).json({ error: err.message });
    }
    
    const fileId = crypto.randomBytes(32).toString("hex");
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    res.json({
      success: true,
      fileId: fileId,
      downloadLink: `https://datagate-poc.vercel.app/api/download/${fileId}`,
      otp: otp,
      message: "ファイルがアップロードされました（デモ版：4MB制限）"
    });
  });
};
