export default function handler(req, res) {
  res.status(200).json({
    status: "ok",
    message: "DataGate Health Check",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
}
