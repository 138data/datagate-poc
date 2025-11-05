/**
 * Policy Manager - KVベースの動的ポリシー管理
 * Phase 43-Step 1: サイズ閾値の動的調整機能
 * 
 * 機能:
 * - ポリシーの取得・更新・削除
 * - デフォルト値の管理
 * - バリデーション
 * - 変更履歴の記録
 */

import { kv } from '@vercel/kv';

/**
 * ポリシーのデフォルト値
 */
const DEFAULT_POLICY = {
  // 添付直送機能の有効化
  enableDirectAttach: false,
  
  // 添付直送の最大サイズ（バイト）
  directAttachMaxSize: 4718592, // 4.5MB
  
  // 許可ドメインのリスト（カンマ区切り）
  allowedDirectDomains: '@138io.com,@138data.com',
  
  // ダウンロード回数制限
  maxDownloads: 3,
  
  // ファイル保持期間（秒）
  fileTTL: 604800, // 7日
  
  // OTP有効期限（秒）
  otpTTL: 900, // 15分
  
  // OTP失敗回数上限
  otpMaxAttempts: 5,
  
  // OTP失敗時のロックアウト時間（秒）
  otpLockoutDuration: 900, // 15分
  
  // 最終更新日時
  lastUpdated: Date.now(),
  
  // 更新者
  updatedBy: 'system'
};

/**
 * バリデーションルール
 */
const VALIDATION_RULES = {
  enableDirectAttach: {
    type: 'boolean',
    required: true
  },
  directAttachMaxSize: {
    type: 'number',
    min: 1048576, // 1MB
    max: 10485760, // 10MB
    required: true
  },
  allowedDirectDomains: {
    type: 'string',
    pattern: /^(@[\w\.-]+\.[\w]+)(,@[\w\.-]+\.[\w]+)*$/,
    required: true
  },
  maxDownloads: {
    type: 'number',
    min: 1,
    max: 100,
    required: true
  },
  fileTTL: {
    type: 'number',
    min: 86400, // 1日
    max: 2592000, // 30日
    required: true
  },
  otpTTL: {
    type: 'number',
    min: 300, // 5分
    max: 3600, // 1時間
    required: true
  },
  otpMaxAttempts: {
    type: 'number',
    min: 3,
    max: 10,
    required: true
  },
  otpLockoutDuration: {
    type: 'number',
    min: 300, // 5分
    max: 3600, // 1時間
    required: true
  }
};

/**
 * ポリシーの取得
 * @returns {Promise<Object>} 現在のポリシー
 */
export async function getPolicy() {
  try {
    const policy = await kv.get('system:policy');
    
    if (!policy) {
      // ポリシーが存在しない場合はデフォルト値を保存して返す
      await kv.set('system:policy', DEFAULT_POLICY);
      return DEFAULT_POLICY;
    }
    
    // デフォルト値とマージ（新しいフィールドが追加された場合に対応）
    return {
      ...DEFAULT_POLICY,
      ...policy
    };
  } catch (error) {
    console.error('Failed to get policy:', error);
    // エラー時はデフォルト値を返す
    return DEFAULT_POLICY;
  }
}

/**
 * ポリシーの更新
 * @param {Object} updates - 更新する項目
 * @param {string} updatedBy - 更新者
 * @returns {Promise<Object>} 更新後のポリシー
 */
export async function updatePolicy(updates, updatedBy = 'admin') {
  try {
    // バリデーション
    const errors = validatePolicy(updates);
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }
    
    // 現在のポリシーを取得
    const currentPolicy = await getPolicy();
    
    // 更新内容をマージ
    const newPolicy = {
      ...currentPolicy,
      ...updates,
      lastUpdated: Date.now(),
      updatedBy
    };
    
    // KVに保存
    await kv.set('system:policy', newPolicy);
    
    // 変更履歴を記録
    await savePolicyHistory(currentPolicy, newPolicy, updatedBy);
    
    return newPolicy;
  } catch (error) {
    console.error('Failed to update policy:', error);
    throw error;
  }
}

/**
 * ポリシーのバリデーション
 * @param {Object} policy - バリデーション対象のポリシー
 * @returns {Array<string>} エラーメッセージの配列
 */
