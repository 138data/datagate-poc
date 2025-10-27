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
function isProduction() {
  return getEnvironment() === 'production';
}

/**
 * Preview環境かどうか判定
 * @returns {boolean}
 */
function isPreview() {
  return getEnvironment() === 'preview';
}

/**
 * 開発環境かどうか判定
 * @returns {boolean}
 */
function isDevelopment() {
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
 * 環境情報を取得
 * @returns {Object}
 */
function getEnvironmentInfo() {
  return {
    environment: getEnvironment(),
    isProduction: isProduction(),
    isPreview: isPreview(),
    isDevelopment: isDevelopment(),
    emailEnabled: isEmailEnabled(),
    sandboxMode: isSandboxMode(),
    vercelUrl: process.env.VERCEL_URL || 'localhost:3000',
    nodeEnv: process.env.NODE_ENV || 'development'
  };
}

module.exports = {
  getEnvironment,
  isProduction,
  isPreview,
  isDevelopment,
  isEmailEnabled,
  isSandboxMode,
  getEnvironmentInfo
};