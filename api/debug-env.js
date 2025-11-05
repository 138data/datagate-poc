export default async function handler(req, res) {
  // 環境変数の存在確認（値は隠す）
  const hasApiKey = !!process.env.SENDGRID_API_KEY;
  const hasFromEmail = !!process.env.SENDGRID_FROM_EMAIL;
  const apiKeyLength = process.env.SENDGRID_API_KEY?.length || 0;
  
  res.status(200).json({
    hasApiKey,
    hasFromEmail,
    apiKeyLength,
    // 最初の5文字だけ表示（デバッグ用）
    apiKeyPrefix: process.env.SENDGRID_API_KEY?.substring(0, 5),
    fromEmail: process.env.SENDGRID_FROM_EMAIL,
    // email-service.jsが使用する環境変数も確認
    enableEmailSending: process.env.ENABLE_EMAIL_SENDING
  });
}