function validatePolicy(policy) {
  const errors = [];
  
  for (const [key, value] of Object.entries(policy)) {
    const rule = VALIDATION_RULES[key];
    
    if (!rule) {
      // バリデーションルールが定義されていない項目はスキップ
      continue;
    }
    
    // 型チェック
    if (rule.type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`${key} must be a boolean`);
      continue;
    }
    
    if (rule.type === 'number') {
      if (typeof value !== 'number' || isNaN(value)) {
        errors.push(`${key} must be a number`);
        continue;
      }
      
      // 最小値チェック
      if (rule.min !== undefined && value < rule.min) {
        errors.push(`${key} must be at least ${rule.min}`);
      }
      
      // 最大値チェック
      if (rule.max !== undefined && value > rule.max) {
        errors.push(`${key} must be at most ${rule.max}`);
      }
    }
    
    if (rule.type === 'string') {
      if (typeof value !== 'string') {
        errors.push(`${key} must be a string`);
        continue;
      }
      
      // パターンチェック
      if (rule.pattern && !rule.pattern.test(value)) {
        errors.push(`${key} format is invalid`);
      }
    }
  }
  
  return errors;
}

/**
 * ポリシー変更履歴の保存
 * @param {Object} oldPolicy - 変更前のポリシー
 * @param {Object} newPolicy - 変更後のポリシー
 * @param {string} updatedBy - 更新者
 */
async function savePolicyHistory(oldPolicy, newPolicy, updatedBy) {
  try {
    const timestamp = Date.now();
    const changes = {};
    
    // 変更された項目を抽出
    for (const key of Object.keys(newPolicy)) {
      if (key === 'lastUpdated' || key === 'updatedBy') {
        continue;
      }
      
      if (JSON.stringify(oldPolicy[key]) !== JSON.stringify(newPolicy[key])) {
        changes[key] = {
          old: oldPolicy[key],
          new: newPolicy[key]
        };
      }
    }
    
    // 変更がない場合は保存しない
    if (Object.keys(changes).length === 0) {
      return;
    }
    
    const historyEntry = {
      timestamp,
      updatedBy,
      changes
    };
    
    // 履歴を保存（14日間保持）
    await kv.set(`policy:history:${timestamp}`, historyEntry, { ex: 1209600 });
    
  } catch (error) {
    console.error('Failed to save policy history:', error);
    // 履歴保存の失敗は致命的ではないため、エラーを投げない
  }
}

/**
 * ポリシー変更履歴の取得
 * @param {number} limit - 取得する履歴の最大件数
 * @returns {Promise<Array>} 変更履歴の配列
 */
export async function getPolicyHistory(limit = 20) {
  try {
    const keys = await kv.keys('policy:history:*');
    
    // タイムスタンプでソート（新しい順）
    keys.sort((a, b) => {
      const tsA = parseInt(a.split(':')[2]);
      const tsB = parseInt(b.split(':')[2]);
      return tsB - tsA;
    });
    
    // 指定件数まで取得
    const historyKeys = keys.slice(0, limit);
    const histories = [];
    
    for (const key of historyKeys) {
      const history = await kv.get(key);
      if (history) {
        histories.push(history);
      }
    }
    
    return histories;
  } catch (error) {
    console.error('Failed to get policy history:', error);
    return [];
  }
}

/**
 * ポリシーのリセット（デフォルト値に戻す）
 * @param {string} updatedBy - 更新者
 * @returns {Promise<Object>} リセット後のポリシー
 */
export async function resetPolicy(updatedBy = 'admin') {
  try {
    const currentPolicy = await getPolicy();
    
    const resetPolicy = {
      ...DEFAULT_POLICY,
      lastUpdated: Date.now(),
      updatedBy
    };
    
    await kv.set('system:policy', resetPolicy);
    await savePolicyHistory(currentPolicy, resetPolicy, updatedBy);
    
    return resetPolicy;
  } catch (error) {
    console.error('Failed to reset policy:', error);
    throw error;
  }
}

/**
 * ポリシーのエクスポート（JSON形式）
 * @returns {Promise<string>} JSON文字列
 */
export async function exportPolicy() {
  try {
    const policy = await getPolicy();
    return JSON.stringify(policy, null, 2);
  } catch (error) {
    console.error('Failed to export policy:', error);
    throw error;
  }
}

/**
 * ポリシーのインポート（JSON形式）
 * @param {string} jsonString - インポートするJSON文字列
 * @param {string} updatedBy - 更新者
 * @returns {Promise<Object>} インポート後のポリシー
 */
export async function importPolicy(jsonString, updatedBy = 'admin') {
  try {
    const importedPolicy = JSON.parse(jsonString);
    
    // バリデーション
    const errors = validatePolicy(importedPolicy);
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }
    
    return await updatePolicy(importedPolicy, updatedBy);
  } catch (error) {
    console.error('Failed to import policy:', error);
    throw error;
  }
}