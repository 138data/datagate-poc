// api/kpi/check-alerts.js
// Phase 21: KPIアラートチェックAPI（Cron Job用）

import { kv } from '@vercel/kv';
import nodemailer from 'nodemailer';

// アラート閾値設定
const ALERT_THRESHOLDS = {
  errorRate: 5.0,              // エラー率 5% 以上
  storageUsage: 80.0,          // ストレージ使用率 80% 以上
  uploadSuccessRate: 90.0,     // アップロード成功率 90% 未満
  downloadSuccessRate: 90.0,   // ダウンロード成功率 90% 未満
};

// SMTPトランスポーター設定
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// アラートメール送信
async function sendAlertEmail(alerts) {
  try {
    const transporter = createTransporter();
    
    const alertList = alerts.map(alert => 
      `- ${alert.name}: ${alert.value} (閾値: ${alert.threshold})`
    ).join('\n');

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.ALERT_EMAIL || process.env.SMTP_FROM,
      subject: '【138DataGate】システムアラート - 閾値超過検知',
      text: `
138DataGate システムアラート

以下のKPI指標が閾値を超えました：

${alertList}

システムを確認してください。

━━━━━━━━━━━━━━━━━━━━━━━━
管理画面: ${process.env.VERCEL_URL || 'https://datagate-gasvh1wc3-138datas-projects.vercel.app'}/admin-login.html
送信日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
━━━━━━━━━━━━━━━━━━━━━━━━
      `,
    };

    await transporter.sendMail(mailOptions);
    
    return {
      success: true,
      message: 'アラートメール送信成功',
    };
  } catch (error) {
    console.error('アラートメール送信エラー:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// KPI計算
async function calculateKPI() {
  try {
    // KVから統計データを取得
    const stats = await kv.get('system:stats') || {
      uploads: { success: 0, failed: 0, totalTime: 0 },
      downloads: { success: 0, failed: 0, totalTime: 0 },
      api: { requests: 0, totalResponseTime: 0 },
      errors: { count: 0 },
      storage: { used: 0, total: 10737418240 }, // 10GB
    };

    // KPI計算
    const totalUploads = stats.uploads.success + stats.uploads.failed;
    const uploadSuccessRate = totalUploads > 0 
      ? (stats.uploads.success / totalUploads) * 100 
      : 100;

    const totalDownloads = stats.downloads.success + stats.downloads.failed;
    const downloadSuccessRate = totalDownloads > 0
      ? (stats.downloads.success / totalDownloads) * 100
      : 100;

    const totalRequests = stats.api.requests || 1;
    const errorRate = (stats.errors.count / totalRequests) * 100;

    const storageUsage = (stats.storage.used / stats.storage.total) * 100;

    return {
      uploadSuccessRate: parseFloat(uploadSuccessRate.toFixed(2)),
      downloadSuccessRate: parseFloat(downloadSuccessRate.toFixed(2)),
      errorRate: parseFloat(errorRate.toFixed(2)),
      storageUsage: parseFloat(storageUsage.toFixed(2)),
    };
  } catch (error) {
    console.error('KPI計算エラー:', error);
    return null;
  }
}

// メインハンドラー
export default async function handler(req, res) {
  // CRON認証チェック
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({
      success: false,
      error: '不正なCronシークレット',
    });
  }

  try {
    // KPI取得
    const kpi = await calculateKPI();

    if (!kpi) {
      return res.status(500).json({
        success: false,
        error: 'KPI計算に失敗しました',
      });
    }

    // アラートチェック
    const alerts = [];

    if (kpi.errorRate > ALERT_THRESHOLDS.errorRate) {
      alerts.push({
        name: 'エラー率',
        value: `${kpi.errorRate}%`,
        threshold: `${ALERT_THRESHOLDS.errorRate}%`,
      });
    }

    if (kpi.storageUsage > ALERT_THRESHOLDS.storageUsage) {
      alerts.push({
        name: 'ストレージ使用率',
        value: `${kpi.storageUsage}%`,
        threshold: `${ALERT_THRESHOLDS.storageUsage}%`,
      });
    }

    if (kpi.uploadSuccessRate < ALERT_THRESHOLDS.uploadSuccessRate) {
      alerts.push({
        name: 'アップロード成功率',
        value: `${kpi.uploadSuccessRate}%`,
        threshold: `${ALERT_THRESHOLDS.uploadSuccessRate}% 以上`,
      });
    }

    if (kpi.downloadSuccessRate < ALERT_THRESHOLDS.downloadSuccessRate) {
      alerts.push({
        name: 'ダウンロード成功率',
        value: `${kpi.downloadSuccessRate}%`,
        threshold: `${ALERT_THRESHOLDS.downloadSuccessRate}% 以上`,
      });
    }

    // アラートがある場合はメール送信
    let emailResult = null;
    if (alerts.length > 0) {
      emailResult = await sendAlertEmail(alerts);
    }

    // レスポンス
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      kpi,
      alerts: {
        count: alerts.length,
        items: alerts,
        emailSent: alerts.length > 0 ? emailResult : null,
      },
    });

  } catch (error) {
    console.error('アラートチェックエラー:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
