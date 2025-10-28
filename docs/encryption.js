// lib/encryption.js
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

/**
 * 環境変数から暗号化キーを取得（PBKDF2で派生）
 * @returns {Buffer} 派生された暗号化キー
 */
function getEncryptionKey() {
  const masterKey = process.env.FILE_ENCRYPT_KEY;
  if (!masterKey) {
    throw new Error('FILE_ENCRYPT_KEY environment variable is not set');
  }
  
  // PBKDF2で派生キーを生成
  const salt = Buffer.from('138datagate-static-salt', 'utf8');
  const key = crypto.pbkdf2Sync(masterKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
  return key;
}

/**
 * ファイルを暗号化
 * @param {Buffer} fileBuffer - 暗号化するファイルのBuffer
 * @returns {Object} { encryptedData: string, salt: string, iv: string, authTag: string }
 */
export function encryptFile(fileBuffer) {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(fileBuffer),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return {
      encryptedData: encrypted.toString('base64'),
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    };
  } catch (error) {
    console.error('[Encryption] Error encrypting file:', error);
    throw new Error(`Failed to encrypt file: ${error.message}`);
  }
}

/**
 * ファイルを復号化
 * @param {string} encryptedData - Base64エンコードされた暗号化データ
 * @param {string} salt - Base64エンコードされたソルト
 * @param {string} iv - Base64エンコードされたIV
 * @param {string} authTag - Base64エンコードされた認証タグ
 * @returns {Buffer} 復号化されたファイルのBuffer
 */
export function decryptFile(encryptedData, salt, iv, authTag) {
  try {
    const key = getEncryptionKey();
    const ivBuffer = Buffer.from(iv, 'base64');
    const authTagBuffer = Buffer.from(authTag, 'base64');
    const encryptedBuffer = Buffer.from(encryptedData, 'base64');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    
    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final()
    ]);
    
    return decrypted;
  } catch (error) {
    console.error('[Decryption] Error decrypting file:', error);
    throw new Error(`Failed to decrypt file: ${error.message}`);
  }
}

/**
 * 文字列を暗号化
 * @param {string} text - 暗号化する文字列
 * @returns {Object} { encrypted: string, salt: string, iv: string, authTag: string }
 */
export function encryptString(text) {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(text, 'utf8')),
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
    console.error('[Encryption] Error encrypting string:', error);
    throw new Error(`Failed to encrypt string: ${error.message}`);
  }
}

/**
 * 文字列を復号化
 * @param {string} encrypted - Base64エンコードされた暗号化データ
 * @param {string} salt - Base64エンコードされたソルト
 * @param {string} iv - Base64エンコードされたIV
 * @param {string} authTag - Base64エンコードされた認証タグ
 * @returns {string} 復号化された文字列
 */
export function decryptString(encrypted, salt, iv, authTag) {
  try {
    const key = getEncryptionKey();
    const ivBuffer = Buffer.from(iv, 'base64');
    const authTagBuffer = Buffer.from(authTag, 'base64');
    const encryptedBuffer = Buffer.from(encrypted, 'base64');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    
    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('[Decryption] Error decrypting string:', error);
    throw new Error(`Failed to decrypt string: ${error.message}`);
  }
}

/**
 * 暗号化キーを生成（開発/テスト用）
 * @returns {string} Base64エンコードされたランダムキー
 */
export function generateEncryptionKey() {
  return crypto.randomBytes(KEY_LENGTH).toString('base64');
}

/**
 * 6桁数値OTPを生成
 * @returns {string} 6桁の数値文字列
 */
export function generateOTP() {
  const num = Math.floor(100000 + Math.random() * 900000);
  return num.toString();
}
