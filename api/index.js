export default function handler(req, res) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>DataGate</title>
      <style>
        body {
          font-family: Arial, sans-serif;
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
          border-radius: 10px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          text-align: center;
        }
        h1 { color: #333; }
        p { color: #666; }
        .success { color: #48bb78; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>DataGate</h1>
        <p>PPAP Alternative System</p>
        <p class="success">✅ Phase 1 Active</p>
        <p>Updated: ${new Date().toISOString()}</p>
        <p><a href="/api/health">Check API Health</a></p>
      </div>
    </body>
    </html>
  `;
  res.status(200).send(html);
}
