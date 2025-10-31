/**
 * 暗号化ユーティリティのテスト
 */

import { encryptFile, decryptFile, encryptString, decryptString, generateEncryptionKey } from './lib/encryption.js';

console.log('🔐 暗号化ユーティリティテスト開始\n');

// テスト1: ファイル暗号化・復号テスト
console.log('📁 テスト1: ファイル暗号化・復号');
const testFileData = Buffer.from('Hello, DataGate! これはテストファイルです。', 'utf8');
console.log('元のデータ:', testFileData.toString('utf8'));

try {
  // 暗号化
  const { encryptedData, salt, iv, authTag } = encryptFile(testFileData);
  console.log('✅ 暗号化成功:', encryptedData.length, 'bytes');
  console.log('   Salt:', salt.substring(0, 20) + '...');
  console.log('   IV:', iv.substring(0, 20) + '...');
  console.log('   AuthTag:', authTag.substring(0, 20) + '...');
  
  // 復号
  const decryptedData = decryptFile(encryptedData, salt, iv, authTag);
  console.log('✅ 復号成功:', decryptedData.toString('utf8'));
  
  // 検証
  if (testFileData.equals(decryptedData)) {
    console.log('✅ テスト1: 成功 - 元のデータと一致\n');
  } else {
    console.log('❌ テスト1: 失敗 - データが一致しません\n');
  }
} catch (error) {
  console.error('❌ テスト1: エラー -', error.message, '\n');
}

// テスト2: 文字列暗号化・復号テスト
console.log('📝 テスト2: 文字列暗号化・復号（メタデータ用）');
const testString = 'test-file.pdf';
console.log('元の文字列:', testString);

try {
  // 暗号化
  const encrypted = encryptString(testString);
  console.log('✅ 暗号化成功');
  console.log('   Encrypted:', encrypted.encrypted.substring(0, 20) + '...');
  
  // 復号
  const decryptedString = decryptString(
    encrypted.encrypted,
    encrypted.salt,
    encrypted.iv,
    encrypted.authTag
  );
  console.log('✅ 復号成功:', decryptedString);
  
  // 検証
  if (testString === decryptedString) {
    console.log('✅ テスト2: 成功 - 元の文字列と一致\n');
  } else {
    console.log('❌ テスト2: 失敗 - 文字列が一致しません\n');
  }
} catch (error) {
  console.error('❌ テスト2: エラー -', error.message, '\n');
}

// テスト3: 暗号化キー生成テスト
console.log('🔑 テスト3: 暗号化キー生成');
try {
  const newKey = generateEncryptionKey();
  console.log('✅ 新しい暗号化キー生成成功');
  console.log('   キー:', newKey);
  console.log('   長さ:', newKey.length, '文字（64文字であるべき）');
  
  if (newKey.length === 64) {
    console.log('✅ テスト3: 成功 - 正しい長さのキーが生成されました\n');
  } else {
    console.log('❌ テスト3: 失敗 - キーの長さが正しくありません\n');
  }
} catch (error) {
  console.error('❌ テスト3: エラー -', error.message, '\n');
}

console.log('🎉 すべてのテスト完了！');