module.exports = (req, res) => {
  // Simple health check for now
  if (req.url === '/api/health' || req.url === '/health') {
    return res.status(200).json({ 
      status: 'ok', 
      version: '1.0.0',
      mode: 'Phase 1 - Vercel Functions',
      timestamp: new Date().toISOString()
    });
  }
  
  // Default response
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DataGate - Secure File Transfer</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          margin: 0;
          padding: 20px;
          min-height: 100vh;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: white;
          padding: 40px;
          border-radius: 10px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        h1 {
          color: #333;
          text-align: center;
          margin-bottom: 10px;
        }
        .subtitle {
          text-align: center;
          color: #666;
          margin-bottom: 30px;
        }
        .status {
          background: #f0f4f8;
          padding: 20px;
          border-radius: 5px;
          text-align: center;
        }
        .status-ok {
          color: #48bb78;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔐 DataGate</h1>
        <p class="subtitle">PPAP Alternative - Secure File Transfer System</p>
        
        <div class="status">
          <h2 class="status-ok">✅ System Status: OK</h2>
          <p>Phase 1 Implementation Active</p>
          <p>Time: ${new Date().toISOString()}</p>
        </div>
        
        <div style="margin-top: 30px; text-align: center;">
          <p>File upload functionality coming soon...</p>
        </div>
      </div>
    </body>
    </html>
  `);
};
