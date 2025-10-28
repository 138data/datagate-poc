// api/test-upload.js
export default async function handler(req, res) {
  try {
    // KV接続テスト
    const { kv } = await import('@vercel/kv');
    
    // SendGrid設定テスト
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    
    res.status(200).json({
      success: true,
      tests: {
        kvAvailable: typeof kv !== 'undefined',
        sendgridConfigured: !!sendgridApiKey,
        method: req.method,
        contentType: req.headers['content-type']
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}
