export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 基本的なテスト
    res.status(200).json({
      success: true,
      message: 'Test upload API is working',
      fileId: 'test-12345',
      otp: 'abc123',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
