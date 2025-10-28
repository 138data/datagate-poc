// lib/environment.js
// 環境判定ユーティリティ

/**
 * 現在の実行環境を取得
 * @returns {'production'|'preview'|'development'}
 */
function getEnvironment() {
  // Vercel環境変数から判定
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'preview';
  
  // ローカル開発環境
  return 'development';
}

/**
 * 本番環境かどうか判定
 * @returns {boolean}
 */
export function isProduction() {
  return getEnvironment() === 'production';
}

/**
 * Preview環境かどうか判定
 * @returns {boolean}
 */
export function isPreview() {
  return getEnvironment() === 'preview';
}

/**
 * 開発環境かどうか判定
 * @returns {boolean}
 */
export function isDevelopment() {
  return getEnvironment() === 'development';
}

/**
 * メール送信が有効かどうか判定
 * @returns {boolean}
 */
function isEmailEnabled() {
  // 本番環境では常に有効
  if (isProduction()) return true;
  
  // Preview/Development環境では環境変数で制御
  return process.env.ENABLE_EMAIL_SENDING === 'true';
}

/**
 * Sandboxモードかどうか判定
 * @returns {boolean}
 */
function isSandboxMode() {
  return process.env.SANDBOX_MODE === 'true';
}

/**
 * 環境設定を取得（統合版）
 * @returns {Object}
 */
export function getEnvironmentConfig() {
  const environment = getEnvironment();
  const sandboxMode = isSandboxMode();
  const enableEmailSending = isEmailEnabled();
  
  // Base URLの決定
  let baseUrl;
  if (process.env.VERCEL_URL) {
    baseUrl = `https://${process.env.VERCEL_URL}`;
  } else {
    baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  }
  
  return {
    environment,
    isProduction: environment === 'production',
    isPreview: environment === 'preview',
    isDevelopment: environment === 'development',
    enableEmailSending,
    sandboxMode,
    baseUrl,
    vercelUrl: process.env.VERCEL_URL || 'localhost:3000',
    nodeEnv: process.env.NODE_ENV || 'development'
  };
}

/**
 * 環境情報を取得（後方互換性のため残す）
 * @returns {Object}
 */
export function getEnvironmentInfo() {
  return getEnvironmentConfig();
}

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