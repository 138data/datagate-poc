export default function handler(req, res) {
  return res.status(200).json({
    AWS_REGION: process.env.AWS_REGION || 'NOT SET',
    AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME || 'NOT SET',
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'NOT SET',
    KV_REST_API_URL: process.env.KV_REST_API_URL ? 'SET' : 'NOT SET',
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN ? 'SET' : 'NOT SET'
  });
}
