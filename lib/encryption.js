/**
 * 暗号化ユーティリティ
 * AES-256-GCM + PBKDF2によるファイル暗号化
 */

import crypto from 'crypto';

// 環境変数から暗号鍵を取得
const MASTER_KEY = process.env.FILE_ENCRYPT_KEY || 'default-master-key-change-in-production';

/**
 * マスターキーから派生鍵を生成
 * @param {Buffer} salt - ランダムソルト
 * @returns {Buffer} 派生鍵（32バイト）
 */
function deriveKey(salt) {
  return crypto.pbkdf2Sync(
    MASTER_KEY,
    salt,
    100000,  // 反復回数（OWASP推奨）
    32,      // キー長（256bit）
    'sha256'
  );
}

/**
 * ファイルを暗号化
 * @param {Buffer} fileBuffer - 暗号化するファイルデータ
 * @returns {Object} { encryptedData, salt, iv, authTag }
 */
export function encryptFile(fileBuffer) {
  try {
    // ランダムなsaltとIVを生成
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    
    // 派生鍵を生成
    const key = deriveKey(salt);
    
    // AES-256-GCM暗号化
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(fileBuffer),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return {
      encryptedData: encrypted,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    };
  } catch (error) {
    console.error('暗号化エラー:', error);
    throw new Error('ファイルの暗号化に失敗しました');
  }
}

/**
 * ファイルを復号
 * @param {Buffer} encryptedData - 暗号化されたデータ
 * @param {string} salt - Base64エンコードされたsalt
 * @param {string} iv - Base64エンコードされたIV
 * @param {string} authTag - Base64エンコードされた認証タグ
 * @returns {Buffer} 復号されたファイルデータ
 */
export function decryptFile(encryptedData, salt, iv, authTag) {
  try {
    // Base64デコード
    const saltBuffer = Buffer.from(salt, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');
    const authTagBuffer = Buffer.from(authTag, 'base64');
    
    // 派生鍵を生成
    const key = deriveKey(saltBuffer);
    
    // AES-256-GCM復号
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    
    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);
    
    return decrypted;
  } catch (error) {
    console.error('復号エラー:', error);
    throw new Error('ファイルの復号に失敗しました');
  }
}

/**
 * 文字列を暗号化（メタデータ用）
 * @param {string} text - 暗号化する文字列
 * @returns {Object} { encrypted, salt, iv, authTag }
 */
export function encryptString(text) {
  try {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    const key = deriveKey(salt);
    
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted: encrypted.toString('base64'),
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    };
  } catch (error) {
    console.error('文字列暗号化エラー:', error);
    throw new Error('文字列の暗号化に失敗しました');
  }
}

/**
 * 文字列を復号（メタデータ用）
 * @param {string} encrypted - Base64エンコードされた暗号化文字列
 * @param {string} salt - Base64エンコードされたsalt
 * @param {string} iv - Base64エンコードされたIV
 * @param {string} authTag - Base64エンコードされた認証タグ
 * @returns {string} 復号された文字列
 */
export function decryptString(encrypted, salt, iv, authTag) {
  try {
    const encryptedBuffer = Buffer.from(encrypted, 'base64');
    const saltBuffer = Buffer.from(salt, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');
    const authTagBuffer = Buffer.from(authTag, 'base64');
    
    const key = deriveKey(saltBuffer);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    
    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('文字列復号エラー:', error);
    throw new Error('文字列の復号に失敗しました');
  }
}

/**
 * 暗号化キーを生成（初期セットアップ用）
 * @returns {string} Hex形式の64文字ランダム文字列
 */
export function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}