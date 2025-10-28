/**
 * 添付直送機能が有効かどうか判定
 * @param {string} recipientEmail - 受信者のメールアドレス（例: datagate@138io.com）
 * @returns {boolean}
 */
export function canUseDirectAttach(recipientEmail) {
  // 機能が無効の場合
  if (process.env.ENABLE_DIRECT_ATTACH !== 'true') {
    return false;
  }
  
  // Sandboxモードでは無効
  if (isSandboxMode()) {
    return false;
  }
  
  // 許可ドメインリストを取得
  const allowedDomains = (process.env.ALLOWED_DIRECT_DOMAINS || '')
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(d => d.length > 0);
  
  // 許可ドメインが設定されていない場合は無効
  if (allowedDomains.length === 0) {
    return false;
  }
  
  // メールアドレスからドメイン部分を抽出（@を含む）
  const emailLower = recipientEmail.toLowerCase();
  const atIndex = emailLower.indexOf('@');
  
  if (atIndex === -1) {
    return false;
  }
  
  const emailDomain = emailLower.substring(atIndex); // @138io.com
  
  // 受信者ドメインが許可リストに含まれているか確認
  return allowedDomains.includes(emailDomain);
}