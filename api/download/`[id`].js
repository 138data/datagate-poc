module.exports = (req, res) => {
  const { id } = req.query;
  res.send(`
    <html>
      <head><title>Download File</title></head>
      <body style="font-family: sans-serif; padding: 40px;">
        <h2>Enter OTP to Download</h2>
        <p>File ID: ${id}</p>
        <input type="text" placeholder="Enter 6-digit OTP" />
        <button>Download</button>
      </body>
    </html>
  `);
};
