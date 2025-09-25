export default function handler(req, res) {
  res.status(200).json({
    status: "ok",
    message: "DataGate Phase 2 - Email Integration Active",
    version: "2.0.0",
    features: {
      fileUpload: true,
      otpAuthentication: true,
      emailNotification: !!process.env.SENDGRID_API_KEY,
      mode: process.env.SENDGRID_API_KEY ? 'production' : 'test'
    },
    timestamp: new Date().toISOString()
  });
}
