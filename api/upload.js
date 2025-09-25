// Vercel Serverless Function用
export const config = { 
  api: { 
    bodyParser: false,
    sizeLimit: '4mb'
  } 
};

export default async function handler(req, res) {
  // CORSヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method Not Allowed' 
    });
  }
  
  // 仮のレスポンス（動作確認用）
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const fileId = Date.now().toString();
  
  res.status(200).json({
    success: true,
    fileId: fileId,
    otp: otp,
    downloadLink: `https://datagate-poc.vercel.app/api/download/${fileId}`,
    message: 'ファイルアップロード成功（テスト版）'
  });
}
