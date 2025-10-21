module.exports = async (req, res) => {
    res.json({
        ENABLE_COMPRESSION: process.env.ENABLE_COMPRESSION,
        MAX_FILE_SIZE: process.env.MAX_FILE_SIZE,
        ALERT_EMAIL: process.env.ALERT_EMAIL,
        // デバッグ用に他の環境変数も確認
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        VERCEL_ENV: process.env.VERCEL_ENV
    });
};
