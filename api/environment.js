// api/environment.js
// 環境判定ユーティリティ + 添付直送制御

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
 * Sandboxモードかどうか判定
 * @returns {boolean}
 */
export function isSandboxMode() {
  return process.env.SANDBOX_MODE === 'true';
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
    // SendGrid 設定
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL,
    sendgridFromName: process.env.SENDGRID_FROM_NAME || '138DataGate',
    // 添付直送設定
    enableDirectAttach: process.env.ENABLE_DIRECT_ATTACH === 'true',
    allowedDirectDomains: process.env.ALLOWED_DIRECT_DOMAINS || '',
    directAttachMaxSize: parseInt(process.env.DIRECT_ATTACH_MAX_SIZE || '10485760', 10)
  };
}

/**
 * 環境情報を取得（後方互換性のため残す）
 * @returns {Object}
 */
export function getEnvironmentInfo() {
  return getEnvironmentConfig();
}

// ========================================
// 添付直送機能の制御関数
// ========================================

/**
 * 添付直送機能が有効かどうか判定
 * @returns {boolean}
 */
export function isDirectAttachEnabled() {
  // サンドボックスモード（Preview/Dev）では常に無効
  if (isSandboxMode() || !isProduction()) {
    return false;
  }

  // 本番環境でも環境変数で制御
  return process.env.ENABLE_DIRECT_ATTACH === 'true';
}

/**
 * 許可ドメインリストを取得
 * @returns {string[]}
 */
export function getAllowedDirectDomains() {
  const domainsStr = process.env.ALLOWED_DIRECT_DOMAINS || '';
  if (!domainsStr) return [];

  return domainsStr
    .split(',')
    .map(d => d.trim())
    .filter(d => d.length > 0);
}

/**
 * 添付直送の最大ファイルサイズを取得
 * @returns {number}
 */
export function getDirectAttachMaxSize() {
  const sizeStr = process.env.DIRECT_ATTACH_MAX_SIZE || '10485760';
  const size = parseInt(sizeStr, 10);
  return isNaN(size) ? 10485760 : size;
}

/**
 * メールアドレスのドメインが許可リストに含まれるか判定
 * @param {string} email
 * @returns {boolean}
 */
export function isEmailDomainAllowed(email) {
  if (!email || typeof email !== 'string') return false;

  const allowedDomains = getAllowedDirectDomains();
  if (allowedDomains.length === 0) return false;

  // メールアドレスからドメイン部分を抽出
  const emailDomain = email.toLowerCase().split('@')[1];
  if (!emailDomain) return false;

  // 許可リストと照合
  return allowedDomains.some(allowed => {
    const domain = allowed.toLowerCase();
    // '@example.com' 形式と 'example.com' 形式の両方に対応
    if (domain.startsWith('@')) {
      return domain === `@${emailDomain}`;
    } else {
      return domain === emailDomain;
    }
  });
}

/**
 * ファイルサイズが添付直送の上限以下か判定
 * @param {number} fileSize
 * @returns {boolean}
 */
export function isFileSizeAllowedForDirectAttach(fileSize) {
  if (typeof fileSize !== 'number' || fileSize < 0) return false;
  const maxSize = getDirectAttachMaxSize();
  return fileSize <= maxSize;
}

/**
 * 添付直送を使用できるか総合判定
 * @param {string} recipientEmail
 * @param {number} fileSize
 * @returns {Object}
 */
export function canUseDirectAttach(recipientEmail, fileSize) {
  // 1. 機能が有効か（サンドボックス判定含む）
  if (!isDirectAttachEnabled()) {
    return {
      allowed: false,
      reason: isSandboxMode() || !isProduction() ? 'sandbox_mode' : 'feature_disabled'
    };
  }

  // 2. ドメインが許可されているか
  if (!isEmailDomainAllowed(recipientEmail)) {
    return {
      allowed: false,
      reason: 'domain_not_allowed'
    };
  }

  // 3. ファイルサイズが上限以下か
  if (!isFileSizeAllowedForDirectAttach(fileSize)) {
    return {
      allowed: false,
      reason: 'size_exceeded'
    };
  }

  // すべての条件を満たす
  return {
    allowed: true,
    reason: null
  };
}