const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <title>DataGate - PPAP代替システム</title>
      <meta charset="UTF-8">
      <style>
        body { 
          font-family: Arial, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          margin: 0;
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          max-width: 800px;
        }
        h1 { color: #333; }
        .status {
          background: #4CAF50;
          color: white;
          padding: 20px;
          border-radius: 10px;
          text-align: center;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔐 DataGate PPAP代替システム</h1>
        <div class="status">✅ システム稼働中</div>
        <p>📡 URL: https://datagate-poc-production.up.railway.app</p>
        <p>📊 Version: 0.2.0</p>
        <p>© 2024 138data</p>
      </div>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('DataGate server running on port ' + PORT);
});