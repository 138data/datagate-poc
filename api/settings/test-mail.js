/**
 * チE��トメール送信API�E�EMTP専用�E�E * レート制陁E 3囁E5刁E */

import nodemailer from 'nodemailer';
import { withGuard } from '../../lib/guard.js';

async function testMailHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to } = req.body;

  if (!to) {
    return res.status(400).json({ error: '送信先メールアドレスが忁E��でぁE });
  }

  try {
    // 環墁E��数チェチE��
    const requiredEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('❁ESMTP設定が不完�Eです。不足:', missingVars.join(', '));
      return res.status(500).json({
        success: false,
        error: 'SMTP設定が不完�EでぁE,
        missing: missingVars
      });
    }

    const smtpPort = parseInt(process.env.SMTP_PORT);

    // SMTP設宁E    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    
    console.log('📧 チE��トメール送信中...', to);
    
    // メール送信
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: to,
      subject: '、E38DataGate】テストメール送信',
      text: `
これはチE��トメールです、E138DataGateのSMTP設定が正しく動作してぁE��す、E
送信日晁E ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
送信允E ${process.env.SMTP_FROM}
SMTPサーバ�E: ${process.env.SMTP_HOST}

---
138DataGate - PPAP離脱ソフト
      `.trim(),
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>✁EチE��トメール送信成功</h2>
          <p>138DataGateのSMTP設定が正しく動作してぁE��す、E/p>
          
          <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <strong>送信惁E��:</strong><br>
            送信日晁E ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}<br>
            送信允E ${process.env.SMTP_FROM}<br>
            SMTPサーバ�E: ${process.env.SMTP_HOST}
          </div>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="font-size: 12px; color: #999;">
            138DataGate - PPAP離脱ソフト
          </p>
        </div>
      `
    });

    console.log('✁EチE��トメール送信成功:', info.messageId);

    res.status(200).json({
      success: true,
      message: 'チE��トメールを送信しました',
      messageId: info.messageId,
      to: to
    });

  } catch (error) {
    console.error('❁EチE��トメール送信エラー:', error);
    
    let errorMessage = 'チE��トメール送信に失敗しました';
    
    if (error.code === 'EAUTH') {
      errorMessage = 'SMTP認証に失敗しました。ユーザー名とパスワードを確認してください、E;
    } else if (error.code === 'ECONNECTION') {
      errorMessage = 'SMTPサーバ�Eへの接続に失敗しました。�Eスト名とポ�Eト番号を確認してください、E;
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'SMTPサーバ�Eへの接続がタイムアウトしました、E;
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.message
    });
  }
}

// withGuardでラチE�Eしてレート制限を適用
export default withGuard(testMailHandler, {
  route: '/api/settings/test-mail',
  requireAuth: true,
  checkIP: false,
  rateLimit: true,
  cap: 3,
  ttl: 300,
  logAccess: true
});
