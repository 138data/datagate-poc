const nodemailer = require("nodemailer");

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*"); // 本番は自ドメインに絞る
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const payload = req.method === "GET" ? req.query : (req.body || {});
    const to = payload.to || process.env.TEST_TO || process.env.SMTP_USER;
    const subject = payload.subject || "DataGate SMTP Test";
    const text = payload.text || "This is a test email sent from DataGate.";
    const html = payload.html;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || "true") === "true", // 465:true / 587:false
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to, subject, text, ...(html ? { html } : {})
    });

    res.status(200).json({ success: true, id: info.messageId, accepted: info.accepted, to });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
};
