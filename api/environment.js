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
    nodeEnv: process.env.NODE_ENV || 'development',
    // 🔧 SendGrid 設定を追加
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL,
    sendgridFromName: process.env.SENDGRID_FROM_NAME || '138DataGate'
  };
}

/**
 * 環境情報を取得（後方互換性のため残す）
 * @returns {Object}
 */
export function getEnvironmentInfo() {
  return getEnvironmentConfig();
}