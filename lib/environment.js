// lib/environment.js
const asBool = (v) => /^true|1|yes|on$/i.test(String(v||'').trim());

function canUseDirectAttach(recipientEmail, fileSize) {
  // メール送信が無効なら添付しない
  if (!asBool(process.env.ENABLE_EMAIL_SENDING)) {
    return false;
  }
  
  // サンドボックスモードでは添付しない
  if (process.env.MAIL_SANDBOX === 'true') {
    console.log('[canUseDirectAttach] Sandbox mode - no attachments');
    return false;
  }
  
  // ファイルサイズ制限（10MB）
  const maxSize = 10 * 1024 * 1024;
  if (fileSize > maxSize) {
    console.log('[canUseDirectAttach] File too large:', fileSize);
    return false;
  }
  
  // デフォルトはリンクモード（添付しない）
  return false;
}

module.exports = { canUseDirectAttach };
