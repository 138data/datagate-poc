const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  console.log('=== Download Request ===');
  
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // リクエストボディを取得
    let body = '';
    await new Promise((resolve) => {
      req.on('data', chunk => body += chunk);
      req.on('end', resolve);
    });
    
    const { fileId, otp } = JSON.parse(body);
    console.log(`Download request - FileID: ${fileId}, OTP: ${otp}`);
    
    if (!fileId || !otp) {
      return res.status(400).json({ error: 'ファイルIDとOTPが必要です' });
    }
    
    // storageディレクトリのパス
    const storageDir = path.join(process.cwd(), 'storage');
    console.log('Storage directory:', storageDir);
    
    // メタデータファイルのパス
    const metadataPath = path.join(storageDir, `${fileId}.json`);
    console.log('Looking for metadata:', metadataPath);
    
    // メタデータが存在するかチェック
    if (!fs.existsSync(metadataPath)) {
      console.log('Metadata not found');
      
      // storageフォルダの内容をログ出力
      const files = fs.readdirSync(storageDir);
      console.log('Files in storage:', files);
      
      return res.status(404).json({ error: 'ファイルが見つかりません' });
    }
    
    // メタデータを読み込み
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    console.log('Metadata loaded:', metadata);
    
    // OTP検証
    if (metadata.otp !== otp) {
      console.log(`OTP mismatch - Expected: ${metadata.otp}, Got: ${otp}`);
      return res.status(401).json({ 
        error: 'セキュリティコードが正しくありません',
        remainingAttempts: (metadata.maxDownloads || 3) - (metadata.downloadCount || 0)
      });
    }
    
    // ダウンロード回数チェック
    const maxDownloads = metadata.maxDownloads || 3;
    const downloadCount = metadata.downloadCount || 0;
    
    if (downloadCount >= maxDownloads) {
      return res.status(403).json({ 
        error: 'ダウンロード回数の上限に達しました' 
      });
    }
    
    // 実際のファイルパス
    const filePath = path.join(storageDir, `${fileId}_${metadata.fileName}`);
    console.log('Looking for file:', filePath);
    
    // ファイルが存在するかチェック
    if (!fs.existsSync(filePath)) {
      console.log('File not found at path:', filePath);
      
      // 別のパターンも試す（ファイル名のみ）
      const altPath = path.join(storageDir, metadata.fileName);
      console.log('Trying alternative path:', altPath);
      
      if (fs.existsSync(altPath)) {
        const fileBuffer = fs.readFileSync(altPath);
        
        // ダウンロード回数を更新
        metadata.downloadCount = downloadCount + 1;
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        
        // ファイルを返す
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${metadata.fileName}"`);
        return res.status(200).send(fileBuffer);
      }
      
      return res.status(404).json({ error: 'ファイルが見つかりません' });
    }
    
    // ファイルを読み込み
    const fileBuffer = fs.readFileSync(filePath);
    
    // ダウンロード回数を更新
    metadata.downloadCount = downloadCount + 1;
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    console.log(`Download success - Count: ${metadata.downloadCount}/${maxDownloads}`);
    
    // ファイルを返す
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.fileName}"`);
    return res.status(200).send(fileBuffer);
    
  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      details: error.message 
    });
  }
};
