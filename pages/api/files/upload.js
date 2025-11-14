// pages/api/files/upload.js
const formidable = require('formidable');
const fs = require('fs').promises;
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const nodemailer = require('nodemailer');
const kv = require('../../lib/kv-client');
const gzip = promisify(zlib.gzip);
// フォーム解析の設定を無効化（手動で処理）
exports.config = {
  api: {
    bodyParser: false,
  },
};
// OTP生成
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
// SHA256ハッシュ計算
function calculateSHA256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
// メール送信（SendGrid + Gmail フォールバック）
async function sendEmail(to, from, fileId, filename, otp, expiresAt) {
  const downloadUrl = `https://datagate-poc.vercel.app/download/${fileId}`;
 
  const mailOptions = {
    from: 'datagate@138io.com',
    to,
    subject: '【DataGate】ファイル受信通知',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>安全なファイル転送</h2>
        <p><strong>${from}</strong> 様からファイルが届いています。</p>
       
        <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p><strong>★ ダウンロード用OTP(ワンタイムパスワード):</strong></p>
          <p style="font-size: 24px; font-weight: bold; color: #0066cc; margin: 10px 0;">${otp}</p>
        </div>
       
        <p><strong>メッセージ:</strong><br>なし</p>
       
        <p><strong>ファイル名:</strong> ${filename}<br>
        <strong>サイズ:</strong> 46 Bytes</p>
       
        <p><strong>ダウンロード URL:</strong><br>
        <a href="${downloadUrl}" style="color: #0066cc;">${downloadUrl}</a></p>
       
        <p><strong>有効期限:</strong> ${new Date(expiresAt).toLocaleString('ja-JP')}</p>
       
        <hr style="margin: 20px 0;">
        <p style="font-size: 12px; color: #666;">
          このメールは DataGate (datagate-poc.vercel.app) を通じて送信されました。<br>
          送信元メールアドレス: <a href="mailto:${from}">${from}</a><br>
          受信者: <a href="mailto:${to}">${to}</a> には開示せん
        </p>
      </div>
    `
  };
  // SendGrid優先、失敗したらGmail
  const transports = [];
  // SendGrid (AWS SES)
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    transports.push({
      name: 'SendGrid',
      host: 'email-smtp.us-east-1.amazonaws.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.AWS_ACCESS_KEY_ID,
        pass: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  // Gmail
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    transports.push({
      name: 'Gmail',
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  // サンドボックスモードチェック
  if (process.env.MAIL_SANDBOX === 'true') {
    console.log('[Email SANDBOX] メール送信スキップ:', { to, from, otp });
    return { success: true, mode: 'sandbox' };
  }
  let lastError;
  for (const transportConfig of transports) {
    try {
      const transporter = nodemailer.createTransport(transportConfig);
      await transporter.sendMail(mailOptions);
      console.log(`[Email] 送信成功 (${transportConfig.name}):`, to);
      return { success: true, provider: transportConfig.name };
    } catch (error) {
      console.error(`[Email] ${transportConfig.name} 失敗:`, error.message);
      lastError = error;
    }
  }
  throw lastError || new Error('メール送信設定がありません');
}
async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  console.log('[Upload] Request received');
  try {
    // 1. フォームデータ解析
    const form = formidable({
      maxFileSize: 50 * 1024 * 1024, // 50MB
      keepExtensions: true,
    });
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });
    const file = files.file?.[0];
    const from = fields.from?.[0];
    const to = fields.to?.[0];
    if (!file || !from || !to) {
      return res.status(400).json({ error: '必須パラメータが不足しています' });
    }
    console.log('[Upload] File received:', {
      filename: file.originalFilename,
      size: file.size,
      from,
      to,
    });
    // 2. ファイル読み込み
    const fileBuffer = await fs.readFile(file.filepath);
    const sha256 = calculateSHA256(fileBuffer);
    // 3. GZIP圧縮
    const compressedBuffer = await gzip(fileBuffer);
    const compressionRatio = ((compressedBuffer.length / fileBuffer.length - 1) * 100).toFixed(1);
    console.log('[Upload] Compression:', {
      original: fileBuffer.length,
      compressed: compressedBuffer.length,
      ratio: compressionRatio + '%',
    });
    // 4. S3アップロード
    const fileId = crypto.randomBytes(16).toString('hex');
    const s3Key = `files/${fileId}.gz`;
    // S3クライアント初期化
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1', // ✅ デフォルト値修正
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    if (!bucketName) {
      throw new Error('AWS_S3_BUCKET_NAME environment variable is not set');
    }
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: compressedBuffer,
        ContentType: 'application/gzip',
        Metadata: {
          originalFilename: file.originalFilename,
          originalSize: fileBuffer.length.toString(),
          sha256,
        },
      })
    );
    console.log('[Upload] S3 upload successful:', s3Key);
    // 5. OTP生成
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    // 6. KVにメタデータ保存
    try {
      const metadata = {
        fileId,
        filename: file.originalFilename,
        size: fileBuffer.length,
        compressed: compressedBuffer.length,
        sha256,
        otp,
        from,
        to,
        uploadedAt: new Date().toISOString(),
        expiresAt,
        storageType: 's3',
        s3Key,
      };
      await kv.set(`file:${fileId}`, JSON.stringify(metadata));
      await kv.expire(`file:${fileId}`, 7 * 24 * 60 * 60);
      console.log(`[Upload] Metadata saved to KV: file:${fileId}`);
      // 7. 統計更新
      await kv.incr('stats:total_uploads');
      await kv.incrby('stats:total_bytes', fileBuffer.length);
    } catch (kvError) {
      console.error('[Upload] KV save error:', kvError);
      // KVエラーでも処理を続行（S3には保存済み）
    }
    // 8. メール送信
    try {
      await sendEmail(to, from, fileId, file.originalFilename, otp, expiresAt);
    } catch (emailError) {
      console.error('[Upload] Email failed:', emailError.message);
      // メール送信失敗でもファイルはアップロード済みなので続行
    }
    // 9. 一時ファイル削除
    await fs.unlink(file.filepath);
    // 10. レスポンス
    res.status(200).json({
      success: true,
      fileId,
      downloadUrl: `https://datagate-poc.vercel.app/download/${fileId}`,
      expiresAt,
      size: fileBuffer.length,
      compressed: compressedBuffer.length,
      compressionRatio: parseFloat(compressionRatio),
      sha256,
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    res.status(500).json({
      error: 'アップロード処理に失敗しました',
      details: error.message,
    });
  }
}
module.exports = handler;