# バックアップ作成
Copy-Item service\email\send.js service\email\send.js.backup

# 修正版を作成
@'
// service/email/send.js
// Phase 41: 添付直送機能の中核メール送信サービス

const sg = require('@sendgrid/mail');
const { kv } = require('@vercel/kv');

// 環境変数
const {
  SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL,
  SENDGRID_FROM_NAME = '138DataGate',
  ENABLE_DIRECT_ATTACH,
  MAIL_SANDBOX,
  ALLOWED_DIRECT_DOMAINS = '@138io.com,@138data.com',
  DIRECT_ATTACH_MAX_SIZE = '4718592'
} = process.env;

// SendGrid 初期化
if (!SENDGRID_API_KEY) {
  console.error('[service/email/send] ERROR: SENDGRID_API_KEY is not set');
}
sg.setApiKey(SENDGRID_API_KEY || '');

/**
 * 許可ドメインチェック
 * @param {string} toEmail - 送信先メールアドレス
 * @returns {boolean} 許可ドメインの場合 true
 */
function isAllowedDomain(toEmail) {
  const allow = (ALLOWED_DIRECT_DOMAINS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  
  const email = (toEmail || '').toLowerCase();
  return allow.some(suffix => email.endsWith(suffix));
}

/**
 * 監査ログ保存
 * @param {object} entry - ログエントリ
 * @returns {Promise<void>}
 */
async function auditLog(entry) {
  try {
    const key = 'audit:' + Date.now() + ':' + entry.fileId;
    const value = JSON.stringify({
      ts: new Date().toISOString(),
      event: 'email_send',
      ...entry
    });
    
    await kv.set(key, value, { ex: 60 * 60 * 24 * 30 });
    
    console.log('[service/email/send] Audit log saved:', key);
  } catch (err) {
    console.error('[service/email/send] Audit log error:', err.message);
  }
}

/**
 * セキュアメール送信
 * @param {object} options - 送信オプション
 * @param {string} options.to - 送信先メールアドレス
 * @param {string} options.subject - 件名
 * @param {string} options.text - 本文（プレーンテキスト）
 * @param {string} options.fileId - ファイルID
 * @param {string} options.fileName - ファイル名
 * @param {number} options.fileSize - ファイルサイズ（bytes）
 * @param {Buffer} options.decryptedBuffer - 復号化済みファイルバッファ（添付直送時のみ必要）
 * @param {string} options.downloadUrl - ダウンロードURL（リンク送付時）
 * @param {string} options.otp - OTP（リンク送付時）
 * @returns {Promise<{mode: string, reason: string}>}
 */
async function sendMailSecure(options) {
  const {
    to,
    subject,
    text,
    fileId,
    fileName,
    fileSize,
    decryptedBuffer,
    downloadUrl,
    otp
  } = options;

  let mode = 'link';
  let reason = 'default_policy_link';

  const enableDirectAttach = (ENABLE_DIRECT_ATTACH === 'true');
  const sandbox = (MAIL_SANDBOX === 'true');
  const allowedDomain = isAllowedDomain(to);
  const sizeOk = decryptedBuffer && (decryptedBuffer.length <= Number(DIRECT_ATTACH_MAX_SIZE));

  console.log('[service/email/send] Conditions check:', {
    to,
    fileId,
    enableDirectAttach,
    sandbox,
    allowedDomain,
    sizeOk,
    hasBuffer: !!decryptedBuffer,
    bufferLength: decryptedBuffer?.length,
    maxSize: DIRECT_ATTACH_MAX_SIZE
  });

  if (sandbox) {
    mode = 'link';
    reason = 'sandbox_link_forced';
    console.log('[service/email/send] Sandbox mode: forced link');
  } else if (!enableDirectAttach) {
    mode = 'link';
    reason = 'feature_disabled';
    console.log('[service/email/send] Direct attach disabled: link mode');
  } else if (!allowedDomain) {
    mode = 'link';
    reason = 'domain_not_allowed';
    console.log('[service/email/send] Domain not allowed:', to);
  } else if (!sizeOk) {
    mode = 'link';
    reason = 'size_over_threshold';
    console.log('[service/email/send] File size over threshold');
  } else if (enableDirectAttach && allowedDomain && sizeOk && decryptedBuffer) {
    mode = 'attach';
    reason = 'allowed_domain_and_size';
    console.log('[service/email/send] Direct attach mode enabled');
  }

  const msgBase = {
    to,
    from: { 
      email: SENDGRID_FROM_EMAIL, 
      name: SENDGRID_FROM_NAME 
    },
    subject: subject || 'セキュアファイル送信',
    headers: { 
      'X-DataGate-Mode': mode,
      'X-DataGate-FileId': fileId
    }
  };

  try {
    if (mode === 'attach' && decryptedBuffer) {
      console.log('[service/email/send] Sending with attachment:', fileName);
      
      const content = decryptedBuffer.toString('base64');
      
      await sg.send({
        ...msgBase,
        text: text || 'セキュア添付ファイルを送信しました。',
        html: `<p>セキュア添付ファイルを送信しました。</p><p>ファイル名: <strong>${fileName}</strong></p>`,
        attachments: [{
          content,
          filename: fileName,
          type: 'application/octet-stream',
          disposition: 'attachment',
          content_id: fileId
        }]
      });
      
      console.log('[service/email/send] Attachment sent successfully');
      
    } else {
      console.log('[service/email/send] Sending with link:', downloadUrl);
      
      const bodyText = [
        'セキュアファイルをお送りします。',
        '',
        'ダウンロードURL:',
        downloadUrl || '（URLが生成されませんでした）',
        '',
        '認証コード（OTP）:',
        otp || '（OTPが生成されませんでした）',
        '',
        '※ このリンクは7日間有効です。',
        '※ ダウンロードは最大3回までです。'
      ].join('\n');
      
      const bodyHtml = `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2>セキュアファイル送信</h2>
          <p>セキュアファイルをお送りします。</p>
          
          <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p><strong>ファイル名:</strong> ${fileName}</p>
            <p><strong>ダウンロードURL:</strong><br>
              <a href="${downloadUrl}" style="color: #0066cc; word-break: break-all;">${downloadUrl}</a>
            </p>
            <p><strong>認証コード（OTP）:</strong> <code style="font-size: 18px; background: #fff; padding: 5px 10px; border-radius: 3px;">${otp}</code></p>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            ※ このリンクは7日間有効です。<br>
            ※ ダウンロードは最大3回までです。
          </p>
        </div>
      `;
      
      await sg.send({
        ...msgBase,
        text: bodyText,
        html: bodyHtml
      });
      
      console.log('[service/email/send] Link sent successfully');
    }

    await auditLog({
      fileId,
      fileName,
      fileSize,
      to,
      mode,
      reason,
      status: 'success'
    });

    return { mode, reason };
    
  } catch (err) {
    console.error('[service/email/send] SendGrid error:', err.message);
    
    await auditLog({
      fileId,
      fileName,
      fileSize,
      to,
      mode,
      reason,
      status: 'error',
      error: err.message
    });
    
    throw err;
  }
}

module.exports = { sendMailSecure, isAllowedDomain };
'@ | Out-File -FilePath service\email\send.js -Encoding UTF8

Write-Host "✅ service/email/send.js を更新しました" -ForegroundColor Green