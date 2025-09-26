export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DataGate - Secure File Transfer</title>
      <style>
        body {
          font-family: sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 20px;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 { color: #333; }
        .status {
          background: #d4edda;
          color: #155724;
          padding: 10px;
          border-radius: 5px;
          margin: 20px 0;
        }
        a {
          color: #667eea;
          text-decoration: none;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔐 DataGate</h1>
        <p>PPAP離脱 - セキュアファイル転送システム</p>
        <div class="status">✅ Phase 2 稼働中</div>
        <p>メール送信機能: SendGrid 有効</p>
        <br>
        <p><a href="/api/health">APIヘルスチェック →</a></p>
      </div>
    </body>
    </html>
  `);
}
