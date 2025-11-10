import { kv } from '@vercel/kv';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  // CORS ヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 認証チェック
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  const token = authHeader.split(' ')[1];
  let decoded;

  try {
    decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ error: '無効なトークンです' });
  }

  // 管理者権限チェック
  if (decoded.role !== 'admin') {
    return res.status(403).json({ error: '権限がありません。この操作は管理者のみ実行できます。' });
  }

  try {
    // 過去24時間のタイムスタンプ
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    // アップロード監査ログ取得
    const uploadKeys = await kv.keys('audit:upload:*');
    const uploadLogs = await Promise.all(
      uploadKeys.map(async (key) => {
        const log = await kv.get(key);
        return log;
      })
    );

    // 過去24時間のログのみフィルタ
    const recentUploads = uploadLogs.filter(log => log && log.timestamp >= oneDayAgo);
    const successUploads = recentUploads.filter(log => log.success === true);
    const uploadSuccessRate = recentUploads.length > 0 
      ? ((successUploads.length / recentUploads.length) * 100).toFixed(2)
      : 100;

    // ダウンロード監査ログ取得
    const downloadKeys = await kv.keys('audit:download:*');
    const downloadLogs = await Promise.all(
      downloadKeys.map(async (key) => {
        const log = await kv.get(key);
        return log;
      })
    );

    const recentDownloads = downloadLogs.filter(log => log && log.timestamp >= oneDayAgo);
    const successDownloads = recentDownloads.filter(log => log.success === true);
    const downloadSuccessRate = recentDownloads.length > 0
      ? ((successDownloads.length / recentDownloads.length) * 100).toFixed(2)
      : 100;

    // 処理時間計算（p95）
    const processingTimes = recentUploads
      .filter(log => log.processingTime)
      .map(log => log.processingTime)
      .sort((a, b) => a - b);

    const p95Time = processingTimes.length > 0
      ? processingTimes[Math.floor(processingTimes.length * 0.95)]
      : 0;

    // エラー率計算
    const totalRequests = recentUploads.length + recentDownloads.length;
    const errorCount = recentUploads.filter(log => !log.success).length +
                       recentDownloads.filter(log => !log.success).length;
    const errorRate = totalRequests > 0
      ? ((errorCount / totalRequests) * 100).toFixed(2)
      : 0;

    // メール配信率（現時点では手動入力用にプレースホルダー）
    const emailDeliveryRate = 96.5;

    // KPI データ返却
    return res.status(200).json({
      success: true,
      data: {
        uploadSuccessRate: parseFloat(uploadSuccessRate),
        downloadSuccessRate: parseFloat(downloadSuccessRate),
        p95ProcessingTime: p95Time,
        errorRate: parseFloat(errorRate),
        emailDeliveryRate: emailDeliveryRate,
        period: '24h',
        lastUpdated: new Date().toISOString(),
        stats: {
          totalUploads: recentUploads.length,
          totalDownloads: recentDownloads.length,
          successUploads: successUploads.length,
          successDownloads: successDownloads.length
        }
      }
    });

  } catch (error) {
    console.error('KPI取得エラー:', error);
    return res.status(500).json({ 
      error: 'KPIデータの取得に失敗しました',
      details: error.message 
    });
  }
}
