const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const ITERATIONS = 100000;

/**
 * ファイルを暗号化
 */
function encryptFile(fileBuffer) {
  try {
    // ランダムなsaltとIVを生成
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // PBKDF2でキーを導出
    const key = crypto.pbkdf2Sync(
      process.env.FILE_ENCRYPT_KEY,
      salt,
      ITERATIONS,
      KEY_LENGTH,
      'sha256'
    );
    
    // 暗号化
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
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
    console.error('Encryption error:', error);
    throw new Error('ファイルの暗号化に失敗しました');
  }
}

/**
 * ファイルを復号化
 */
function decryptFile(encryptedData, salt, iv, authTag) {
  try {
    // Base64デコード
    const saltBuffer = Buffer.from(salt, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');
    const authTagBuffer = Buffer.from(authTag, 'base64');
    
    // PBKDF2でキーを導出
    const key = crypto.pbkdf2Sync(
      process.env.FILE_ENCRYPT_KEY,
      saltBuffer,
      ITERATIONS,
      KEY_LENGTH,
      'sha256'
    );
    
    // 復号化
    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    
    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('ファイルの復号化に失敗しました');
  }
}

/**
 * 文字列を暗号化
 */
function encryptString(text) {
  try {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.pbkdf2Sync(
      process.env.FILE_ENCRYPT_KEY,
      salt,
      ITERATIONS,
      KEY_LENGTH,
      'sha256'
    );
    
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
    console.error('String encryption error:', error);
    throw new Error('文字列の暗号化に失敗しました');
  }
}

/**
 * 文字列を復号化
 */
function decryptString(encrypted, salt, iv, authTag) {
  try {
    const encryptedBuffer = Buffer.from(encrypted, 'base64');
    const saltBuffer = Buffer.from(salt, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');
    const authTagBuffer = Buffer.from(authTag, 'base64');
    
    const key = crypto.pbkdf2Sync(
      process.env.FILE_ENCRYPT_KEY,
      saltBuffer,
      ITERATIONS,
      KEY_LENGTH,
      'sha256'
    );
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    
    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('String decryption error:', error);
    throw new Error('文字列の復号化に失敗しました');
  }
}

/**
 * 暗号化キーを生成
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 6桁のOTPを生成
 */
function generateOTP() {
  const num = Math.floor(100000 + Math.random() * 900000);
  return num.toString();
}

/**
 * OTPを検証
 * @param {string} inputOTP - ユーザーが入力したOTP
 * @param {string} storedOTP - サーバーに保存されているOTP
 * @returns {boolean} - OTPが一致する場合true
 */
function verifyOTP(inputOTP, storedOTP) {
  if (!inputOTP || !storedOTP) {
    return false;
  }
  
  // 文字列として比較（数値の先頭ゼロ対応）
  return inputOTP.toString().trim() === storedOTP.toString().trim();
}


module.exports = {
  encryptFile,
  decryptFile,
  encryptString,
  decryptString,
  generateEncryptionKey,
  generateOTP,
  verifyOTP
};